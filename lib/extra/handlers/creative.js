'use strict';
/**
 * Creative / image-design handlers (20 commands).
 * pantone, fontpreview, qrlogo, mockup, meme, emojimerge, gradient,
 * iconsearch, palette, aspectratio, goldenratio, dither, duotone, blur,
 * sharpen, pixelate, invert, sepia, vintage, photocollage
 */
const U = require('../util');

const { textOf, need, reply, ai, box, getJson, getText, getMedia, needMedia, pick, tmpFile, cleanup, ensureTmp } = U;

const handlers = {};

/* ---- sharp loader ------------------------------------------------- */
let _sharp = null;
function sharpLib() {
  if (_sharp === null) {
    try { _sharp = require('sharp'); } catch (e) { _sharp = false; }
  }
  return _sharp;
}

async function sendImage(ctx, buffer, caption) {
  return ctx.sock.sendMessage(ctx.m.chat, { image: buffer, caption }, { quoted: ctx.m });
}

async function mediaToImage(ctx) {
  const media = await getMedia(ctx);
  if (!media) return null;
  const sharp = sharpLib();
  if (!sharp) return media.buffer;
  try {
    return await sharp(media.buffer).png().toBuffer();
  } catch (e) {
    return media.buffer;
  }
}

/* ---- Pantone / colour info --------------------------------------- */
handlers.pantone = async (ctx) => {
  const q = textOf(ctx).replace('#', '').trim();
  if (!q) return reply(ctx, `🎨 *Usage:* ${ctx.prefix}pantone #FF5733\n${ctx.prefix}pantone 255,87,51`);
  let r, g, b;
  if (/^\d+,\s*\d+,\s*\d+$/.test(q)) {
    [r, g, b] = q.split(',').map((x) => parseInt(x.trim(), 10));
  } else if (/^[0-9a-f]{6}$/i.test(q)) {
    r = parseInt(q.slice(0, 2), 16); g = parseInt(q.slice(2, 4), 16); b = parseInt(q.slice(4, 6), 16);
  } else {
    return reply(ctx, `❌ Hex (#FF5733) ya RGB (255,87,51) format dein.`);
  }
  const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2 / 255;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  const H = Math.round(h * 360), S = Math.round(s * 100), L = Math.round(l * 100);
  const cmyk = [1 - r / 255, 1 - g / 255, 1 - b / 255].map((x) => Math.round(x * 100));
  const k = Math.min(...cmyk);
  const cmykAdj = k === 100 ? [0, 0, 0, 100] : cmyk.map((x) => Math.round(((x - k) / (1 - k / 100)) * 100));
  // nearest named colour
  let name = '—';
  try {
    const n = await getJson(`https://www.thecolorapi.com/id?hex=${hex.slice(1)}`);
    name = n.name ? n.name.value : '—';
    return reply(ctx, box('🎨 COLOUR INFO', [
      `🔹 *HEX:* ${hex}`,
      `🔹 *Name:* ${name}`,
      `🔹 *RGB:* rgb(${r}, ${g}, ${b})`,
      `🔹 *HSL:* hsl(${H}, ${S}%, ${L}%)`,
      `🔹 *CMYK:* ${cmykAdj.join(', ')}%`,
      `🔹 *Brightness:* ${Math.round((r * 299 + g * 587 + b * 114) / 1000)}`,
      '',
      `🖼️ Swatch: https://singlecolorimage.com/get/${hex.slice(1)}/400x200`
    ]));
  } catch (e) {
    return reply(ctx, box('🎨 COLOUR INFO', [
      `🔹 *HEX:* ${hex}`,
      `🔹 *RGB:* rgb(${r}, ${g}, ${b})`,
      `🔹 *HSL:* hsl(${H}, ${S}%, ${L}%)`,
      `🔹 *CMYK:* ${cmykAdj.join(', ')}%`
    ]));
  }
};

/* ---- Font preview ------------------------------------------------ */
handlers.fontpreview = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🔤 *Usage:* ${ctx.prefix}fontpreview Hello World`);
  const fonts = ['Arial', 'Georgia', 'Courier New', 'Impact', 'Comic Sans MS', 'Times New Roman', 'Verdana', 'Trebuchet MS'];
  const lines = fonts.map((f) => `*${f}* — ${q}`);
  // Build an SVG preview
  const sharp = sharpLib();
  if (sharp) {
    try {
      const esc = q.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
      const svg = `<svg width="900" height="520" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111"/><text x="30" y="60" fill="#fff" font-size="34" font-family="Arial">${esc}</text><text x="30" y="130" fill="#fff" font-size="34" font-family="Georgia">${esc}</text><text x="30" y="200" fill="#fff" font-size="34" font-family="Courier New">${esc}</text><text x="30" y="270" fill="#fff" font-size="34" font-family="Impact">${esc}</text><text x="30" y="340" fill="#fff" font-size="34" font-family="Comic Sans MS">${esc}</text><text x="30" y="410" fill="#fff" font-size="34" font-family="Times New Roman">${esc}</text><text x="30" y="480" fill="#fff" font-size="34" font-family="Verdana">${esc}</text></svg>`;
      const buf = await sharp(Buffer.from(svg)).png().toBuffer();
      return sendImage(ctx, buf, `🔤 *FONT PREVIEW*\n\n${lines.join('\n')}`);
    } catch (e) { /* fallthrough */ }
  }
  return reply(ctx, box('🔤 FONT PREVIEW', lines));
};

/* ---- QR with logo ------------------------------------------------- */
handlers.qrlogo = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `📱 *Usage:* ${ctx.prefix}qrlogo https://example.com`);
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(q)}&color=000000&bgcolor=FFFFFF&qzone=2`;
  const caption = `📱 *QR CODE*\n\n📝 ${q}\n\n_Logo add karne ke liye qrserver.com ya qrcode-monkey.com use karein._`;
  try {
    return await ctx.sock.sendMessage(ctx.m.chat, { image: { url }, caption }, { quoted: ctx.m });
  } catch (e) {
    return reply(ctx, caption);
  }
};

/* ---- Mockup ------------------------------------------------------ */
handlers.mockup = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🖼️ *Usage:* ${ctx.prefix}mockup a mobile app landing page`);
  const t = await ai(ctx, `Write a detailed image-generation prompt for a professional product mockup of: ${q}. Include composition, lighting, background, angle, materials, and mood. Output only the prompt (max 120 words), no preamble.`, 'You are an expert art director writing image prompts.');
  return reply(ctx, box('🖼️ MOCKUP PROMPT', [
    t || `A clean professional mockup of ${q}, studio lighting, minimal background, 4k.`,
    '',
    `_Tip: yeh prompt kisi bhi AI image generator (Midjourney, DALL·E, Leonardo) mein paste karein._`
  ]));
};

/* ---- Meme -------------------------------------------------------- */
handlers.meme = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `😂 *Usage:* ${ctx.prefix}meme top text | bottom text`);
  const parts = q.split('|').map((x) => x.trim());
  const top = (parts[0] || '').toUpperCase();
  const bottom = (parts[1] || '').toUpperCase();
  const img = pick([
    'https://i.imgflip.com/1bij.jpg', 'https://i.imgflip.com/26am.jpg',
    'https://i.imgflip.com/1ur9b0.jpg', 'https://i.imgflip.com/30b1gx.jpg',
    'https://i.imgflip.com/1g8my4.jpg', 'https://i.imgflip.com/1e7ql7.jpg'
  ]);
  const esc = (s) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const sharp = sharpLib();
  if (sharp) {
    try {
      const meta = await getJson('https://api.imgflip.com/get_memes');
      const m = pick(meta.data.memes.filter((x) => x.box_count >= 2));
      const svg = `<svg width="${m.width}" height="${m.height}" xmlns="http://www.w3.org/2000/svg"><defs><style>text{font-family:Impact,sans-serif;fill:#fff;stroke:#000;stroke-width:4px;paint-order:stroke;font-size:${Math.round(m.width / 12)}px;text-anchor:middle;}</style></defs><text x="${m.width / 2}" y="${Math.round(m.width / 10)}">${esc(top)}</text><text x="${m.width / 2}" y="${m.height - 20}">${esc(bottom)}</text></svg>`;
      const base = await getText(m.url, { responseType: 'arraybuffer' }).catch(() => null);
      const overlay = Buffer.from(svg);
      if (base) {
        const buf = await sharp(Buffer.from(base)).composite([{ input: overlay, top: 0, left: 0 }]).jpeg({ quality: 88 }).toBuffer();
        return sendImage(ctx, buf, `😂 *MEME*\n\n${top}\n${bottom}`);
      }
    } catch (e) { /* fallthrough */ }
  }
  return reply(ctx, `😂 *MEME*\n\nTop: ${top}\nBottom: ${bottom}\n\n_Image: ${img}_`);
};

/* ---- Emoji merge ------------------------------------------------- */
handlers.emojimerge = async (ctx) => {
  const q = textOf(ctx).replace(/\s+/g, '');
  const chars = [...q];
  if (chars.length < 2) return reply(ctx, `😀 *Usage:* ${ctx.prefix}emojimerge 😀🔥`);
  const e1 = encodeURIComponent(chars[0]);
  const e2 = encodeURIComponent(chars[1]);
  const url = `https://emojik.vercel.app/s/${e1}_${e2}?size=256`;
  try {
    return await ctx.sock.sendMessage(ctx.m.chat, { image: { url }, caption: `😀 *EMOJI MERGE*\n${chars[0]} + ${chars[1]}` }, { quoted: ctx.m });
  } catch (e) {
    return reply(ctx, `😀 *EMOJI MERGE*\n${chars[0]} + ${chars[1]}\n\n🔗 ${url}`);
  }
};

/* ---- Gradient ---------------------------------------------------- */
handlers.gradient = async (ctx) => {
  const q = textOf(ctx).replace(/#/g, '');
  const parts = q.split(/[\s,]+/).filter(Boolean);
  if (parts.length < 2) return reply(ctx, `🌈 *Usage:* ${ctx.prefix}gradient FF5733 33FF57`);
  const [c1, c2] = parts;
  const sharp = sharpLib();
  if (sharp) {
    try {
      const svg = `<svg width="800" height="400" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#${c1}"/><stop offset="100%" stop-color="#${c2}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
      const buf = await sharp(Buffer.from(svg)).png().toBuffer();
      return sendImage(ctx, buf, `🌈 *GRADIENT*\n#${c1} → #${c2}\n\nCSS: \`linear-gradient(135deg, #${c1}, #${c2})\``);
    } catch (e) { /* fallthrough */ }
  }
  return reply(ctx, `🌈 *GRADIENT*\n#${c1} → #${c2}\n\nCSS: \`linear-gradient(135deg, #${c1}, #${c2})\``);
};

/* ---- Icon search ------------------------------------------------- */
handlers.iconsearch = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🔍 *Usage:* ${ctx.prefix}iconsearch home`);
  try {
    const d = await getJson(`https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=32`);
    if (!d.icons || !d.icons.length) return reply(ctx, `❌ "${q}" ke icons nahi mile.`);
    const list = d.icons.slice(0, 20).map((i) => `• ${i}`).join('\n');
    return reply(ctx, box(`🔍 ICONS — ${q.toUpperCase()}`, [
      list,
      '',
      `🖼️ Preview: https://icon-sets.iconify.design/?query=${encodeURIComponent(q)}`,
      `💾 SVG: https://api.iconify.design/${d.icons[0]}.svg`
    ]));
  } catch (e) {
    return reply(ctx, `❌ Icon search fail: ${e.message}`);
  }
};

/* ---- Palette from image ------------------------------------------ */
handlers.palette = async (ctx) => {
  const buf = await mediaToImage(ctx);
  if (!buf) return needMedia(ctx);
  const sharp = sharpLib();
  if (!sharp) return reply(ctx, '⚠️ Image tools available nahi hain.');
  try {
    const { dominant } = await sharp(buf).stats();
    const hex = '#' + [dominant.r, dominant.g, dominant.b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
    // quantise to 5 colours by resizing small
    const raw = await sharp(buf).resize(5, 5, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    const px = [];
    for (let i = 0; i < raw.data.length; i += raw.info.channels) {
      px.push('#' + [raw.data[i], raw.data[i + 1], raw.data[i + 2]].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase());
    }
    const uniq = [...new Set(px)].slice(0, 8);
    const strip = `<svg width="800" height="120" xmlns="http://www.w3.org/2000/svg">${uniq.map((c, i) => `<rect x="${(800 / uniq.length) * i}" y="0" width="${800 / uniq.length}" height="120" fill="${c}"/>`).join('')}</svg>`;
    const out = await sharp(Buffer.from(strip)).png().toBuffer();
    return sendImage(ctx, out, `🎨 *COLOUR PALETTE*\n\n🎯 Dominant: *${hex}*\n\n${uniq.map((c) => `• ${c}`).join('\n')}`);
  } catch (e) {
    return reply(ctx, `❌ Palette fail: ${e.message}`);
  }
};

/* ---- Aspect ratio ------------------------------------------------ */
handlers.aspectratio = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `📐 *Usage:* ${ctx.prefix}aspectratio 1920x1080`);
  const m = q.match(/(\d+)\s*[x:]\s*(\d+)/i);
  if (!m) return reply(ctx, `❌ Format: ${ctx.prefix}aspectratio 1920x1080`);
  const w = parseInt(m[1], 10), h = parseInt(m[2], 10);
  const g = (a, b) => (b ? g(b, a % b) : a);
  const d = g(w, h);
  const rw = w / d, rh = h / d;
  const ratio = w / h;
  const known = { '16:9': 1.7778, '9:16': 0.5625, '4:3': 1.3333, '3:4': 0.75, '1:1': 1, '21:9': 2.3333, '2:1': 2, '3:2': 1.5, '2:3': 0.6667, '5:4': 1.25, '4:5': 0.8 };
  const nearest = Object.entries(known).sort((a, b) => Math.abs(a[1] - ratio) - Math.abs(b[1] - ratio))[0][0];
  return reply(ctx, box('📐 ASPECT RATIO', [
    `🖼️ *Size:* ${w} × ${h}`,
    `📊 *Ratio:* ${rw}:${rh}`,
    `🔢 *Decimal:* ${ratio.toFixed(4)}`,
    `🎯 *Nearest standard:* ${nearest}`,
    `🔄 *Landscape:* ${w > h ? 'Yes' : 'No'} | *Square:* ${w === h ? 'Yes' : 'No'}`,
    `📱 *MP:* ${((w * h) / 1000000).toFixed(2)} megapixels`
  ]));
};

/* ---- Golden ratio ------------------------------------------------ */
handlers.goldenratio = async (ctx) => {
  const q = parseFloat(textOf(ctx));
  if (isNaN(q) || q <= 0) return reply(ctx, `✨ *Usage:* ${ctx.prefix}goldenratio 1000\n\n(Golden ratio φ = 1.6180339887)`);
  const PHI = 1.6180339887;
  return reply(ctx, box('✨ GOLDEN RATIO', [
    `🔢 *Input:* ${q}`,
    `➗ *÷ φ:* ${(q / PHI).toFixed(2)}`,
    `✖️ *× φ:* ${(q * PHI).toFixed(2)}`,
    '',
    `📐 *φ:* ${PHI}`,
    `🖼️ *Golden rectangle:* ${q} × ${(q * PHI).toFixed(2)}`,
    `🎨 *Use:* photography, logo grids, typography scales, UI spacing.`
  ]));
};

/* ---- Dither ------------------------------------------------------ */
async function simpleFilter(ctx, name, fn, caption) {
  const buf = await mediaToImage(ctx);
  if (!buf) return needMedia(ctx);
  const sharp = sharpLib();
  if (!sharp) return reply(ctx, '⚠️ Image tools available nahi hain.');
  try {
    const out = await fn(sharp(buf));
    return sendImage(ctx, out, caption);
  } catch (e) {
    return reply(ctx, `❌ ${name} fail: ${e.message}`);
  }
}

handlers.dither = async (ctx) => simpleFilter(ctx, 'Dither', async (img) => {
  const { data, info } = await img.resize(600, null, { withoutEnlargement: true }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const out = Buffer.alloc(data.length);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = y * info.width + x;
      const t = (bayer[y % 4][x % 4] / 16) * 255;
      out[i] = data[i] > t ? 255 : 0;
    }
  }
  return require('sharp')(out, { raw: { width: info.width, height: info.height, channels: 1 } }).png().toBuffer();
}, '🔲 *DITHER* — 1-bit Bayer dithering applied.');

handlers.duotone = async (ctx) => {
  const q = textOf(ctx).replace(/#/g, '').split(/[\s,]+/).filter(Boolean);
  const c1 = q[0] || '1a1a2e';
  const c2 = q[1] || 'e94560';
  return simpleFilter(ctx, 'Duotone', async (img) => {
    const { data, info } = await img.resize(800, null, { withoutEnlargement: true }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const A = [parseInt(c1.slice(0, 2), 16), parseInt(c1.slice(2, 4), 16), parseInt(c1.slice(4, 6), 16)];
    const B = [parseInt(c2.slice(0, 2), 16), parseInt(c2.slice(2, 4), 16), parseInt(c2.slice(4, 6), 16)];
    const out = Buffer.alloc(info.width * info.height * 3);
    for (let i = 0; i < data.length; i++) {
      const t = data[i] / 255;
      out[i * 3] = Math.round(A[0] + (B[0] - A[0]) * t);
      out[i * 3 + 1] = Math.round(A[1] + (B[1] - A[1]) * t);
      out[i * 3 + 2] = Math.round(A[2] + (B[2] - A[2]) * t);
    }
    return require('sharp')(out, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();
  }, `🎨 *DUOTONE*\n#${c1} → #${c2}`);
};

handlers.blur = async (ctx) => simpleFilter(ctx, 'Blur', async (img) => {
  const n = Math.min(50, Math.max(1, parseInt(textOf(ctx), 10) || 10));
  return img.blur(n).png().toBuffer();
}, `💧 *BLUR* applied.`);

handlers.sharpen = async (ctx) => simpleFilter(ctx, 'Sharpen', async (img) => {
  const n = Math.min(10, Math.max(1, parseInt(textOf(ctx), 10) || 3));
  return img.sharpen({ sigma: n }).png().toBuffer();
}, `🔪 *SHARPEN* applied.`);

handlers.pixelate = async (ctx) => simpleFilter(ctx, 'Pixelate', async (img) => {
  const n = Math.min(64, Math.max(2, parseInt(textOf(ctx), 10) || 12));
  const meta = await img.metadata();
  const w = meta.width || 800;
  const small = Math.max(8, Math.round(w / n));
  const buf = await img.resize(small, null, { fit: 'inside' }).png().toBuffer();
  return require('sharp')(buf).resize(w, null, { kernel: 'nearest' }).png().toBuffer();
}, `🟦 *PIXELATE* applied.`);

handlers.invert = async (ctx) => simpleFilter(ctx, 'Invert', async (img) => img.negate({ alpha: false }).png().toBuffer(), '🔄 *INVERT* applied.');

handlers.sepia = async (ctx) => simpleFilter(ctx, 'Sepia', async (img) => img.recomb([[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]]).png().toBuffer(), '🟤 *SEPIA* applied.');

handlers.vintage = async (ctx) => simpleFilter(ctx, 'Vintage', async (img) => {
  const a = await img.modulate({ saturation: 0.6, brightness: 1.05 }).recomb([[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]]).png().toBuffer();
  return require('sharp')(a).composite([{ input: Buffer.from('<svg width="100%" height="100%"><rect width="100%" height="100%" fill="#000" opacity="0.08"/></svg>'), blend: 'over' }]).png().toBuffer();
}, '📷 *VINTAGE* filter applied.');

/* ---- Photo collage ---------------------------------------------- */
handlers.photocollage = async (ctx) => {
  const media = await getMedia(ctx);
  if (!media) return needMedia(ctx);
  const sharp = sharpLib();
  if (!sharp) return reply(ctx, '⚠️ Image tools available nahi hain.');
  try {
    const buf = media.buffer;
    const meta = await sharp(buf).metadata();
    const w = meta.width || 800;
    const h = meta.height || 800;
    // 2x2 grid of the same image with different crops + white border
    const tiles = [];
    const half = Math.floor(Math.min(w, h) / 2);
    const crops = [
      { left: 0, top: 0 }, { left: w - half, top: 0 },
      { left: 0, top: h - half }, { left: w - half, top: h - half }
    ];
    const size = 400;
    const canvas = sharp({ create: { width: size * 2 + 30, height: size * 2 + 30, channels: 3, background: '#ffffff' } });
    const comps = [];
    for (let i = 0; i < 4; i++) {
      const t = await sharp(buf).extract({ left: Math.max(0, crops[i].left), top: Math.max(0, crops[i].top), width: half, height: half }).resize(size, size, { fit: 'cover' }).png().toBuffer();
      comps.push({ input: t, left: 10 + (i % 2) * (size + 10), top: 10 + Math.floor(i / 2) * (size + 10) });
    }
    const out = await canvas.composite(comps).png().toBuffer();
    return sendImage(ctx, out, '🖼️ *PHOTO COLLAGE* — 2×2 grid');
  } catch (e) {
    return reply(ctx, `❌ Collage fail: ${e.message}`);
  }
};

module.exports = { handlers, sharpLib, sendImage };
