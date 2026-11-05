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
    plays: Number(song.play_count) || 0,
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

/**
 * Rank search results so the most likely "real" song comes first.
 * JioSaavn often returns instrumental/cover versions before the original,
 * which made `.song Shape of You` send an instrumental track.
 */
const norm = (s) => String(s || '')
  .toLowerCase()
  .replace(/&quot;|&#039;|&amp;/g, ' ')
  .replace(/[^\w\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Words that almost always mean "this is not the studio version".
const BAD_VERSION_WORDS = /\b(covers?|karaokes?|instrumentals?|8d|slowed|reverb|nightcore|ringtones?|tributes?|mashups?|made famous|originally performed|in the style of|sped up|speed up|bass boosted)\b/;

// Language preference: JioSaavn is strongest in South-Asian + English catalogues.
const LANG_SCORE = {
  english: 12, hindi: 12, urdu: 12, punjabi: 10,
  bengali: 6, marathi: 6, gujarati: 6, malayalam: 4, kannada: 4, tamil: 4, telugu: 4,
  bhojpuri: 2, haryanvi: 2, rajasthani: 2, assamese: 2, oriya: 2
};

function scoreSong(song, query, artistHint) {
  const q = norm(query);
  const title = norm(song.title);
  const artist = norm(song.artist);
  const album = norm(song.album);
  const blob = title + ' ' + artist + ' ' + album;
  const artistBlob = artist + ' ' + album;
  const language = String(song.language || '').toLowerCase();
  const qWords = q.split(' ').filter((w) => w.length > 1);
  const wantsVersion = BAD_VERSION_WORDS.test(q);
  let score = 0;

  if (title === q) score += 150;
  else if (title.includes(q)) score += 90;
  else if (q.includes(title) && title.length > 3) score += 70;
  else score += qWords.filter((w) => title.includes(w)).length * 14;

  if (artist && q.includes(artist)) score += 25;
  if (qWords.some((w) => artist.includes(w))) score += 15;

  // Cross-check against the canonical artist(s) from iTunes. JioSaavn is full
  // of regional covers, so a matching artist is a huge signal and a mismatched
  // artist on a low-play track is almost certainly a cover.
  const hints = Array.isArray(artistHint) ? artistHint : (artistHint ? [artistHint] : []);
  if (hints.length) {
    let matched = false;
    for (const hint of hints) {
      const ca = norm(hint);
      if (!ca) continue;
      const words = ca.split(' ').filter((w) => w.length > 3 && !['and', 'the', 'feat', 'ft', 'with', 'music', 'official', 'records'].includes(w));
      if (artistBlob.includes(ca) || words.some((w) => artistBlob.includes(w))) { matched = true; break; }
    }
    if (matched) score += 80;
    else if ((song.plays || 0) < 1000000) score -= 60;
  }

  // Instrumental / cover / karaoke versions are almost never what was asked
  // for. Check title + artist + album, because covers often hide the word
  // "cover" in the album name (e.g. "AiSh: The Covers Collection").
  if (language === 'instrumental') score -= 120;
  if (!wantsVersion) {
    if (BAD_VERSION_WORDS.test(blob)) score -= 100;
    if (/\b(remix|flip|bootleg|refix|dub)\b/.test(blob)) score -= 40;
  }

  // Prefer the original language over random regional covers.
  score += LANG_SCORE[language] || 0;

  // Popularity signal — the real track is nearly always the most played.
  if (song.plays > 0) score += Math.min(45, Math.log10(song.plays + 1) * 9);

  // Longer tracks are usually the full song, not a 30s snippet.
  if (song.duration >= 120) score += 10;
  else if (song.duration > 0 && song.duration < 60) score -= 30;

  if (song.quality === '320kbps') score += 5;
  return score;
}

function rankSongs(results, query, artistHint) {
  return results.slice().sort((a, b) => scoreSong(b, query, artistHint) - scoreSong(a, query, artistHint));
}

/**
 * Is the best JioSaavn hit actually the song the user asked for?
 * Used to decide whether to fall back to SoundCloud (which has the Western
 * masters JioSaavn does not license).
 */
function isStrongMatch(song, query, canonArtist) {
  if (!song) return false;
  const q = norm(query);
  const title = norm(song.title);
  const artistBlob = norm(song.artist) + ' ' + norm(song.album);
  const blob = title + ' ' + artistBlob;
  const language = String(song.language || '').toLowerCase();
  const wantsVersion = BAD_VERSION_WORDS.test(q);

  if (!q || !title) return false;
  if (language === 'instrumental') return false;
  if (!wantsVersion && BAD_VERSION_WORDS.test(blob)) return false;

  // ---- Title relevance (WHOLE-WORD matching) -----------------------------
  // The old check used `title.includes(q)`, so the query "shasha" matched
  // "Ashutosh **Shasha**nk Shekhar" and the bot happily sent the wrong song.
  // We now compare whole words only, and ignore filler words the user typed
  // ("by", "song", "official", "lyrics", ...) so "4 mababe by sane wave" can
  // still match a track titled just "Mababe" by "Sane Wave".
  const FILLER = new Set([
    'by', 'the', 'a', 'an', 'of', 'and', 'ft', 'feat', 'featuring', 'with',
    'song', 'songs', 'music', 'audio', 'video', 'official', 'lyrics', 'lyric',
    'full', 'new', 'latest', 'mp3', 'download', 'please', 'plz', 'remix'
  ]);
  const words = (s) => String(s || '').split(/[^a-z0-9]+/).filter(Boolean);
  const titleWords = words(title);
  const blobWords = new Set(words(blob));
  const qWords = words(q).filter((w) => w.length > 1 && !FILLER.has(w));

  // Whole-word containment: does `haystackWords` contain `needle` as a word?
  const hasWord = (haystackWords, needle) => haystackWords.includes(needle);

  let titleOk = false;
  if (title === q) {
    titleOk = true;
  } else if (qWords.length) {
    // Every meaningful query word must appear somewhere in title/artist/album...
    const allPresent = qWords.every((w) => blobWords.has(w));
    // ...and at least one of them must appear in the TITLE itself, so we never
    // match a completely different song that merely shares the artist.
    const inTitle = qWords.some((w) => hasWord(titleWords, w));
    titleOk = allPresent && inTitle;
  }

  if (!titleOk) return false;

  // Cross-check the artist against the canonical iTunes metadata. JioSaavn is
  // full of regional covers by unknown artists, so if the artist does not match
  // AND the track is not demonstrably popular, assume it is a cover and let the
  // caller fall back to SoundCloud (which has the real masters).
  if (canonArtist) {
    const hints = Array.isArray(canonArtist) ? canonArtist : [canonArtist];
    let overlap = false;
    for (const hint of hints) {
      const ca = norm(hint);
      const caWords = ca.split(' ').filter((w) => w.length > 3 && !['and', 'the', 'feat', 'ft', 'with', 'music', 'official', 'records'].includes(w));
      if (artistBlob.includes(ca) || caWords.some((w) => artistBlob.includes(w))) { overlap = true; break; }
    }
    if (!overlap && (song.plays || 0) < 200000) return false;
  }

  return true;
}

async function fetchToFile(url, destFile, timeoutMs) {  const res = await axios.get(url, {
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

  for (const song of rankSongs(search.results, query, opts.artistHint)) {
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
  cleanupDir: cleanupDir,
  rankSongs: rankSongs,
  scoreSong: scoreSong,
  isStrongMatch: isStrongMatch
};
