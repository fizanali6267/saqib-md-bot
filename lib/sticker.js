'use strict';
/**
 * lib/sticker.js — WebP sticker builder with real WhatsApp EXIF metadata.
 *
 * Why this exists: Baileys' `{ sticker: buffer, packname, author }` does NOT
 * write the WebP EXIF chunk WhatsApp reads when you tap a sticker. Result:
 * "can't see the information". We therefore build the EXIF block ourselves and
 * splice it into the WebP as a proper RIFF `EXIF` chunk — pure JS, no external
 * binaries required for the metadata step.
 *
 * Conversion to WebP uses `sharp` when available, otherwise falls back to
 * ffmpeg (which is present in the Docker image).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

let sharp = null;
try {
  // eslint-disable-next-line global-require
  sharp = require('sharp');
} catch (_) {
  sharp = null;
}

const MAX_DIM = 512;
const MAX_BYTES = 900 * 1024; // WhatsApp hard limit is 1MB
const ANIM_SECONDS = 6;

function run(cmd, args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 1024 * 1024 * 64 }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stderr: String(stderr || '') }));
      resolve({ stdout, stderr });
    });
  });
}

function tmpFile(ext) {
  return path.join(os.tmpdir(), `stk-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`);
}

/**
 * Build the TIFF/EXIF payload WhatsApp expects.
 * Keys: sticker-pack-id, sticker-pack-name, sticker-pack-publisher, emojis.
 */
function buildExif({ packName = 'SAQIB-MD', author = 'Saqib Iqbal', emoji = '' } = {}) {
  const json = {
    'sticker-pack-id': crypto.randomBytes(16).toString('hex'),
    'sticker-pack-name': String(packName || 'SAQIB-MD').slice(0, 128),
    'sticker-pack-publisher': String(author || 'SAQIB-MD').slice(0, 128),
    emojis: [String(emoji || '🎨').slice(0, 8)],
  };
  const jsonBuff = Buffer.from(JSON.stringify(json), 'utf8');

  // TIFF header (little endian) + single IFD entry for tag 0x5741 ("AW").
  // Bytes 14..17 = value count, bytes 18..21 = value offset (22 = header size).
  const header = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x41, 0x57,
    0x07, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x16, 0x00, 0x00, 0x00,
  ]);
  header.writeUInt32LE(jsonBuff.length, 14);
  return Buffer.concat([header, jsonBuff]);
}

/**
 * Splice an EXIF chunk into an existing WebP (RIFF) buffer.
 * Returns a new Buffer; does not mutate the input.
 */
function injectExif(webpBuffer, exifBuffer) {
  const buf = Buffer.from(webpBuffer);
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
    return buf; // not a WebP, leave untouched
  }

  // Remove any pre-existing EXIF chunk so we don't duplicate it.
  const chunks = [];
  let off = 12;
  while (off + 8 <= buf.length) {
    const fourcc = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const dataStart = off + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > buf.length) break;
    if (fourcc !== 'EXIF') {
      chunks.push(buf.subarray(off, dataEnd + (size % 2)));
    }
    off = dataEnd + (size % 2);
  }

  const exifChunk = Buffer.alloc(8 + exifBuffer.length + (exifBuffer.length % 2));
  exifChunk.write('EXIF', 0, 'ascii');
  exifChunk.writeUInt32LE(exifBuffer.length, 4);
  exifBuffer.copy(exifChunk, 8);

  const body = Buffer.concat([Buffer.from('WEBP', 'ascii'), ...chunks, exifChunk]);
  const out = Buffer.alloc(8 + body.length);
  out.write('RIFF', 0, 'ascii');
  out.writeUInt32LE(body.length, 4);
  body.copy(out, 8);
  return out;
}

async function convertWithSharp(input, { animated }) {
  const meta = await sharp(input, { animated: !!animated }).metadata().catch(() => ({}));
  const isAnim = !!animated || (meta.pages && meta.pages > 1);
  let pipeline = sharp(input, { animated: isAnim });
  if (isAnim) {
    pipeline = pipeline.resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true });
  } else {
    pipeline = pipeline.resize(MAX_DIM, MAX_DIM, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }
  return pipeline.webp({ quality: 80, effort: 4, loop: 0 }).toBuffer();
}

async function convertWithFfmpeg(input, { animated }) {
  const out = tmpFile('webp');
  const vf = `scale=${MAX_DIM}:${MAX_DIM}:force_original_aspect_ratio=decrease,pad=${MAX_DIM}:${MAX_DIM}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`;
  const args = ['-y', '-i', input];
  if (animated) args.push('-t', String(ANIM_SECONDS), '-r', '15', '-an');
  args.push(
    '-vf', vf,
    '-c:v', 'libwebp',
    '-lossless', '0',
    '-q:v', '70',
    '-loop', '0',
    '-preset', 'default',
    '-an',
    '-f', 'webp',
    out
  );
  try {
    await run('ffmpeg', args, 90000);
    return fs.readFileSync(out);
  } finally {
    fs.unlink(out, () => {});
  }
}

/**
 * Build a sticker buffer.
 * @param {Buffer} input        source image / gif / video buffer
 * @param {object} opts         { packName, author, emoji, animated, isVideo }
 * @returns {Promise<Buffer>}   WebP sticker with EXIF metadata
 */
async function createSticker(input, opts = {}) {
  if (!Buffer.isBuffer(input) || !input.length) throw new Error('empty sticker source');

  const animated = !!(opts.animated || opts.isVideo);
  let webp = null;
  let lastErr = null;

  if (sharp) {
    try {
      webp = await convertWithSharp(input, { animated });
    } catch (e) {
      lastErr = e;
    }
  }
  if (!webp) {
    try {
      webp = await convertWithFfmpeg(input, { animated });
    } catch (e) {
      lastErr = e;
    }
  }
  if (!webp) throw new Error(`sticker conversion failed: ${lastErr ? lastErr.message : 'no converter'}`);

  // If still too large, re-encode smaller (static only).
  if (webp.length > MAX_BYTES && !animated && sharp) {
    try {
      webp = await sharp(input)
        .resize(384, 384, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 55, effort: 4 })
        .toBuffer();
    } catch (_) {}
  }

  const exif = buildExif(opts);
  return injectExif(webp, exif);
}

module.exports = { createSticker, buildExif, injectExif };
