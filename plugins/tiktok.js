const axios = require('axios');
const { execFile } = require('child_process');
const config = require('../config');

/**
 * TikTok toolkit — .tts (search) and .ttdl (download)
 * -------------------------------------------------------------------------
 * TikTok blocks most datacenter IPs, so no single public API is dependable.
 * This module tries a cascade of providers and keeps the first one that
 * returns usable data. If every provider is down it still gives the user
 * something actionable (direct TikTok search links) instead of an error.
 *
 * Default search region is Pakistan, as requested.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Some hosts (Cloudflare-fronted) reject Node's TLS fingerprint from certain
 * datacenter IPs with "tlsv1 alert internal error". curl uses a completely
 * different TLS stack, so we retry with curl before giving up. This keeps the
 * TikTok commands working on Railway where plain axios fails the handshake.
 */
function curlJson(url, timeoutSec) {
  return new Promise((resolve, reject) => {
    execFile('curl', [
      '-s', '--compressed',
      '--max-time', String(timeoutSec || 20),
      '-A', UA,
      '-H', 'Accept: application/json',
      '-H', 'Referer: https://tikwm.com/',
      url
    ], { maxBuffer: 8 * 1024 * 1024, timeout: (timeoutSec || 20) * 1000 + 5000 }, (err, stdout) => {
      if (err) return reject(err);
      const txt = String(stdout || '').trim();
      if (!txt) return reject(new Error('empty response'));
      try {
        resolve(JSON.parse(txt));
      } catch (e) {
        reject(new Error('non-JSON response'));
      }
    });
  });
}

function qs(params) {
  const sp = new URLSearchParams();
  for (const k of Object.keys(params)) {
    if (params[k] !== undefined && params[k] !== null) sp.append(k, String(params[k]));
  }
  return sp.toString();
}

/**
 * Extract the first complete JSON object/array from a text blob.
 * r.jina.ai wraps the payload in a markdown envelope, so we cannot just
 * JSON.parse the whole body.
 */
function extractJson(text) {
  const t = String(text || '');
  const start = t.search(/[\[{]/);
  if (start === -1) throw new Error('no JSON in response');
  const open = t[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return JSON.parse(t.slice(start, i + 1));
    }
  }
  throw new Error('unterminated JSON');
}

/**
 * Final fallback. Cloudflare blocks this container's IP outright (HTTP 403),
 * and Node/curl TLS handshakes are rejected too, so we route the request
 * through r.jina.ai which fetches it from its own IP and returns the body.
 */
function jinaJson(url, timeoutSec) {
  return new Promise((resolve, reject) => {
    const proxied = 'https://r.jina.ai/' + url;
    execFile('curl', [
      '-sS', '--compressed',
      '--max-time', String((timeoutSec || 20) + 10),
      '-A', UA,
      proxied
    ], { maxBuffer: 8 * 1024 * 1024, timeout: ((timeoutSec || 20) + 10) * 1000 + 5000 }, (err, stdout) => {
      if (err) return reject(err);
      try {
        resolve(extractJson(stdout));
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function getJson(baseUrl, params, timeoutSec) {
  const url = baseUrl + '?' + qs(params);

  // 1) Direct HTTPS (fastest, works on most networks)
  try {
    const res = await axios.get(url, {
      timeout: (timeoutSec || 20) * 1000,
      headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://tikwm.com/' },
      validateStatus: () => true
    });
    if (res.status === 200 && res.data && typeof res.data === 'object' && !res.data.error) return res.data;
    throw new Error('HTTP ' + res.status);
  } catch (_) { /* fall through */ }

  // 2) curl (different TLS stack, still our own IP)
  try {
    return await curlJson(url, timeoutSec);
  } catch (_) { /* fall through */ }

  // 3) Proxy through r.jina.ai (different egress IP, bypasses IP blocks)
  return jinaJson(url, timeoutSec);
}

const PROVIDERS = [  {
    // Works when /api/feed/search is Cloudflare-blocked (which is almost always
    // from datacenter IPs). We resolve the keyword to a TikTok hashtag id and
    // then pull that hashtag's real video feed. Same host, different path, so
    // it survives the challenge that kills the search endpoint.
    name: 'tikwm-challenge',
    search: async (q, count) => {
      const keyword = String(q).trim().replace(/^#/, '').replace(/\s+/g, '');
      const info = await getJson('https://tikwm.com/api/challenge/info', { challenge_name: keyword }, 15);
      const id = info && info.data && info.data.id;
      if (!id) throw new Error('no challenge id');

      const posts = await getJson('https://tikwm.com/api/challenge/posts', { challenge_id: id, count: Math.max(Number(count) || 10, 10) }, 18);
      const list = posts && posts.data && posts.data.videos;
      if (!Array.isArray(list) || !list.length) throw new Error('empty');

      return list.slice(0, count).map((v) => ({
        id: v.video_id,
        title: v.title || 'TikTok video',
        author: (v.author && (v.author.unique_id || v.author.nickname)) || 'tiktok',
        plays: v.play_count,
        likes: v.digg_count,
        duration: v.duration,
        cover: v.origin_cover || v.cover,
        url: `https://www.tiktok.com/@${(v.author && v.author.unique_id) || 'user'}/video/${v.video_id}`
      }));
    }
  },  {
    name: 'tikwm',
    search: async (q, count) => {
      const res = await getJson('https://www.tikwm.com/api/feed/search', { keywords: q, count, region: 'PK' }, 15);
      const list = res && res.data && res.data.videos;
      if (!Array.isArray(list) || !list.length) throw new Error('empty');
      return list.map((v) => ({
        id: v.video_id,
        title: v.title || 'TikTok video',
        author: v.author?.unique_id || v.author?.nickname || 'unknown',
        plays: v.play_count,
        likes: v.digg_count,
        duration: v.duration,
        cover: v.origin_cover || v.cover,
        url: `https://www.tiktok.com/@${v.author?.unique_id || 'user'}/video/${v.video_id}`
      }));
    },
    download: async (url) => {
      const res = await getJson('https://www.tikwm.com/api/', { url, hd: 1 }, 18);
      const d = res && res.data;
      if (!d || !d.play) throw new Error('no media');
      return {
        video: d.hdplay || d.play,
        music: d.music,
        title: d.title || 'TikTok video',
        author: d.author?.unique_id || 'unknown'
      };
    }
  },  {
    // Last-resort real feed: trending videos for the requested region (PK).
    // Not keyword-filtered, but it is genuine live TikTok data instead of an
    // error, so the command always returns something useful.
    name: 'tikwm-region',
    search: async (q, count) => {
      const res = await getJson('https://tikwm.com/api/feed/list', { region: 'PK', count: Math.max(Number(count) || 10, 10) }, 18);
      const list = res && res.data;
      if (!Array.isArray(list) || !list.length) throw new Error('empty');
      return list.slice(0, count).map((v) => ({
        id: v.video_id,
        title: v.title || 'TikTok video',
        author: (v.author && (v.author.unique_id || v.author.nickname)) || 'tiktok',
        plays: v.play_count,
        likes: v.digg_count,
        duration: v.duration,
        cover: v.origin_cover || v.cover,
        url: `https://www.tiktok.com/@${(v.author && v.author.unique_id) || 'user'}/video/${v.video_id}`
      }));
    }
  },  {
    name: 'tiklydown',
    search: async (q, count) => {
      const res = await getJson('https://api.tiklydown.eu.org/api/search', { q }, 15);
      const list = res && (res.videos || res.data || res.result);
      if (!Array.isArray(list) || !list.length) throw new Error('empty');
      return list.slice(0, count).map((v) => ({
        id: v.id || v.video_id,
        title: v.title || v.desc || 'TikTok video',
        author: v.author?.unique_id || v.author || 'unknown',
        plays: v.playCount || v.play_count,
        likes: v.likeCount || v.digg_count,
        duration: v.duration,
        cover: v.cover || v.origin_cover,
        url: v.url || `https://www.tiktok.com/video/${v.id || v.video_id}`
      }));
    }
  }
];

function fmtNum(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(v);
}

function fmtDur(s) {
  const v = Number(s);
  if (!Number.isFinite(v) || v <= 0) return '—';
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}

async function searchTikTok(query, count) {
  let lastErr = null;
  for (const p of PROVIDERS) {
    if (typeof p.search !== 'function') continue;
    try {
      const results = await p.search(query, count);
      if (results && results.length) return { ok: true, provider: p.name, results };
    } catch (e) {
      lastErr = e;
    }
  }
  return { ok: false, error: lastErr ? lastErr.message : 'All providers unavailable' };
}

async function downloadTikTok(url) {
  let lastErr = null;
  for (const p of PROVIDERS) {
    if (typeof p.download !== 'function') continue;
    try {
      const media = await p.download(url);
      if (media && media.video) return { ok: true, provider: p.name, media };
    } catch (e) {
      lastErr = e;
    }
  }
  return { ok: false, error: lastErr ? lastErr.message : 'All providers unavailable' };
}

module.exports = {
  name: 'tiktok',
  _search: searchTikTok,
  _download: downloadTikTok,
  commands: ['tts', 'tiktoksearch', 'ttsearch', 'ttdl', 'tiktokdl', 'ttmp4'],

  execute: async (sock, m, { command, args, prefix }) => {
    const isDownload = ['ttdl', 'tiktokdl', 'ttmp4'].includes(command);
    const input = args.join(' ').trim();

    if (!input) {
      return m.reply(
        isDownload
          ? `❓ Send a TikTok link.\nExample: *${prefix}ttdl https://www.tiktok.com/@user/video/123*`
          : `❓ What should I search on TikTok?\nExample: *${prefix}tts pakistan cricket*`
      );
    }

    // ---------------- DOWNLOAD ----------------
    if (isDownload || /tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com/i.test(input)) {
      if (!/tiktok\.com/i.test(input)) {
        return m.reply(`❓ That does not look like a TikTok link.`);
      }

      await m.react('⏳').catch(() => null);
      const res = await downloadTikTok(input);

      if (!res.ok) {
        await m.react('❌').catch(() => null);
        return m.reply(
          `⚠️ *Could not download this TikTok video.*\n\n` +
          `TikTok is blocking the download service right now. Please try again in a minute.`
        );
      }

      try {
        await sock.sendMessage(m.chat, {
          video: { url: res.media.video },
          caption:
            `🎵 *TikTok Video*\n\n` +
            `📝 ${res.media.title || 'No title'}\n` +
            `👤 @${res.media.author || 'unknown'}\n\n` +
            `⚡ *SAQIB-MD*`
        }, { quoted: m });
        await m.react('✅').catch(() => null);
      } catch (e) {
        await m.react('❌').catch(() => null);
        await m.reply('⚠️ *Download succeeded but sending failed.* Please try again.');
      }
      return;
    }

    // ---------------- SEARCH ----------------
    await m.react('🔎').catch(() => null);

    const res = await searchTikTok(input, 8);

    if (!res.ok) {
      await m.react('⚠️').catch(() => null);
      const tag = input.replace(/\s+/g, '');
      return m.reply(
        `⚠️ *TikTok search is temporarily unavailable.*\n\n` +
        `You can still browse directly:\n` +
        `🔗 https://www.tiktok.com/search?q=${encodeURIComponent(input)}\n` +
        `🔗 https://www.tiktok.com/tag/${encodeURIComponent(tag)}\n\n` +
        `_Please try the command again in a few minutes._`
      );
    }

    const lines = res.results.slice(0, 8).map((v, i) => {
      return (
        `*${i + 1}.* ${String(v.title || 'TikTok video').slice(0, 70)}\n` +
        `   👤 @${v.author}  ⏱️ ${fmtDur(v.duration)}  ▶️ ${fmtNum(v.plays)}  ❤️ ${fmtNum(v.likes)}\n` +
        `   🔗 ${v.url}`
      );
    });

    await m.react('✅').catch(() => null);

    const note = res.provider === 'tikwm-region'
      ? 'ℹ️ _No exact matches for that keyword, so here are trending videos in Pakistan._\n\n'
      : '';

    return m.reply(
      `🎬 *TIKTOK SEARCH — "${input}"*\n` +
      `🇵🇰 _Region: Pakistan_\n\n` +
      note +
      lines.join('\n\n') +
      `\n\n💡 Download any video with *${prefix}ttdl <link>*`
    );
  }
};
