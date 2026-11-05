const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

/**
 * yt-dlp wrapper with a client fallback ladder.
 *
 * YouTube's anti-bot behaviour varies per IP and per video: a client that works
 * for one request can return "Sign in to confirm you're not a bot" or an empty
 * format list for the next. Instead of betting on a single player client we try
 * a short ladder and keep the first attempt that actually yields media.
 *
 * Cookies are optional and resolved in this order:
 *   1. YT_COOKIES env var       - raw Netscape cookies.txt content, or base64 of it
 *   2. YT_COOKIES_PATH          - explicit path to a cookies.txt file
 *   3. /app/session/cookies.txt - persistent Railway volume location
 */

const VOLUME_COOKIE_PATH = path.join(__dirname, '..', 'session', 'cookies.txt');

// The default client (with EJS challenge solving) is the most reliable.
// The rest are fallbacks for when YouTube changes something.
const CLIENT_LADDER = ['', 'web', 'tv', 'web_safari', 'mweb', 'android'];

// PO Token provider (bgutil). Proves "not a bot" via BotGuard, which is what
// actually gets past YouTube's datacenter-IP block. Runs as a sibling Railway
// service reachable over the private network.
const POT_BASE_URL = process.env.YT_POT_BASE_URL || 'http://pot-provider.railway.internal:4416';

function resolveCookieFile() {
  if (process.env.YT_COOKIES_PATH && fs.existsSync(process.env.YT_COOKIES_PATH)) {
    return process.env.YT_COOKIES_PATH;
  }
  if (fs.existsSync(VOLUME_COOKIE_PATH)) {
    return VOLUME_COOKIE_PATH;
  }
  const raw = process.env.YT_COOKIES;
  if (raw && raw.trim()) {
    try {
      const tmp = path.join(os.tmpdir(), 'yt_cookies.txt');
      let content = raw;
      // Accept base64-encoded cookies so the value survives env var quirks.
      if (!/^# (Netscape|HTTP Cookie File)/m.test(content) && /^[A-Za-z0-9+/=\s]+$/.test(content.slice(0, 200))) {
        try {
          const decoded = Buffer.from(content, 'base64').toString('utf8');
          if (decoded.includes('\t')) content = decoded;
        } catch (_) {}
      }
      content = content.replace(/\\n/g, '\n');
      fs.writeFileSync(tmp, content, { mode: 0o600 });
      return tmp;
    } catch (_) {
      return null;
    }
  }
  return null;
}

function baseArgs(client, withCookies) {
  const args = [
    '--no-playlist',
    '--no-warnings',
    '--no-progress',
    '--ignore-errors',
    '--socket-timeout', '20',
    '--retries', '2',
    // yt-dlp 2025+ needs a JS runtime to solve YouTube's signature and
    // n-challenge. Without this only storyboard images are returned.
    '--js-runtimes', 'node'
  ];
  if (client) args.push('--extractor-args', 'youtube:player_client=' + client);
  if (POT_BASE_URL) args.push('--extractor-args', 'youtubepot-bgutilhttp:base_url=' + POT_BASE_URL);
  if (withCookies) {
    const cookies = resolveCookieFile();
    if (cookies) args.push('--cookies', cookies);
  }
  return args;
}

function run(args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_) {}
    }, timeoutMs || 180000);

    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code, stdout: out, stderr: err });
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout: out, stderr: String(e && e.message ? e.message : e) });
    });
  });
}

/** Turn a free-text query into a YouTube search; pass URLs through untouched. */
function toTarget(input) {
  const q = String(input || '').trim();
  if (/^https?:\/\//i.test(q)) return q;
  return 'ytsearch1:' + q;
}

function isBotWall(stderr) {
  return /Sign in to confirm you.{0,5}re not a bot|confirm your age|Requested format is not available|The page needs to be reloaded|Only images are available/i.test(String(stderr || ''));
}

/**
 * Try the ladder until one attempt produces a usable file.
 * `buildArgs(client, withCookies)` must return yt-dlp args including output template.
 */
async function attemptLadder(buildArgs, timeoutMs) {
  const cookies = resolveCookieFile();
  const attempts = [];
  for (const client of CLIENT_LADDER) {
    if (cookies) attempts.push({ client: client, cookies: true });
    attempts.push({ client: client, cookies: false });
  }

  let lastErr = 'Download failed.';
  for (const a of attempts) {
    const args = buildArgs(a.client, a.cookies);
    const res = await run(args, timeoutMs);
    const file = res.stdout.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).pop();
    if (res.code === 0 && file && fs.existsSync(file)) {
      return { ok: true, file: file, client: a.client || 'default', cookies: a.cookies };
    }
    if (res.stderr) lastErr = cleanError(res.stderr);
    // Hard failures (private/removed video) won't be fixed by another client.
    if (/Video unavailable|This video is private|removed by the uploader|Unsupported URL/i.test(res.stderr || '')) break;
  }
  return { ok: false, error: lastErr };
}

async function getInfo(input) {
  const target = toTarget(input);
  const hasCookies = Boolean(resolveCookieFile());
  let lastErr = 'Could not fetch video info.';
  for (const client of CLIENT_LADDER) {
    for (const withCookies of hasCookies ? [true, false] : [false]) {
      const args = baseArgs(client, withCookies).concat(['--dump-single-json', '--skip-download', target]);
      const res = await run(args, 90000);
      if (res.code === 0 && res.stdout.trim()) {
        try {
          const data = JSON.parse(res.stdout);
          const entry = data.entries ? data.entries[0] : data;
          if (entry && entry.title) {
            return {
              ok: true,
              id: entry.id,
              title: entry.title,
              duration: entry.duration,
              thumbnail: entry.thumbnail,
              uploader: entry.uploader,
              webpage_url: entry.webpage_url,
              ext: entry.ext
            };
          }
        } catch (_) {}
      }
      if (res.stderr) lastErr = cleanError(res.stderr);
      if (/Video unavailable|This video is private|removed by the uploader|Unsupported URL/i.test(res.stderr || '')) {
        return { ok: false, error: lastErr };
      }
    }
  }
  return { ok: false, error: lastErr };
}

async function downloadAudio(input, options) {
  const opts = options || {};
  const bitrate = opts.bitrate || '128';
  const target = toTarget(input);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt_audio_'));

  const result = await attemptLadder(function (client, withCookies) {
    return baseArgs(client, withCookies).concat([
      '-f', 'bestaudio/best',
      '-x', '--audio-format', 'mp3',
      '--audio-quality', bitrate + 'K',
      '--embed-thumbnail',
      '--add-metadata',
      '-o', path.join(dir, '%(title).120B.%(ext)s'),
      '--print', 'after_move:filepath',
      target
    ]);
  }, 240000);

  if (!result.ok) {
    cleanupDir(dir);
    return { ok: false, error: result.error };
  }
  return {
    ok: true,
    file: result.file,
    dir: dir,
    client: result.client,
    cookies: result.cookies,
    title: path.basename(result.file).replace(/\.mp3$/i, '')
  };
}

async function downloadVideo(input, options) {
  const opts = options || {};
  const height = opts.height || 480;
  const target = toTarget(input);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt_video_'));

  const result = await attemptLadder(function (client, withCookies) {
    return baseArgs(client, withCookies).concat([
      '-f', 'bestvideo[height<=' + height + '][ext=mp4]+bestaudio[ext=m4a]/best[height<=' + height + '][ext=mp4]/best[height<=' + height + ']',
      '--merge-output-format', 'mp4',
      '--embed-thumbnail',
      '--add-metadata',
      '-o', path.join(dir, '%(title).120B.%(ext)s'),
      '--print', 'after_move:filepath',
      target
    ]);
  }, 360000);

  if (!result.ok) {
    cleanupDir(dir);
    return { ok: false, error: result.error };
  }
  return {
    ok: true,
    file: result.file,
    dir: dir,
    client: result.client,
    cookies: result.cookies,
    title: path.basename(result.file).replace(/\.mp4$/i, '')
  };
}

function cleanupDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

/** Map yt-dlp noise into something a WhatsApp user can actually read. */
function cleanError(stderr) {
  const s = String(stderr || '');
  if (/Sign in to confirm you.{0,5}re not a bot|confirm your age/i.test(s)) {
    return 'YouTube is blocking this server. Please try again in a minute, or ask the owner to refresh cookies.';
  }
  if (/Video unavailable|This video is private|removed by the uploader/i.test(s)) {
    return 'That video is unavailable or private.';
  }
  if (/is not a valid URL|Unsupported URL/i.test(s)) {
    return 'Unsupported link. Please send a YouTube link or a song name.';
  }
  if (/timed out|Timeout/i.test(s)) {
    return 'Download timed out. Please try again.';
  }
  if (/Requested format is not available|Only images are available/i.test(s)) {
    return 'YouTube did not return a downloadable stream for this video. Try another song or link.';
  }
  const line = s.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l.indexOf('ERROR:') === 0; }).pop();
  return (line ? line.replace(/^ERROR:\s*/, '') : 'Download failed.').slice(0, 220);
}

function cookiesAvailable() {
  return Boolean(resolveCookieFile());
}

module.exports = {
  getInfo: getInfo,
  downloadAudio: downloadAudio,
  downloadVideo: downloadVideo,
  cleanupDir: cleanupDir,
  cookiesAvailable: cookiesAvailable,
  resolveCookieFile: resolveCookieFile,
  CLIENT_LADDER: CLIENT_LADDER
};
