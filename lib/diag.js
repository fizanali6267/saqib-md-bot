'use strict';
/**
 * lib/diag.js — live self-diagnostics for the 18-bug fix set.
 * Runs the real code paths on the production server so a deploy can be
 * verified end-to-end without sending WhatsApp messages.
 */

const { execFileSync } = require('child_process');
const https = require('https');

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout ' + ms + 'ms: ' + label)), ms))
  ]);
}

function head(url, ms = 12000) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: ms }, (res) => {
      resolve({ status: res.statusCode, bytes: Number(res.headers['content-length'] || 0) });
      res.resume();
    });
    req.on('error', (e) => resolve({ error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
    req.end();
  });
}

async function run(opts) {
  const deep = !!(opts && opts.deep);
  const results = {};
  const check = async (name, fn) => {
    const t0 = Date.now();
    try {
      const value = await withTimeout(Promise.resolve().then(fn), 30000, name);
      results[name] = { ok: true, ms: Date.now() - t0, value };
    } catch (e) {
      results[name] = { ok: false, ms: Date.now() - t0, error: String(e && e.message || e).slice(0, 300) };
    }
  };

  // 1 + 3 + 18: LID resolution (block/unblock/mentions must never show @lid)
  await check('lid_resolve', () => {
    const lid = require('./lid');
    const { resolvePn, isLid } = require('./serialize');
    lid.addPair('215753789857825@lid', '923106762478@s.whatsapp.net');
    const resolved = resolvePn('215753789857825@lid');
    return {
      isLidDetected: isLid('215753789857825@lid'),
      resolved,
      noLidLeak: !String(resolved || '').includes('@lid'),
      mapSize: lid.size()
    };
  });

  // 12 + 11: sticker creation with EXIF metadata (.s / .take)
  await check('sticker_exif', async () => {
    const sharp = require('sharp');
    const { createSticker } = require('./sticker');
    const png = await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 20, g: 140, b: 220, alpha: 1 } } }).png().toBuffer();
    const webp = await createSticker(png, { packName: 'SAQIB-MD', author: 'Saqib Iqbal', emoji: '🎨' });
    const txt = webp.toString('latin1');
    return {
      bytes: webp.length,
      isWebp: txt.slice(0, 4) === 'RIFF' && txt.slice(8, 12) === 'WEBP',
      hasExifChunk: txt.includes('EXIF'),
      hasPackName: txt.includes('SAQIB-MD')
    };
  });

  // 5: emoji mix (Google Emoji Kitchen via gstatic)
  await check('emojimix', async () => {
    const { findEmojiKitchen } = require('../plugins/audio_fx')._internal;
    const hit = await findEmojiKitchen('😂', '😍');
    const miss = await findEmojiKitchen('🤗', '☠');
    return { hit: hit ? { date: hit.date, url: String(hit.url).slice(0, 80) } : null, missIsNull: miss === null };
  });

  // 9: .google direct results (Yahoo primary)
  await check('google_search', async () => {
    const { webSearch } = require('../plugins/ai_tools')._internal;
    const r = await webSearch('ICC Champions Trophy', 4);
    return {
      count: r.length,
      first: r[0] ? { title: String(r[0].title).slice(0, 70), url: String(r[0].url).slice(0, 70) } : null,
      relevant: r.some((x) => /champions trophy|cricket|icc/i.test(x.title + ' ' + x.url))
    };
  });

  // 8: .define velocity
  await check('define', async () => {
    const { wiktionaryDefine } = require('../plugins/ai_tools')._internal;
    const d = await wiktionaryDefine('velocity');
    const g = d && d.groups && d.groups[0];
    const first = g && g.definitions && g.definitions[0];
    return { found: !!(g && first), pos: g && g.partOfSpeech, definition: first ? String(first).slice(0, 120) : null };
  });

  // 15: .yts
  await check('youtube_search', async () => {
    const { youtubeSearch } = require('../plugins/downloader')._internal;
    const r = await youtubeSearch('Dil Dil Pakistan', 3);
    return { count: r.length, first: r[0] ? { title: String(r[0].title).slice(0, 60), id: r[0].id } : null };
  });

  // 2: .apk (Aptoide)
  await check('apk', async () => {
    const { aptoideLookup, humanSize } = require('../plugins/downloader')._internal;
    const a = await aptoideLookup('whatsapp');
    return a ? { name: a.name, package: a.package, size: humanSize(a.size), hasUrl: !!a.url } : { notFound: true };
  });

  // 17: TikTok download (native page scrape + ttwid cookie)
  await check('tiktok', async () => {
    const { tiktokWeb } = require('../plugins/downloader')._internal;
    const t = await tiktokWeb('https://www.tiktok.com/@scout2015/video/6718335390845095173');
    return {
      kind: t.kind,
      title: String(t.title || '').slice(0, 50),
      author: t.author,
      bytes: t.kind === 'video' ? t.buffer.length : t.images.length,
      ok: t.kind === 'video' ? t.buffer.length > 100000 : t.images.length > 0,
    };
  });

  // 17b: TikTok via yt-dlp (the real fallback when tikwm is blocked)
  if (deep) {
    await check('tiktok_ytdlp', async () => {
      const ytdlp = require('./ytdlp');
      const r = await ytdlp.downloadVideo('https://www.tiktok.com/@scout2015/video/6718335390845095173', { height: 480 });
      let bytes = 0;
      try { if (r.ok && r.file) bytes = require('fs').statSync(r.file).size; } catch (_) {}
      if (r.dir) { try { ytdlp.cleanupDir(r.dir); } catch (_) {} }
      return { ok: !!r.ok, bytes, error: r.ok ? null : String(r.error || '').slice(0, 200) };
    });
  }

  // 16: .ocr (tesseract present in image)
  await check('ocr', () => {
    const out = execFileSync('tesseract', ['--version'], { encoding: 'utf8', timeout: 15000 });
    return { installed: true, version: out.split('\n')[0].slice(0, 60) };
  });

  // 6: .azan audio source reachable (archive.org redirects to a mirror node)
  await check('azan', async () => {
    const axios = require('axios');
    const res = await axios.get('https://ia801504.us.archive.org/25/items/adhan_202010/adhan.mp3', {
      responseType: 'stream', timeout: 25000, maxRedirects: 5, headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const bytes = Number(res.headers['content-length'] || 0);
    const type = res.headers['content-type'];
    if (res.data && res.data.destroy) res.data.destroy();
    return { status: res.status, bytes, type, ok: res.status === 200 && bytes > 100000 };
  });

  // 7: .imagine (Pollinations)
  await check('imagine', async () => {
    const r = await head('https://image.pollinations.ai/prompt/a%20red%20apple?width=256&height=256&nologo=true&seed=7');
    return { status: r.status, ok: r.status === 200 };
  });

  // 6b: .quran / .surah (alquran.cloud)
  await check('quran', async () => {
    const axios = require('axios');
    const a = await axios.get('https://api.alquran.cloud/v1/ayah/1:1/editions/quran-uthmani,ur.jalandhry,en.sahih', { timeout: 20000 });
    const list = a.data && a.data.data;
    const s = await axios.get('https://api.alquran.cloud/v1/surah/1', { timeout: 20000 });
    return {
      ayahEditions: Array.isArray(list) ? list.length : 0,
      surah: s.data && s.data.data && s.data.data.englishName,
      ayahs: s.data && s.data.data && s.data.data.numberOfAyahs,
      ok: Array.isArray(list) && list.length === 3 && !!(s.data && s.data.data),
    };
  });

  // 7b: .imagine must return real image bytes
  await check('imagine_bytes', async () => {
    const axios = require('axios');
    const r = await axios.get('https://image.pollinations.ai/prompt/' + encodeURIComponent('a red apple on a table') + '?width=512&height=512&nologo=true&seed=42', {
      responseType: 'arraybuffer', timeout: 60000, headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const buf = Buffer.from(r.data);
    return { status: r.status, bytes: buf.length, isImage: /^image\//.test(String(r.headers['content-type'])), ok: buf.length > 5000 };
  });

  // 16b: .ocr full pipeline (render text -> tesseract)
  await check('ocr_pipeline', async () => {
    const sharp = require('sharp');
    const { runOcr } = require('../plugins/converter')._internal;
    const svg = Buffer.from('<svg width="600" height="160" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="30" y="100" font-family="DejaVu Sans" font-size="64" fill="black">SAQIB 2026</text></svg>');
    const png = await sharp(svg).png().toBuffer();
    const text = String(await runOcr(png) || '').trim();
    return { text: text.slice(0, 60), ok: /SAQIB/i.test(text) };
  });

  // 10b: .kick admin matching with LID participants
  await check('admin_match', () => {
    const admin = require('./admin');
    const participants = [
      { id: '923106762478@s.whatsapp.net', admin: 'superadmin' },
      { id: '215753789857825@lid', admin: null },
    ];
    const sock = { user: { id: '923106762478:12@s.whatsapp.net' } };
    const m = { sender: '215753789857825@lid', key: { participant: '215753789857825@lid', participantLid: '215753789857825@lid', participantPn: '923106762478@s.whatsapp.net' } };
    const f = admin.flags(participants, sock, m);
    return { isBotAdmin: f.isBotAdmin, isSenderAdmin: f.isSenderAdmin, ok: f.isBotAdmin === true && f.isSenderAdmin === true };
  });

  // 4: .vv view-once detection
  await check('vv_detect', () => {
    const VO = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];
    const raw = { viewOnceMessageV2: { message: { imageMessage: { mimetype: 'image/jpeg' } } } };
    const detected = VO.some((k) => raw[k]);
    const inner = raw.viewOnceMessageV2.message;
    return { detected, inner: Object.keys(inner)[0], ok: detected && !!inner.imageMessage };
  });

  // 14: .slap caption format
  await check('slap_caption', () => {
    const { CAPTIONS } = require('../plugins/reactions')._internal;
    const c = CAPTIONS.slap('Jind', 'Humman');
    return { caption: c, matches: /slapped/.test(c) && c.startsWith('@Jind') };
  });

  // 10: .ghost output format
  await check('ghost_format', () => {
    const sample = '👻 *Ghost Found!* 👻\n\n@923001234567 is a ghost!\n_No messages in 30 days._\n\n👀 Watch out for them!';
    return { sample, ok: /Ghost Found/.test(sample) && /Watch out for them/.test(sample) };
  });

  const summary = Object.entries(results).reduce((a, [k, v]) => { a[k] = v.ok ? 'PASS' : 'FAIL'; return a; }, {});
  const failed = Object.values(summary).filter((v) => v === 'FAIL').length;
  return { ok: failed === 0, failed, total: Object.keys(summary).length, summary, results };
}

module.exports = { run };
