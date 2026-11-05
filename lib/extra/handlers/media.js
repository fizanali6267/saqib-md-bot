/**
 * FILE & MEDIA PROCESSING (24) + AUDIO MODIFIERS (8) + CONVERTERS (12) + DOWNLOADERS (8).
 * Image work uses sharp (already a dependency); audio/video uses ffmpeg (in Docker image).
 */

const U = require('../util');

async function sendImage(ctx, buffer, caption) {
  await ctx.sock.sendMessage(ctx.m.chat, { image: buffer, caption }, { quoted: ctx.m });
}
async function sendVideo(ctx, buffer, caption) {
  await ctx.sock.sendMessage(ctx.m.chat, { video: buffer, caption, mimetype: 'video/mp4' }, { quoted: ctx.m });
}
async function sendAudio(ctx, buffer, caption) {
  await ctx.sock.sendMessage(ctx.m.chat, { audio: buffer, mimetype: 'audio/mpeg', ptt: false }, { quoted: ctx.m });
  if (caption) await ctx.m.reply(caption);
}
async function sendDoc(ctx, buffer, name, mimetype, caption) {
  await ctx.sock.sendMessage(ctx.m.chat, { document: buffer, fileName: name, mimetype, caption }, { quoted: ctx.m });
}

function sharpLib() { return require('sharp'); }

async function mediaToImage(ctx) {
  const media = await U.needMedia(ctx);
  if (!media) return null;
  try { return { media, img: sharpLib()(media.buffer) }; }
  catch (e) { await ctx.m.reply('❌ Could not read this image.'); return null; }
}

async function audioTransform(ctx, args, caption) {
  const media = await U.needMedia(ctx);
  if (!media) return;
  if (!U.hasFfmpeg()) return ctx.m.reply('⚠️ ffmpeg is not available on this server.');
  await ctx.m.react('🎧').catch(() => null);
  try {
    const out = await U.ffmpeg(media.buffer, U.extFor(media), args, 'mp3');
    await sendAudio(ctx, out, caption);
  } catch (e) {
    await ctx.m.reply(`❌ Audio processing failed: ${e.message}`);
  }
}

const handlers = {
  /* ---------------- FILE & MEDIA ---------------- */

  async pdfmerge(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    return ctx.m.reply('ℹ️ *PDF Merge* needs 2+ files. WhatsApp ek waqt mein ek hi reply bhejta hai.\n\nAap `.pdfmerge` ke saath extra PDFs as documents bhejein — ya pehle `.createzip` se bundle karein.');
  },

  async pdfsplit(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    try {
      const { PDFDocument } = require('pdf-lib');
      const src = await PDFDocument.load(media.buffer);
      const pages = src.getPageCount();
      const zip = new (require('adm-zip'))();
      for (let i = 0; i < pages; i += 1) {
        const doc = await PDFDocument.create();
        const [p] = await doc.copyPages(src, [i]);
        doc.addPage(p);
        zip.addFile(`page-${i + 1}.pdf`, Buffer.from(await doc.save()));
      }
      await sendDoc(ctx, zip.toBuffer(), 'split-pages.zip', 'application/zip', `✂️ Split into ${pages} pages.`);
    } catch (e) {
      await ctx.m.reply(`❌ PDF split failed: ${e.message}`);
    }
  },

  async pdfcompress(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    try {
      const { PDFDocument } = require('pdf-lib');
      const doc = await PDFDocument.load(media.buffer);
      const out = Buffer.from(await doc.save({ useObjectStreams: true }));
      const saved = media.buffer.length - out.length;
      await sendDoc(ctx, out, 'compressed.pdf', 'application/pdf',
        `🗜️ ${(media.buffer.length / 1024).toFixed(0)}KB → ${(out.length / 1024).toFixed(0)}KB (saved ${(saved / 1024).toFixed(0)}KB)`);
    } catch (e) {
      await ctx.m.reply(`❌ PDF compress failed: ${e.message}`);
    }
  },

  async imgcompress(ctx) {
    const r = await mediaToImage(ctx);
    if (!r) return;
    const q = Math.min(90, Math.max(20, Number(U.textOf(ctx)) || 60));
    try {
      const out = await r.img.jpeg({ quality: q }).toBuffer();
      await sendImage(ctx, out, `🗜️ Compressed at ${q}% quality\n${(r.media.buffer.length / 1024).toFixed(0)}KB → ${(out.length / 1024).toFixed(0)}KB`);
    } catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async webpconv(ctx) {
    const r = await mediaToImage(ctx);
    if (!r) return;
    try { await sendImage(ctx, await r.img.webp({ quality: 85 }).toBuffer(), '🖼️ Converted to WebP'); }
    catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async svgtopng(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    try {
      const out = await sharpLib()(media.buffer).png().toBuffer();
      await sendImage(ctx, out, '🖼️ SVG → PNG');
    } catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async audiofilter(ctx) {
    const f = U.textOf(ctx) || 'highpass=f=200,lowpass=f=3000';
    await audioTransform(ctx, ['-af', f], `🎛️ Filter applied: ${f}`);
  },

  async audiotrim(ctx) {
    const raw = U.textOf(ctx).split(/\s+/);
    const start = raw[0] || '0';
    const dur = raw[1] || '30';
    await audioTransform(ctx, ['-ss', start, '-t', dur], `✂️ Trimmed ${start}s → +${dur}s`);
  },

  async videocrop(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    if (!U.hasFfmpeg()) return ctx.m.reply('⚠️ ffmpeg unavailable.');
    const [w, h] = (U.textOf(ctx) || '720:720').split(/[x:]/);
    try {
      const out = await U.ffmpeg(media.buffer, U.extFor(media), ['-vf', `crop=${w || 720}:${h || 720}`, '-c:a', 'copy'], 'mp4');
      await sendVideo(ctx, out, `✂️ Cropped to ${w}x${h}`);
    } catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async watermark(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    const text = U.textOf(ctx) || 'SAQIB-MD';
    try {
      const img = sharpLib()(media.buffer);
      const meta = await img.metadata();
      const svg = Buffer.from(`<svg width="${meta.width}" height="${meta.height}"><text x="50%" y="92%" font-size="${Math.max(18, Math.round(meta.width / 22))}" fill="rgba(255,255,255,0.75)" text-anchor="middle" font-family="sans-serif">${text.replace(/[<>&]/g, '')}</text></svg>`);
      const out = await img.composite([{ input: svg, gravity: 'southeast' }]).jpeg({ quality: 90 }).toBuffer();
      await sendImage(ctx, out, `💧 Watermark: ${text}`);
    } catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async gifmaker(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    if (!U.hasFfmpeg()) return ctx.m.reply('⚠️ ffmpeg unavailable.');
    try {
      const out = await U.ffmpeg(media.buffer, U.extFor(media), ['-vf', 'fps=12,scale=480:-1', '-t', '6'], 'gif');
      await ctx.sock.sendMessage(ctx.m.chat, { video: out, gifPlayback: true, caption: '🎞️ GIF created' }, { quoted: ctx.m });
    } catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async extractaudio(ctx) {
    await audioTransform(ctx, ['-vn', '-ar', '44100', '-ac', '2', '-b:a', '128k'], '🎵 Audio extracted');
  },

  async resizepic(ctx) {
    const r = await mediaToImage(ctx);
    if (!r) return;
    const [w, h] = (U.textOf(ctx) || '720').split(/[x:]/);
    try {
      const out = await r.img.resize(Number(w) || 720, h ? Number(h) : null, { fit: 'inside' }).jpeg({ quality: 90 }).toBuffer();
      await sendImage(ctx, out, `📐 Resized to ${w}${h ? 'x' + h : 'px width'}`);
    } catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async bgremove(ctx) {
    const r = await mediaToImage(ctx);
    if (!r) return;
    try {
      const meta = await r.img.metadata();
      const { data, info } = await r.img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      // Simple corner-colour keying: remove pixels close to the average corner colour.
      const corners = [0, (info.width - 1) * 4, (info.height - 1) * info.width * 4, ((info.height * info.width) - 1) * 4];
      let r0 = 0; let g0 = 0; let b0 = 0;
      for (const c of corners) { r0 += data[c]; g0 += data[c + 1]; b0 += data[c + 2]; }
      r0 /= 4; g0 /= 4; b0 /= 4;
      for (let i = 0; i < data.length; i += 4) {
        const d = Math.abs(data[i] - r0) + Math.abs(data[i + 1] - g0) + Math.abs(data[i + 2] - b0);
        if (d < 60) data[i + 3] = 0;
      }
      const out = await sharpLib()(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
      await ctx.sock.sendMessage(ctx.m.chat, { image: out, caption: `🪄 Background removed (${meta.width}x${meta.height})` }, { quoted: ctx.m });
    } catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async rotate(ctx) {
    const r = await mediaToImage(ctx);
    if (!r) return;
    const deg = Number(U.textOf(ctx)) || 90;
    try { await sendImage(ctx, await r.img.rotate(deg).jpeg({ quality: 92 }).toBuffer(), `🔄 Rotated ${deg}°`); }
    catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async framerate(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    const fps = Math.min(60, Math.max(5, Number(U.textOf(ctx)) || 24));
    if (!U.hasFfmpeg()) return ctx.m.reply('⚠️ ffmpeg unavailable.');
    try {
      const out = await U.ffmpeg(media.buffer, U.extFor(media), ['-r', String(fps), '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'copy'], 'mp4');
      await sendVideo(ctx, out, `🎞️ Framerate set to ${fps}fps`);
    } catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async unzip(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    try {
      const zip = new (require('adm-zip'))(media.buffer);
      const entries = zip.getEntries();
      const list = entries.slice(0, 25).map((e) => `• ${e.entryName} (${(e.header.size / 1024).toFixed(1)}KB)`);
      await ctx.m.reply(`🗂️ *ZIP contents (${entries.length} files)*\n\n${list.join('\n')}${entries.length > 25 ? `\n… +${entries.length - 25} more` : ''}`);
    } catch (e) { await ctx.m.reply(`❌ Invalid ZIP: ${e.message}`); }
  },

  async createzip(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    try {
      const zip = new (require('adm-zip'))();
      zip.addFile(`file.${U.extFor(media)}`, media.buffer);
      await sendDoc(ctx, zip.toBuffer(), 'archive.zip', 'application/zip', '🗜️ ZIP created');
    } catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async metadata(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    try {
      const meta = await sharpLib()(media.buffer).metadata();
      await ctx.m.reply(U.box('📋 IMAGE METADATA', [
        `Format: ${meta.format}`,
        `Size: ${meta.width}x${meta.height}`,
        `Channels: ${meta.channels}`,
        `Space: ${meta.space}`,
        `Density: ${meta.density || '—'}`,
        `Has alpha: ${meta.hasAlpha ? 'yes' : 'no'}`,
        `Orientation: ${meta.orientation || '—'}`,
        `Bytes: ${media.buffer.length.toLocaleString()}`
      ]));
    } catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async stripexif(ctx) {
    const r = await mediaToImage(ctx);
    if (!r) return;
    try { await sendImage(ctx, await r.img.rotate().jpeg({ quality: 92 }).toBuffer(), '🧹 EXIF metadata stripped'); }
    catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async giftomp4(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    if (!U.hasFfmpeg()) return ctx.m.reply('⚠️ ffmpeg unavailable.');
    try {
      const out = await U.ffmpeg(media.buffer, U.extFor(media), ['-movflags', 'faststart', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'veryfast'], 'mp4');
      await sendVideo(ctx, out, '🎬 GIF → MP4');
    } catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async slowmo(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    if (!U.hasFfmpeg()) return ctx.m.reply('⚠️ ffmpeg unavailable.');
    const factor = Math.min(4, Math.max(1.2, Number(U.textOf(ctx)) || 2));
    try {
      const out = await U.ffmpeg(media.buffer, U.extFor(media), ['-vf', `setpts=${factor}*PTS`, '-af', `atempo=${(1 / factor).toFixed(2)}`, '-c:v', 'libx264', '-preset', 'veryfast'], 'mp4');
      await sendVideo(ctx, out, `🐢 Slow motion ${factor}x`);
    } catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async fastforward(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    if (!U.hasFfmpeg()) return ctx.m.reply('⚠️ ffmpeg unavailable.');
    const factor = Math.min(4, Math.max(1.2, Number(U.textOf(ctx)) || 2));
    try {
      const out = await U.ffmpeg(media.buffer, U.extFor(media), ['-vf', `setpts=PTS/${factor}`, '-af', `atempo=${factor}`, '-c:v', 'libx264', '-preset', 'veryfast'], 'mp4');
      await sendVideo(ctx, out, `⚡ Fast forward ${factor}x`);
    } catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async audioboost(ctx) {
    const db = Math.min(20, Math.max(1, Number(U.textOf(ctx)) || 6));
    await audioTransform(ctx, ['-af', `volume=${db}dB`], `🔊 Volume boosted +${db}dB`);
  },

  /* ---------------- AUDIO MODIFIERS ---------------- */

  async pitch(ctx) {
    const f = Math.min(3, Math.max(0.5, Number(U.textOf(ctx)) || 1.2));
    await audioTransform(ctx, ['-af', `asetrate=44100*${f},aresample=44100`], `🎚️ Pitch ${f}x`);
  },

  async tempo(ctx) {
    const f = Math.min(3, Math.max(0.5, Number(U.textOf(ctx)) || 1.3));
    await audioTransform(ctx, ['-af', `atempo=${f}`], `⏩ Tempo ${f}x`);
  },

  async equalizer(ctx) {
    const gain = Math.min(20, Math.max(-20, Number(U.textOf(ctx)) || 6));
    await audioTransform(ctx, ['-af', `equalizer=f=1000:width_type=h:width=200:g=${gain}`], `🎛️ EQ 1kHz ${gain > 0 ? '+' : ''}${gain}dB`);
  },

  async normalize(ctx) {
    await audioTransform(ctx, ['-af', 'loudnorm=I=-16:TP=-1.5:LRA=11'], '📊 Loudness normalized');
  },

  async audio3d(ctx) {
    await audioTransform(ctx, ['-af', 'apulsator=hz=0.08,extrastereo=m=2'], '🎧 3D audio effect');
  },

  async vocalremover(ctx) {
    await audioTransform(ctx, ['-af', 'pan=stereo|c0=c0-c1|c1=c1-c0'], '🎤 Vocals removed (karaoke)');
  },

  async karaoke(ctx) {
    await audioTransform(ctx, ['-af', 'pan=stereo|c0=c0-c1|c1=c1-c0,aecho=0.8:0.9:1000:0.3'], '🎤 Karaoke mix');
  },

  async audiojoin(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    if (!U.hasFfmpeg()) return ctx.m.reply('⚠️ ffmpeg unavailable.');
    try {
      const out = await U.ffmpeg(media.buffer, U.extFor(media), ['-filter_complex', '[0:a][0:a]concat=n=2:v=0:a=1'], 'mp3');
      await sendAudio(ctx, out, '🔗 Audio doubled/joined');
    } catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  /* ---------------- CONVERTERS ---------------- */

  async topdf(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    try {
      const { PDFDocument } = require('pdf-lib');
      const doc = await PDFDocument.create();
      const jpg = await sharpLib()(media.buffer).jpeg({ quality: 90 }).toBuffer();
      const img = await doc.embedJpg(jpg);
      const page = doc.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      await sendDoc(ctx, Buffer.from(await doc.save()), 'image.pdf', 'application/pdf', '📄 Image → PDF');
    } catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async toexcel(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    const text = media.buffer.toString('utf8');
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return ctx.m.reply('❌ Empty file.');
    const rows = lines.map((l) => l.split(/[,;\t]/));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    await sendDoc(ctx, Buffer.from(csv), 'sheet.csv', 'text/csv', `📊 Converted to CSV (${rows.length} rows). Excel/Sheets mein open karein.`);
  },

  async txttofile(ctx) {
    const t = U.textOf(ctx) || (ctx.m.quoted && ctx.m.quoted.text) || '';
    if (!t) return U.need(ctx, 'txttofile <text>');
    await sendDoc(ctx, Buffer.from(t), 'note.txt', 'text/plain', '📄 Text file created');
  },

  async heic2jpg(ctx) {
    const r = await mediaToImage(ctx);
    if (!r) return;
    try { await sendImage(ctx, await r.img.jpeg({ quality: 92 }).toBuffer(), '🖼️ HEIC → JPG'); }
    catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async epub2pdf(ctx) {
    await ctx.m.reply('ℹ️ EPUB → PDF ke liye Calibre chahiye jo is container mein nahi hai.\n\nAap EPUB ko document ke tor par bhej dein — main text extract kar sakta hoon (`.summarizefile`).');
  },

  async cbr2pdf(ctx) {
    await ctx.m.reply('ℹ️ CBR/Comic archive → PDF ke liye Calibre chahiye. Filhaal `.unzip` se pages nikal sakte hain.');
  },

  async rtf2txt(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    const raw = media.buffer.toString('utf8');
    const txt = raw.replace(/\\par[d]?/g, '\n').replace(/\{\\\*?[^{}]*\}/g, '').replace(/\\[a-z]+\d* ?/gi, '').replace(/[{}]/g, '').trim();
    await sendDoc(ctx, Buffer.from(txt || '(empty)'), 'converted.txt', 'text/plain', '📄 RTF → TXT');
  },

  async svgtoico(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    try {
      const out = await sharpLib()(media.buffer).resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      await sendDoc(ctx, out, 'icon.png', 'image/png', '🖼️ SVG → 256px icon');
    } catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async mp3towav(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    if (!U.hasFfmpeg()) return ctx.m.reply('⚠️ ffmpeg unavailable.');
    try {
      const out = await U.ffmpeg(media.buffer, U.extFor(media), ['-acodec', 'pcm_s16le', '-ar', '44100'], 'wav');
      await sendDoc(ctx, out, 'audio.wav', 'audio/wav', '🎵 MP3 → WAV');
    } catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async ogg2mp3(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    if (!U.hasFfmpeg()) return ctx.m.reply('⚠️ ffmpeg unavailable.');
    try {
      const out = await U.ffmpeg(media.buffer, U.extFor(media), ['-b:a', '192k'], 'mp3');
      await sendAudio(ctx, out, '🎵 OGG → MP3');
    } catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async wav2flac(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    if (!U.hasFfmpeg()) return ctx.m.reply('⚠️ ffmpeg unavailable.');
    try {
      const out = await U.ffmpeg(media.buffer, U.extFor(media), ['-c:a', 'flac'], 'flac');
      await sendDoc(ctx, out, 'audio.flac', 'audio/flac', '🎵 WAV → FLAC');
    } catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async mid2wav(ctx) {
    await ctx.m.reply('ℹ️ MIDI → WAV ke liye soundfont synth chahiye (timidity/fluidsynth) jo container mein nahi hai.');
  },

  /* ---------------- DOWNLOADERS ---------------- */

  async twitterdl(ctx) {
    const url = (U.textOf(ctx).match(/https?:\/\/\S+/) || [])[0];
    if (!url) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}twitterdl <tweet link>`);
    try {
      const id = (url.match(/status\/(\d+)/) || [])[1];
      if (!id) return ctx.m.reply('❌ Tweet ID not found in link.');
      const d = await U.getJson(`https://api.vxtwitter.com/Twitter/status/${id}`, { timeout: 15000 });
      const media = d.mediaURLs || [];
      if (!media.length) return ctx.m.reply(`🐦 *@${d.user_screen_name}*\n\n${d.text || ''}\n\n_No media in this tweet._`);
      for (const m of media.slice(0, 4)) {
        const isVideo = /\.mp4/i.test(m);
        await ctx.sock.sendMessage(ctx.m.chat, isVideo ? { video: { url: m }, caption: `🐦 @${d.user_screen_name}` } : { image: { url: m }, caption: `🐦 @${d.user_screen_name}` }, { quoted: ctx.m });
      }
    } catch (e) { await ctx.m.reply(`❌ Twitter download failed: ${e.message}`); }
  },

  async pintdl(ctx) {
    const url = (U.textOf(ctx).match(/https?:\/\/\S+/) || [])[0];
    if (!url) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}pintdl <pinterest link>`);
    try {
      const html = await U.getText(url);
      const m = /"orig":\{"url":"([^"]+)"/.exec(html) || /property="og:image" content="([^"]+)"/.exec(html);
      if (!m) return ctx.m.reply('❌ Image not found on this pin.');
      await ctx.sock.sendMessage(ctx.m.chat, { image: { url: m[1].replace(/\\\//g, '/') }, caption: '📌 Pinterest' }, { quoted: ctx.m });
    } catch (e) { await ctx.m.reply(`❌ Pinterest download failed: ${e.message}`); }
  },

  async spotdl(ctx) {
    const raw = U.textOf(ctx);
    if (!raw) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}spotdl <song name or Spotify link>`);
    try {
      const soundcloud = require('../../soundcloud');
      let query = raw;
      if (/open\.spotify\.com/i.test(raw)) {
        const o = await U.getJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(raw)}`);
        query = o.title || raw;
      }
      await ctx.m.react('🎧').catch(() => null);
      const dl = await soundcloud.downloadSong(query, { limit: 12 });
      if (!dl.ok) return ctx.m.reply(`❌ Not found: ${dl.error || query}`);
      await ctx.sock.sendMessage(ctx.m.chat, { audio: { url: dl.file }, mimetype: 'audio/mpeg', fileName: `${dl.title || 'song'}.mp3` }, { quoted: ctx.m });
      await ctx.m.reply(`🎵 *${dl.title || query}*${dl.artist ? `\n👤 ${dl.artist}` : ''}`);
    } catch (e) { await ctx.m.reply(`❌ Spotify download failed: ${e.message}`); }
  },

  async gitdl(ctx) {
    const q = await U.need(ctx, 'gitdl <owner/repo>');
    if (!q) return;
    const repo = q.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\s/g, '');
    try {
      const res = await U.axios.get(`https://api.github.com/repos/${repo}/zipball`, { responseType: 'arraybuffer', timeout: 60000, maxContentLength: 50 * 1024 * 1024 });
      await sendDoc(ctx, Buffer.from(res.data), `${repo.replace('/', '-')}.zip`, 'application/zip', `📦 ${repo} source`);
    } catch (e) { await ctx.m.reply(`❌ Repo download failed: ${e.message}`); }
  },

  async drivefetch(ctx) {
    const raw = U.textOf(ctx);
    const id = (raw.match(/[-\w]{25,}/) || [])[0];
    if (!id) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}drivefetch <Google Drive link>`);
    const url = `https://drive.google.com/uc?export=download&id=${id}`;
    try {
      const res = await U.axios.get(url, { responseType: 'arraybuffer', timeout: 60000, maxContentLength: 60 * 1024 * 1024 });
      const buf = Buffer.from(res.data);
      if (buf.length < 2000) return ctx.m.reply('❌ File too small or access denied (private file?).');
      await sendDoc(ctx, buf, 'drive-file', 'application/octet-stream', '📁 Google Drive file');
    } catch (e) { await ctx.m.reply(`❌ Drive download failed: ${e.message}`); }
  },

  async vimeodl(ctx) {
    const url = (U.textOf(ctx).match(/https?:\/\/\S+/) || [])[0];
    if (!url) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}vimeodl <vimeo link>`);
    try {
      const ytdlp = require('../../ytdlp');
      const r = await ytdlp.downloadVideo(url, { quality: '720' });
      if (!r.ok) return ctx.m.reply(`❌ ${r.error || 'Vimeo download failed'}`);
      await sendVideo(ctx, require('fs').readFileSync(r.file), '🎬 Vimeo video');
      ytdlp.cleanup && ytdlp.cleanup(r.dir);
    } catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async snapdl(ctx) {
    const url = (U.textOf(ctx).match(/https?:\/\/\S+/) || [])[0];
    if (!url) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}snapdl <snapchat link>`);
    try {
      const ytdlp = require('../../ytdlp');
      const r = await ytdlp.downloadVideo(url, { quality: '720' });
      if (!r.ok) return ctx.m.reply(`❌ ${r.error || 'Snapchat download failed'}`);
      await sendVideo(ctx, require('fs').readFileSync(r.file), '👻 Snapchat');
      ytdlp.cleanup && ytdlp.cleanup(r.dir);
    } catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async redditdl(ctx) {
    const url = (U.textOf(ctx).match(/https?:\/\/\S+/) || [])[0];
    if (!url) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}redditdl <reddit post link>`);
    try {
      const json = await U.getJson(url.replace(/\/?$/, '.json'), { timeout: 15000 });
      const post = json[0].data.children[0].data;
      const media = post.url_overridden_by_dest || post.url;
      if (/\.(jpg|jpeg|png|gif)$/i.test(media)) {
        await ctx.sock.sendMessage(ctx.m.chat, { image: { url: media }, caption: `🟠 ${post.title}` }, { quoted: ctx.m });
      } else if (/\.mp4$/i.test(media) || post.is_video) {
        await ctx.sock.sendMessage(ctx.m.chat, { video: { url: media }, caption: `🟠 ${post.title}` }, { quoted: ctx.m });
      } else {
        await ctx.m.reply(`🟠 *${post.title}*\n\n🔗 ${media}`);
      }
    } catch (e) { await ctx.m.reply(`❌ Reddit download failed: ${e.message}`); }
  }
};

module.exports = { handlers };
