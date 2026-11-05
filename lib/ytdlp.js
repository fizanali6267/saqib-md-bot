const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

/**
 * Thin yt-dlp wrapper.
 *
 * Why this exists: the previous .song/.video implementation depended on three
 * public "downloader" APIs which are all dead (DNS gone / 302 to nothing).
 * yt-dlp is the only reliable path, but YouTube now demands cookies for
 * datacenter IPs ("Sign in to confirm you're not a bot"), so we support
 * cookies from three places, in priority order:
 *
 *   1. YT_COOKIES env var       - raw Netscape cookies.txt content, or base64 of it
 *   2. YT_COOKIES_PATH          - explicit path to a cookies.txt file
 *   3. /app/session/cookies.txt - persistent Railway volume location
 */

const VOLUME_COOKIE_PATH = path.join(__dirname, '..', 'session', 'cookies.txt');

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

function baseArgs() {
  const args = [
    '--no-playlist',
    '--no-warnings',
    '--no-progress',
    '--ignore-errors',
    '--socket-timeout', '20',
    '--retries', '3',
    '--extractor-args', 'youtube:player_client=android,web_safari,tv'
  ];
  const cookies = resolveCookieFile();
  if (cookies) args.push('--cookies', cookies);
  return args;
}

function run(args, timeoutMs = 180000) {
  return new Promise((resolve) => {
    const child = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_) {}
    }, timeoutMs);

    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: out, stderr: err });
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout: out, stderr: String(e && e.message ? e.message : e) });
    });
  });
}

/** Turn a free-text query into a YouTube search URL; pass URLs through untouched. */
function toTarget(input) {
  const q = String(input || '').trim();
  if (/^https?:\/\//i.test(q)) return q;
  return `ytsearch1:${q}`;
}

async function getInfo(input) {
  const args = [...baseArgs(), '--dump-single-json', '--skip-download', toTarget(input)];
  const { code, stdout, stderr } = await run(args, 90000);
  if (code !== 0 || !stdout.trim()) {
    return { ok: false, error: cleanError(stderr) };
  }
  try {
    const data = JSON.parse(stdout);
    const entry = data.entries ? data.entries[0] : data;
    if (!entry) return { ok: false, error: 'No results found.' };
    return {
      ok: true,
      id: entry.id,
      title: entry.title,
      duration: entry.duration,
      thumbnail: entry.thumbnail,
      uploader: entry.uploader,
      webpage_url: entry.webpage_url,
      url: entry.url,
      ext: entry.ext
    };
  } catch (e) {
    return { ok: false, error: 'Could not parse yt-dlp output.' };
  }
}

async function downloadAudio(input, options) {
  const opts = options || {};
  const bitrate = opts.bitrate || '128';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt_audio_'));
  const args = [
    ...baseArgs(),
    '-f', 'bestaudio/best',
    '-x', '--audio-format', 'mp3',
    '--audio-quality', bitrate + 'K',
    '--embed-thumbnail',
    '--add-metadata',
    '-o', path.join(dir, '%(title).120B.%(ext)s'),
    '--print', 'after_move:filepath',
    toTarget(input)
  ];
  const { code, stdout, stderr } = await run(args, 300000);
  const file = stdout.split('\n').map((s) => s.trim()).filter(Boolean).pop();
  if (code !== 0 || !file || !fs.existsSync(file)) {
    cleanupDir(dir);
    return { ok: false, error: cleanError(stderr) };
  }
  return { ok: true, file: file, dir: dir, title: path.basename(file).replace(/\.mp3$/i, '') };
}

async function downloadVideo(input, options) {
  const opts = options || {};
  const height = opts.height || 480;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt_video_'));
  const args = [
    ...baseArgs(),
    '-f', 'bestvideo[height<=' + height + '][ext=mp4]+bestaudio[ext=m4a]/best[height<=' + height + '][ext=mp4]/best[height<=' + height + ']',
    '--merge-output-format', 'mp4',
    '--embed-thumbnail',
    '--add-metadata',
    '-o', path.join(dir, '%(title).120B.%(ext)s'),
    '--print', 'after_move:filepath',
    toTarget(input)
  ];
  const { code, stdout, stderr } = await run(args, 420000);
  const file = stdout.split('\n').map((s) => s.trim()).filter(Boolean).pop();
  if (code !== 0 || !file || !fs.existsSync(file)) {
    cleanupDir(dir);
    return { ok: false, error: cleanError(stderr) };
  }
  return { ok: true, file: file, dir: dir, title: path.basename(file).replace(/\.mp4$/i, '') };
}

function cleanupDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

/** Map yt-dlp noise into something a WhatsApp user can actually read. */
function cleanError(stderr) {
  const s = String(stderr || '');
  if (/Sign in to confirm you.{0,5}re not a bot|confirm your age/i.test(s)) {
    return 'YouTube is asking for sign-in verification. Bot owner needs to refresh YT_COOKIES.';
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
  resolveCookieFile: resolveCookieFile
};
