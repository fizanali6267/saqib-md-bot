/**
 * SAQIB-MD — Shared helpers for the extended command engine.
 * Everything here is dependency-light so the plugin loader stays fast.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const axios = require('axios');
const config = require('../../config');
const { askGemini, isKeyConfigured } = require('../gemini');

const TMP = path.join(os.tmpdir(), 'saqib-md');

function ensureTmp() {
  try { fs.mkdirSync(TMP, { recursive: true }); } catch (_) {}
  return TMP;
}

function tmpFile(ext) {
  ensureTmp();
  const name = `x_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext || 'bin'}`;
  return path.join(TMP, name);
}

function cleanup(file) {
  try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch (_) {}
}

/** Text of the command arguments (everything after the command). */
function textOf(ctx) {
  return (ctx.args || []).join(' ').trim();
}

/** Require arguments; replies with a usage hint when missing. */
async function need(ctx, hint) {
  const t = textOf(ctx);
  if (t) return t;
  await ctx.m.reply(
    `⚠️ *Missing input*\n\n` +
    `📝 ${ctx.desc || 'This command needs some input.'}\n` +
    `⚙️ *Usage:* ${ctx.prefix}${hint || ctx.usage || ctx.command}`
  );
  return null;
}

async function reply(ctx, text) {
  return ctx.m.reply(text);
}

/** Ask Gemini with a system prompt, returning a friendly error when unset. */
async function ai(ctx, prompt, systemPrompt) {
  if (!isKeyConfigured()) {
    await ctx.m.reply('⚠️ *AI is not configured.*\n\nOwner ko `GEMINI_API_KEY` set karni hogi.');
    return null;
  }
  await ctx.m.react('🧠').catch(() => null);
  const out = await askGemini(prompt, {
    systemPrompt: systemPrompt || 'You are SAQIB-MD, a helpful WhatsApp assistant. Answer clearly and concisely with light formatting.'
  });
  if (!out) {
    await ctx.m.reply('⚠️ AI ne jawab nahi diya. Thori dair baad dobara koshish karein.');
    return null;
  }
  return out;
}

async function aiReply(ctx, prompt, systemPrompt) {
  const out = await ai(ctx, prompt, systemPrompt);
  if (out) await ctx.m.reply(out);
  return out;
}

/** Download media from the quoted message or the current message. */
async function getMedia(ctx) {
  const m = ctx.m;
  try {
    if (m.quoted && typeof m.quoted.download === 'function') {
      const buffer = await m.quoted.download();
      if (buffer && buffer.length) {
        const type = m.quoted.type || 'documentMessage';
        return { buffer, type, mime: m.quoted.msg && m.quoted.msg.mimetype, quoted: true };
      }
    }
    if (typeof m.download === 'function' && m.type && m.type !== 'conversation' && m.type !== 'extendedTextMessage') {
      const buffer = await m.download();
      if (buffer && buffer.length) return { buffer, type: m.type, mime: m.msg && m.msg.mimetype, quoted: false };
    }
  } catch (err) {
    console.error('getMedia failed:', err && err.message);
  }
  return null;
}

async function needMedia(ctx) {
  const media = await getMedia(ctx);
  if (media) return media;
  await ctx.m.reply(
    `⚠️ *Media required*\n\n` +
    `Kisi image/video/audio ko reply karke yeh command chalayein.\n` +
    `📝 ${ctx.desc || ''}`
  );
  return null;
}

const MIME_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
  'audio/x-wav': 'wav', 'audio/amr': 'amr', 'audio/flac': 'flac',
  'application/pdf': 'pdf', 'application/zip': 'zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx'
};

function extFor(media) {
  if (!media) return 'bin';
  if (media.mime && MIME_EXT[media.mime]) return MIME_EXT[media.mime];
  const t = media.type || '';
  if (t.startsWith('image')) return 'jpg';
  if (t.startsWith('video')) return 'mp4';
  if (t.startsWith('audio')) return 'mp3';
  if (t === 'documentMessage') {
    const name = media.mime || '';
    const guess = name.split('/').pop();
    return guess && guess.length <= 5 ? guess : 'bin';
  }
  return 'bin';
}

/** Run ffmpeg on a buffer. Returns the output buffer. */
function ffmpeg(buffer, inExt, args, outExt) {
  return new Promise((resolve, reject) => {
    const input = tmpFile(inExt);
    const output = tmpFile(outExt);
    fs.writeFileSync(input, buffer);
    const argv = ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, ...args, output];
    cp.execFile('ffmpeg', argv, { timeout: 120000, maxBuffer: 1024 * 1024 * 128 }, (err, _stdout, stderr) => {
      cleanup(input);
      if (err) {
        cleanup(output);
        return reject(new Error((stderr || err.message || 'ffmpeg failed').toString().slice(0, 400)));
      }
      try {
        const out = fs.readFileSync(output);
        cleanup(output);
        resolve(out);
      } catch (e) {
        reject(e);
      }
    });
  });
}

function hasFfmpeg() {
  try {
    cp.execFileSync('ffmpeg', ['-version'], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch (_) {
    return false;
  }
}

/** GET JSON with a sane timeout and browser-ish UA. */
async function getJson(url, opts = {}) {
  const res = await axios.get(url, {
    timeout: opts.timeout || 15000,
    headers: { 'User-Agent': 'Mozilla/5.0 (SAQIB-MD)', Accept: 'application/json', ...(opts.headers || {}) },
    params: opts.params,
    validateStatus: (s) => s >= 200 && s < 400
  });
  return res.data;
}

async function getText(url, opts = {}) {
  const res = await axios.get(url, {
    timeout: opts.timeout || 15000,
    headers: { 'User-Agent': 'Mozilla/5.0 (SAQIB-MD)', ...(opts.headers || {}) },
    responseType: 'text',
    transformResponse: [(d) => d],
    validateStatus: (s) => s >= 200 && s < 400
  });
  return res.data;
}

function money(n, currency) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  const s = num.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return currency ? `${currency} ${s}` : s;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function box(title, lines) {
  return `╭─「 ${title} 」\n` + lines.filter(Boolean).map((l) => `│ ${l}`).join('\n') + `\n╰──────────────────────`;
}

function isOwner(ctx) {
  try { return config.checkIsOwner(ctx.m, ctx.sock); } catch (_) { return false; }
}

async function ownerOnly(ctx) {
  if (isOwner(ctx)) return true;
  await ctx.m.reply(config.MESSAGES && config.MESSAGES.OWNER_ONLY ? config.MESSAGES.OWNER_ONLY : '❌ Owner only command.');
  return false;
}

function isGroup(ctx) {
  return String(ctx.m.chat || '').endsWith('@g.us');
}

async function groupOnly(ctx) {
  if (isGroup(ctx)) return true;
  await ctx.m.reply('❌ Yeh command sirf group mein chalti hai.');
  return false;
}

/** Is the sender a group admin (or owner)? */
async function isAdmin(ctx) {
  if (isOwner(ctx)) return true;
  if (!isGroup(ctx)) return false;
  try {
    const meta = await ctx.sock.groupMetadata(ctx.m.chat);
    const sender = ctx.m.sender;
    const p = meta.participants.find((x) => x.id === sender || (x.lid && x.lid === sender));
    return Boolean(p && (p.admin === 'admin' || p.admin === 'superadmin'));
  } catch (_) {
    return false;
  }
}

async function adminOnly(ctx) {
  if (await isAdmin(ctx)) return true;
  await ctx.m.reply('❌ Yeh command sirf group admins ke liye hai.');
  return false;
}

module.exports = {
  config, axios, fs, os, path, cp,
  askGemini, isKeyConfigured,
  textOf, need, reply, ai, aiReply,
  getMedia, needMedia, extFor, ffmpeg, hasFfmpeg, tmpFile, cleanup, ensureTmp,
  getJson, getText, money, pick, randInt, box,
  isOwner, ownerOnly, isGroup, groupOnly, isAdmin, adminOnly
};
