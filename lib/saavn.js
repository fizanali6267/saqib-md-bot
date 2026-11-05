/**
 * lib/saavn.js — Permanent, FREE, cookie-free music source.
 *
 * Why this exists:
 *   YouTube now demands authenticated cookies from datacenter IPs and rotates
 *   them every few weeks, so any yt-dlp-only setup eventually breaks.
 *   JioSaavn's public web API needs NO API key, NO cookies and NO login, and
 *   serves full-length 320 kbps tracks. That makes it a genuinely permanent
 *   free fallback for `.song` / `.play` / `.ytmp3`.
 *
 * Notes:
 *   - The media URL is DES-encrypted. Single DES is disabled in OpenSSL 3,
 *     but 3DES (des-ede3) with the key repeated three times is mathematically
 *     identical to single DES and is still in the default provider, so we can
 *     decrypt without any --openssl-legacy-provider flag.
 *   - The decrypted URL points at a _96.mp4 (AAC). Bumping to _320.mp4 gives
 *     the 320 kbps version when the track has one.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');

const DES_KEY = Buffer.from('383465913834659138346591', 'utf8'); // "38346591" x3
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Public JioSaavn web endpoints (no key required). Tried in order.
const API_HOSTS = [
  'https://www.jiosaavn.com/api.php',
  'https://www.jiosaavn.com/api.php'
];

function decryptMediaUrl(encrypted) {
  if (!encrypted) return null;
  try {
    const decipher = crypto.createDecipheriv('des-ede3', DES_KEY, null);
    decipher.setAutoPadding(true);
    let out = decipher.update(String(encrypted), 'base64', 'utf8');
    out += decipher.final('utf8');
    return out;
  } catch (_) {
    return null;
  }
}

function pickUrl(moreInfo) {
  const enc = moreInfo && (moreInfo.encrypted_media_url || moreInfo.encrypted_drm_media_url);
  const plain = decryptMediaUrl(enc);
  if (!plain) return null;
  // Prefer 320 kbps when the track advertises it.
  if (String(moreInfo['320kbps']).toLowerCase() === 'true') {
    return plain.replace(/_96\.mp4$/, '_320.mp4');
  }
  return plain;
}

function cleanText(s) {
  if (!s) return '';
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalise(song) {
  const mi = song.more_info || {};
  const url = pickUrl(mi);
  if (!url) return null;
  return {
    id: song.id,
    title: cleanText(song.title),
    artist: cleanText(song.subtitle || mi.music || ''),
    album: cleanText(mi.album || ''),
    duration: Number(mi.duration) || 0,
    year: song.year || '',
    language: song.language || '',
    image: String(song.image || '').replace('150x150', '500x500'),
    quality: String(mi['320kbps']).toLowerCase() === 'true' ? '320kbps' : '96kbps',
    url: url
  };
}

async function callApi(params, timeoutMs) {
  let lastErr = null;
  for (const host of API_HOSTS) {
    try {
      const res = await axios.get(host, {
        params: params,
        timeout: timeoutMs || 20000,
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        validateStatus: () => true
      });
      if (res.status === 200 && res.data && typeof res.data === 'object') return res.data;
      lastErr = new Error('HTTP ' + res.status);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Saavn API unreachable');
}

/**
 * Search JioSaavn for songs.
 * @returns {Promise<{ok:boolean, results:Array, error?:string}>}
 */
async function searchSongs(query, limit) {
  const n = Math.max(1, Math.min(Number(limit) || 10, 25));
  try {
    const data = await callApi({
      __call: 'search.getResults',
      q: query,
      _format: 'json',
      _marker: '0',
      api_version: '4',
      ctx: 'web6dot0',
      n: String(n),
      p: '1'
    });
    const list = Array.isArray(data.results) ? data.results : [];
    const results = list.map(normalise).filter(Boolean);
    if (!results.length) return { ok: false, results: [], error: 'No results found.' };
    return { ok: true, results: results };
  } catch (e) {
    return { ok: false, results: [], error: e && e.message ? e.message : String(e) };
  }
}

async function fetchToFile(url, destFile, timeoutMs) {
  const res = await axios.get(url, {
    responseType: 'stream',
    timeout: timeoutMs || 120000,
    maxRedirects: 5,
    headers: { 'User-Agent': UA, Referer: 'https://www.jiosaavn.com/' },
    validateStatus: () => true
  });
  if (res.status !== 200) throw new Error('CDN HTTP ' + res.status);
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(destFile);
    res.data.pipe(out);
    res.data.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
  });
  const st = fs.statSync(destFile);
  if (!st.size || st.size < 20000) throw new Error('Downloaded file too small');
  return st.size;
}

/**
 * Download a song by free-text query.
 * @returns {Promise<{ok:boolean, file?:string, dir?:string, title?:string,
 *                    artist?:string, image?:string, quality?:string, error?:string}>}
 */
async function downloadSong(query, options) {
  const opts = options || {};
  const search = await searchSongs(query, opts.limit || 8);
  if (!search.ok) return { ok: false, error: search.error || 'Song not found.' };

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'saavn_'));
  let lastErr = 'Download failed.';

  for (const song of search.results) {
    const base = path.join(dir, String(song.title || 'song').replace(/[^\w\s.-]/g, '').slice(0, 90) || 'song');
    const m4a = base + '.m4a';
    try {
      await fetchToFile(song.url, m4a, 120000);
      return {
        ok: true,
        file: m4a,
        dir: dir,
        title: song.title,
        artist: song.artist,
        image: song.image,
        quality: song.quality,
        duration: song.duration,
        source: 'jiosaavn'
      };
    } catch (e) {
      lastErr = e && e.message ? e.message : String(e);
      try { fs.unlinkSync(m4a); } catch (_) {}
    }
  }

  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  return { ok: false, error: lastErr };
}

function cleanupDir(dir) {
  if (!dir) return;
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

module.exports = {
  searchSongs: searchSongs,
  downloadSong: downloadSong,
  decryptMediaUrl: decryptMediaUrl,
  cleanupDir: cleanupDir
};
