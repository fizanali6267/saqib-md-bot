'use strict';
/**
 * lib/soundcloud.js — worldwide music source (no API key, no cookies).
 *
 * Why this exists:
 *   JioSaavn is excellent for Pakistani / Indian music but does NOT license
 *   many Western masters (e.g. Ed Sheeran's "Shape of You" only exists there
 *   as instrumental covers). YouTube is hard-blocked from datacenter IPs even
 *   with a PO-token provider. SoundCloud, however, hosts the *official*
 *   uploads for a huge share of worldwide releases and streams fine from
 *   datacenter IPs.
 *
 * How it works:
 *   1. Scrape a public `client_id` from SoundCloud's own web player bundle
 *      (cached for 12h, with hard-coded fallbacks).
 *   2. `search/tracks` for the query, then rank results so the real studio
 *      version beats remixes / covers / slowed+reverb edits.
 *   3. Resolve the track's HLS stream and either:
 *        - concatenate the fragmented-MP4 segments into a .m4a (no ffmpeg), or
 *        - hand the m3u8 to ffmpeg when segments are MPEG-TS.
 *
 * Everything here is free and needs no account.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const axios = require('axios');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Public client ids harvested from SoundCloud's web player. The scraper below
// refreshes these, but keeping a few known-good ones makes the first call fast
// and survives a temporary scrape failure.
const FALLBACK_CLIENT_IDS = [
  '8UvlHph8Fhze3ZixMeSkFXj4Dwkblsjt',
  'a3e059563d7fd3372b49b37f00a00bcf',
  'iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX'
];

let cachedClientId = null;
let cachedAt = 0;
const CLIENT_ID_TTL = 12 * 60 * 60 * 1000; // 12 hours

function httpGet(url, opts) {
  return axios.get(url, Object.assign({
    timeout: 20000,
    headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*' },
    validateStatus: () => true
  }, opts || {}));
}

/** Scrape a fresh client_id from SoundCloud's player bundle. */
async function scrapeClientId() {
  const home = await httpGet('https://soundcloud.com/', { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  const html = typeof home.data === 'string' ? home.data : '';
  const assets = Array.from(new Set(
    (html.match(/https:\/\/a-v2\.sndcdn\.com\/assets\/[0-9a-z-]+\.js/g) || [])
  )).slice(0, 12);

  for (const asset of assets) {
    try {
      const js = await httpGet(asset, { headers: { 'User-Agent': UA, Accept: '*/*' } });
      const body = typeof js.data === 'string' ? js.data : '';
      const m = body.match(/client_id\s*[=:]\s*["']([A-Za-z0-9]{32})["']/);
      if (m) return m[1];
    } catch (_) { /* try next asset */ }
  }
  return null;
}

async function getClientId(force) {
  if (!force && cachedClientId && Date.now() - cachedAt < CLIENT_ID_TTL) return cachedClientId;
  let id = null;
  try { id = await scrapeClientId(); } catch (_) { id = null; }
  if (!id) id = FALLBACK_CLIENT_IDS[0];
  cachedClientId = id;
  cachedAt = Date.now();
  return id;
}

async function apiGet(pathAndQuery, tries) {
  const max = tries || 3;
  let lastErr = null;
  for (let i = 0; i < max; i++) {
    const cid = await getClientId(i > 0);
    const sep = pathAndQuery.includes('?') ? '&' : '?';
    const url = 'https://api-v2.soundcloud.com' + pathAndQuery + sep + 'client_id=' + cid;
    try {
      const res = await httpGet(url);
      if (res.status === 200 && res.data && typeof res.data === 'object') return res.data;
      if (res.status === 401 || res.status === 403) { cachedClientId = null; continue; }
      lastErr = new Error('HTTP ' + res.status);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('SoundCloud API unreachable');
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9\u0600-\u06ff\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Turn a raw SoundCloud track into a small, stable shape. */
function normalise(track) {
  if (!track || !track.id) return null;
  const media = track.media || {};
  const transcodings = Array.isArray(media.transcodings) ? media.transcodings : [];
  if (!transcodings.length) return null;
  return {
    id: track.id,
    title: String(track.title || '').trim(),
    artist: String((track.user && track.user.username) || '').trim(),
    duration: Math.round((Number(track.duration) || 0) / 1000),
    plays: Number(track.playback_count) || 0,
    likes: Number(track.likes_count) || 0,
    policy: String(track.policy || ''),
    permalink: track.permalink_url || '',
    artwork: track.artwork_url || (track.user && track.user.avatar_url) || '',
    downloadable: !!track.downloadable,
    // Major-label uploads are often DRM ("*-encrypted-hls") and cannot be
    // fetched without SoundCloud's own player keys. Flag those up-front so the
    // ranker can avoid them instead of wasting a request on a 404.
    playable: transcodings.some((t) => t && t.url && !/encrypted/i.test(t.url)),
    transcodings: transcodings
  };
}

async function searchTracks(query, limit) {
  const n = Math.max(1, Math.min(Number(limit) || 10, 25));
  try {
    const data = await apiGet('/search/tracks?q=' + encodeURIComponent(query) + '&limit=' + n + '&linked_partitioning=0');
    const list = Array.isArray(data.collection) ? data.collection : [];
    const results = list.map(normalise).filter(Boolean);
    if (!results.length) return { ok: false, results: [], error: 'No results found.' };
    return { ok: true, results: results };
  } catch (e) {
    return { ok: false, results: [], error: e && e.message ? e.message : String(e) };
  }
}

const BAD_VERSION_WORDS = /\b(cover|karaoke|instrumental|8d|slowed|reverb|nightcore|ringtone|tribute|mashup|medley|lofi|lo fi|trap|beats|remake|rework|sped up|speed up|chipmunk|bass boosted|edit|loop|teaser|preview|snippet)\b/;

/**
 * Score a SoundCloud track against the user's query.
 * Higher = more likely the actual song the user wants.
 */
function scoreTrack(track, query, artistHint) {
  const q = norm(query);
  const title = norm(track.title);
  const artist = norm(track.artist);
  const blob = title + ' ' + artist;
  const qWords = q.split(' ').filter((w) => w.length > 1);
  const wantsVersion = BAD_VERSION_WORDS.test(q);
  let score = 0;

  if (title === q) score += 150;
  else if (title.includes(q)) score += 90;
  else if (q.includes(title) && title.length > 3) score += 70;
  else {
    const hits = qWords.filter((w) => title.includes(w)).length;
    score += hits * 14;
  }

  // Artist match is a very strong signal (official uploads use artist name).
  const artistMatches = matchArtist(blob, artistHint);
  if (artistMatches) score += 90;
  // If we know the real artist and this upload is by someone else entirely,
  // it is a cover / re-upload — heavily deprioritise it.
  else if (artistHint && (Array.isArray(artistHint) ? artistHint.length : artistHint)) score -= 70;
  if (qWords.some((w) => artist.includes(w))) score += 25;

  // "A / B / C" titles are mashups, not the song the user asked for.
  if (track.title.includes('/') && !q.includes('/')) score -= 45;

  // DRM-only uploads can never be downloaded — push them to the very bottom.
  if (!track.playable) score -= 300;

  // Kill the noise that plagues SoundCloud search.
  if (!wantsVersion) {
    if (BAD_VERSION_WORDS.test(blob)) score -= 90;
    if (/\b(remix|flip|bootleg|refix|dub)\b/.test(blob)) score -= 70;
  }

  // Popularity: log-scaled, capped so one viral upload can't dominate.
  if (track.plays > 0) score += Math.min(45, Math.log10(track.plays + 1) * 9);
  if (track.likes > 0) score += Math.min(10, Math.log10(track.likes + 1) * 2);

  // Real songs are 1:30–8:00. Reject snippets and hour-long DJ sets.
  if (track.duration >= 90 && track.duration <= 480) score += 12;
  else if (track.duration < 60) score -= 40;
  else if (track.duration > 900) score -= 50;

  // Official / monetised uploads are the studio master.
  if (track.policy === 'MONETIZE') score += 20;
  // SNIP = 30-second preview only, never a full song.
  if (track.policy === 'SNIP' || track.duration <= 45) score -= 150;
  if (track.downloadable) score += 3;

  return score;
}

function rankTracks(results, query, artistHint) {
  return results.slice().sort((a, b) => scoreTrack(b, query, artistHint) - scoreTrack(a, query, artistHint));
}

/**
 * Ask the iTunes catalogue what the canonical "Artist — Title" for a free-text
 * query is. This is metadata only (no audio), and it makes SoundCloud search
 * far more accurate because we can search "artist title" instead of a guess.
 */
async function canonicalize(query) {
  try {
    const res = await httpGet('https://itunes.apple.com/search?term=' + encodeURIComponent(query) + '&entity=song&limit=15&country=US');
    const list = (res.data && Array.isArray(res.data.results)) ? res.data.results : [];
    if (!list.length) return null;
    const q = norm(query);
    const qWords = q.split(' ').filter((w) => w.length > 1);
    const scored = [];
    for (const item of list) {
      const t = norm(item.trackName);
      let s = 0;
      if (t === q) s += 100;
      else if (t.startsWith(q + ' ') || t.includes(q)) s += 60;
      else if (q.includes(t) && t.length > 3) s += 50;
      else s += qWords.filter((w) => t.includes(w)).length * 10;

      // Alternate versions (remix / acoustic / live / cover) are not the
      // canonical track — only keep them if the user actually asked for one.
      if (!BAD_VERSION_WORDS.test(q) && BAD_VERSION_WORDS.test(t + ' ' + norm(item.collectionName))) s -= 40;
      if (/\b(remix|acoustic|live|version|edit)\b/.test(t) && !/\b(remix|acoustic|live|version|edit)\b/.test(q)) s -= 25;

      if (s >= 50) scored.push({ item: item, score: s, title: t });
    }
    if (!scored.length) return null;
    scored.sort((a, b) => b.score - a.score);

    // Apple's relevance order is imperfect (it often ranks covers above the
    // original), so keep every strong candidate artist and let the downstream
    // rankers reward a track that matches *any* of them.
    // Majority vote: the real artist almost always appears several times in
    // Apple's results (original + deluxe + single), while covers appear once.
    // This reliably beats Apple's own relevance order, which often ranks a
    // cover above the original.
    const votes = new Map();
    for (const s of scored) {
      const a = String(s.item.artistName || '').trim();
      if (!a) continue;
      const cur = votes.get(a) || { count: 0, best: 0, order: votes.size };
      cur.count += 1;
      cur.best = Math.max(cur.best, s.score);
      votes.set(a, cur);
    }
    const rankedArtists = Array.from(votes.entries())
      .sort((x, y) => (y[1].count - x[1].count) || (y[1].best - x[1].best) || (x[1].order - y[1].order))
      .map((e) => e[0]);
    const artists = rankedArtists.slice(0, 1);
    const best = scored[0].item;
    return {
      title: String(best.trackName || '').replace(/\s*\((?:feat|ft)\.?[^)]*\)/i, '').trim(),
      artist: String(best.artistName || '').trim(),
      artists: artists,
      album: String(best.collectionName || '').trim(),
      artwork: String(best.artworkUrl100 || '').replace('100x100', '600x600'),
      score: scored[0].score
    };
  } catch (_) {
    return null;
  }
}

/** Does `blob` contain any of the candidate artist names? */
function matchArtist(blob, hints) {
  const list = Array.isArray(hints) ? hints : (hints ? [hints] : []);
  for (const hint of list) {
    const ca = norm(hint);
    if (!ca) continue;
    if (blob.includes(ca)) return true;
    const words = ca.split(' ').filter((w) => w.length > 3 && !['and', 'the', 'feat', 'ft', 'with', 'music', 'official', 'records'].includes(w));
    if (words.some((w) => blob.includes(w))) return true;
  }
  return false;
}

/** Resolve the best playable stream URL for a track id. */
async function resolveStream(trackId) {
  const cid = await getClientId();
  const track = await apiGet('/tracks/' + trackId);
  const transcodings = (track.media && track.media.transcodings) || [];
  if (!transcodings.length) throw new Error('No stream available');

  // Never pick the DRM "*-encrypted-hls" variants — they need SoundCloud's
  // own player keys. Prefer plain progressive MP3, then plain HLS.
  const usable = transcodings.filter((t) => t && t.url && !/encrypted/i.test(t.url));
  if (!usable.length) throw new Error('Track is DRM protected');

  const rank = (t) => {
    const proto = (t.format && t.format.protocol) || '';
    if (proto === 'progressive') return 0;
    if (t.preset === 'abr_sq') return 1;
    if (t.preset === 'aac_160k') return 2;
    if (t.preset === 'mp3_160k') return 2;
    if (t.preset === 'aac_96k') return 3;
    if (t.preset === 'mp3_128k') return 3;
    return 4;
  };
  usable.sort((a, b) => rank(a) - rank(b));

  const auth = track.track_authorization || '';
  let lastErr = 'Stream resolve failed';
  for (const chosen of usable) {
    const sep = chosen.url.includes('?') ? '&' : '?';
    const url = chosen.url + sep + 'client_id=' + cid + '&track_authorization=' + encodeURIComponent(auth);
    const res = await httpGet(url);
    if (res.status === 200 && res.data && res.data.url) {
      return {
        url: res.data.url,
        preset: chosen.preset,
        protocol: (chosen.format && chosen.format.protocol) || '',
        mime: (chosen.format && chosen.format.mime_type) || ''
      };
    }
    lastErr = 'Stream resolve failed (HTTP ' + res.status + ')';
  }
  throw new Error(lastErr);
}

function parseM3u8(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let init = null;
  const segments = [];
  for (const line of lines) {
    if (line.startsWith('#EXT-X-MAP')) {
      const m = line.match(/URI="([^"]+)"/);
      if (m) init = m[1];
    } else if (!line.startsWith('#')) {
      segments.push(line);
    }
  }
  return { init: init, segments: segments };
}

async function downloadTo(url, dest) {
  const res = await axios.get(url, {
    responseType: 'stream',
    timeout: 120000,
    maxRedirects: 5,
    headers: { 'User-Agent': UA },
    validateStatus: () => true
  });
  if (res.status !== 200) throw new Error('CDN HTTP ' + res.status);
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    res.data.pipe(out);
    res.data.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
  });
}

/**
 * Download a resolved stream to a local audio file.
 * Progressive MP3s are fetched directly; fragmented-MP4 HLS playlists are
 * concatenated (no ffmpeg needed); MPEG-TS playlists are remuxed with ffmpeg.
 */
async function downloadStream(stream, dir, baseName) {
  if (stream.protocol === 'progressive') {
    const outFile = path.join(dir, baseName + '.mp3');
    await downloadTo(stream.url, outFile);
    const size = fs.statSync(outFile).size;
    if (size < 50000) throw new Error('Downloaded audio too small');
    return { file: outFile, bytes: size };
  }

  const m3u8 = stream.url;
  const pl = await httpGet(m3u8, { headers: { 'User-Agent': UA, Accept: '*/*' } });
  const playlist = parseM3u8(typeof pl.data === 'string' ? pl.data : '');
  if (!playlist.segments.length) throw new Error('Empty HLS playlist');

  const isFmp4 = !!playlist.init || playlist.segments.every((s) => /\.m4s(\?|$)/i.test(s));

  if (isFmp4) {
    const outFile = path.join(dir, baseName + '.m4a');
    const parts = [];
    if (playlist.init) {
      const initFile = path.join(dir, baseName + '.init');
      await downloadTo(playlist.init, initFile);
      parts.push(initFile);
    }
    for (let i = 0; i < playlist.segments.length; i++) {
      const segFile = path.join(dir, baseName + '.seg' + String(i).padStart(4, '0'));
      await downloadTo(playlist.segments[i], segFile);
      parts.push(segFile);
    }
    const out = fs.createWriteStream(outFile);
    for (const p of parts) {
      out.write(fs.readFileSync(p));
      try { fs.unlinkSync(p); } catch (_) {}
    }
    await new Promise((resolve, reject) => { out.end(); out.on('finish', resolve); out.on('error', reject); });
    const size = fs.statSync(outFile).size;
    if (size < 50000) throw new Error('Downloaded audio too small');
    return { file: outFile, bytes: size };
  }

  // MPEG-TS → needs ffmpeg.
  const outFile = path.join(dir, baseName + '.mp3');
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', m3u8, '-vn', '-acodec', 'libmp3lame', '-b:a', '192k', outFile], { timeout: 180000 });
  } catch (e) {
    throw new Error('ffmpeg failed: ' + String(e && e.message ? e.message : e).slice(0, 120));
  }
  const size = fs.statSync(outFile).size;
  if (size < 50000) throw new Error('Downloaded audio too small');
  return { file: outFile, bytes: size };
}

/**
 * Search + download a song from SoundCloud.
 * @returns {Promise<{ok:boolean,file?:string,dir?:string,title?:string,artist?:string,
 *                    duration?:number,artwork?:string,quality?:string,source?:string,error?:string}>}
 */
async function downloadSong(query, options) {
  const opts = options || {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scdl_'));

  // Build search attempts: raw query first, then "artist title" from iTunes.
  const attempts = [query];
  const canon = await canonicalize(query);
  if (canon && canon.artist && canon.title) {
    const combined = (canon.artist + ' ' + canon.title).trim();
    if (norm(combined) !== norm(query)) attempts.push(combined);
  }

  let lastErr = 'Song not found.';

  // Pool every result from every search attempt, then rank once. Ranking per
  // attempt made the first attempt's mediocre hit win over a much better match
  // found by the second attempt.
  const pool = new Map();
  for (const attempt of attempts) {
    const search = await searchTracks(attempt, opts.limit || 12);
    if (!search.ok) { lastErr = search.error; continue; }
    for (const track of search.results) {
      if (!pool.has(track.id)) pool.set(track.id, track);
    }
  }

  const ranked = rankTracks(Array.from(pool.values()), query, canon && canon.artists);
  for (const track of ranked.slice(0, 8)) {
    try {
      const stream = await resolveStream(track.id);
      const baseName = String(track.title || 'song').replace(/[^\w\s.-]/g, '').slice(0, 80).trim() || 'song';
      const dl = await downloadStream(stream, dir, baseName);
      return {
        ok: true,
        file: dl.file,
        dir: dir,
        title: track.title,
        artist: track.artist,
        duration: track.duration,
        artwork: track.artwork || (canon && canon.artwork) || '',
        quality: stream.preset === 'abr_sq' ? '~160kbps' : '128kbps',
        source: 'soundcloud'
      };
    } catch (e) {
      lastErr = e && e.message ? e.message : String(e);
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
  searchTracks: searchTracks,
  downloadSong: downloadSong,
  canonicalize: canonicalize,
  scoreTrack: scoreTrack,
  rankTracks: rankTracks,
  getClientId: getClientId,
  cleanupDir: cleanupDir
};
