'use strict';
/**
 * Social media handlers (20 commands).
 * hashtag, engagement, ytags, caption, bio, analytics, utmbuilder,
 * contentidea, ttsound, igstory, twitlength, threadmaker, pollmaker,
 * influencer, repost, banner, clickbait, commentgen, schedule, linkinbio
 */
const U = require('../util');

const { textOf, need, reply, ai, box, getJson, pick, randInt } = U;

const handlers = {};

const scheduleStore = new Map(); // sender -> [{text, when}]

/* ---- Hashtag generator ------------------------------------------ */
handlers.hashtag = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `#️⃣ *Usage:* ${ctx.prefix}hashtag street food Karachi`);
  const t = await ai(ctx, `Generate 30 relevant hashtags for the topic: "${q}". Mix broad (high volume) and niche (low competition) tags. Output them space-separated on 3 lines, then one line recommending the best 10 to use. No explanations.`, 'You are a social media growth strategist.');
  return reply(ctx, `#️⃣ *HASHTAGS — ${q.toUpperCase()}*\n\n${t || 'Nahi bana sake.'}`);
};

/* ---- Engagement rate -------------------------------------------- */
handlers.engagement = async (ctx) => {
  const q = textOf(ctx).replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  const likes = parseFloat(q[0]) || 0;
  const comments = parseFloat(q[1]) || 0;
  const shares = parseFloat(q[2]) || 0;
  const followers = parseFloat(q[3]) || 0;
  if (!followers) return reply(ctx, `📊 *Usage:* ${ctx.prefix}engagement <likes> <comments> <shares> <followers>\n\nExample: ${ctx.prefix}engagement 450 32 12 5000`);
  const total = likes + comments + shares;
  const rate = (total / followers) * 100;
  const grade = rate >= 6 ? '🔥 Excellent' : rate >= 3 ? '✅ Good' : rate >= 1 ? '🟡 Average' : '🔴 Low';
  return reply(ctx, box('📊 ENGAGEMENT RATE', [
    `❤️ Likes: ${likes}`,
    `💬 Comments: ${comments}`,
    `🔁 Shares: ${shares}`,
    `👥 Followers: ${followers}`,
    '',
    `📈 *Total interactions:* ${total}`,
    `📊 *Engagement rate:* *${rate.toFixed(2)}%*`,
    `${grade}`,
    '',
    `_Industry avg: 1-3% (Instagram), 0.5-1% (Twitter/X), 2-5% (TikTok)_`
  ]));
};

/* ---- YouTube tags ----------------------------------------------- */
handlers.ytags = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🎬 *Usage:* ${ctx.prefix}ytags cooking tutorial`);
  const t = await ai(ctx, `Generate YouTube SEO for a video about "${q}". Output: 1) 15 tags (comma separated, under 500 chars total), 2) 3 title options (under 60 chars each), 3) a 2-line description hook. Label each section.`, 'You are a YouTube SEO specialist.');
  return reply(ctx, `🎬 *YOUTUBE SEO — ${q.toUpperCase()}*\n\n${t || 'Nahi bana sake.'}`);
};

/* ---- Caption generator ------------------------------------------ */
handlers.caption = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `✍️ *Usage:* ${ctx.prefix}caption sunset at the beach`);
  const t = await ai(ctx, `Write 5 Instagram captions for: "${q}". Mix tones: 1 aesthetic, 1 funny, 1 inspirational, 1 short & punchy, 1 storytelling. Add 5 hashtags after each. Use emojis.`, 'You are a creative social media copywriter.');
  return reply(ctx, `✍️ *CAPTIONS*\n\n${t || 'Nahi bana sake.'}`);
};

/* ---- Bio generator ---------------------------------------------- */
handlers.bio = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `👤 *Usage:* ${ctx.prefix}bio photographer from Lahore`);
  const t = await ai(ctx, `Write 5 social media bios for: "${q}". Vary style: professional, witty, minimal, emoji-rich, and storytelling. Each under 150 characters. Number them.`, 'You are a personal branding expert.');
  return reply(ctx, `👤 *BIO OPTIONS*\n\n${t || 'Nahi bana sake.'}`);
};

/* ---- Analytics advice ------------------------------------------- */
handlers.analytics = async (ctx) => {
  const q = textOf(ctx) || 'Instagram';
  const t = await ai(ctx, `Explain which ${q} analytics metrics matter most and how to interpret them: reach vs impressions, engagement rate, saves, shares, watch time, follower growth, best posting times. Give 5 actionable optimisation tips. Max 280 words.`, 'You are a social media analyst.');
  return reply(ctx, `📈 *ANALYTICS — ${q.toUpperCase()}*\n\n${t || 'Nahi mila.'}`);
};

/* ---- UTM builder ------------------------------------------------ */
handlers.utmbuilder = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🔗 *Usage:* ${ctx.prefix}utmbuilder https://example.com | facebook | summer_sale | banner`);
  const parts = q.split('|').map((x) => x.trim());
  const url = parts[0];
  if (!/^https?:\/\//.test(url || '')) return reply(ctx, `🔗 URL https:// se shuru karein.`);
  const [source, medium, campaign, content, term] = parts.slice(1);
  const u = new URL(url);
  if (source) u.searchParams.set('utm_source', source);
  if (medium) u.searchParams.set('utm_medium', medium);
  if (campaign) u.searchParams.set('utm_campaign', campaign);
  if (content) u.searchParams.set('utm_content', content);
  if (term) u.searchParams.set('utm_term', term);
  return reply(ctx, box('🔗 UTM BUILDER', [
    `🌐 *Base:* ${url}`,
    `📌 *Source:* ${source || '—'}`,
    `📌 *Medium:* ${medium || '—'}`,
    `📌 *Campaign:* ${campaign || '—'}`,
    `📌 *Content:* ${content || '—'}`,
    '',
    `✅ *Trackable URL:*`,
    u.toString()
  ]));
};

/* ---- Content ideas ---------------------------------------------- */
handlers.contentidea = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `💡 *Usage:* ${ctx.prefix}contentidea fitness for beginners`);
  const t = await ai(ctx, `Give 15 content ideas (post/reel/short format) for the niche: "${q}". For each: a hook line + format type. Group into 3 buckets: educational, entertaining, promotional. Max 300 words.`, 'You are a content strategist.');
  return reply(ctx, `💡 *CONTENT IDEAS — ${q.toUpperCase()}*\n\n${t || 'Nahi bana sake.'}`);
};

/* ---- TikTok sound ----------------------------------------------- */
handlers.ttsound = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🎵 *Usage:* ${ctx.prefix}ttsound trending`);
  const t = await ai(ctx, `Recommend types of TikTok sounds for "${q}": 5 categories of trending sound styles (e.g. sped-up remix, original audio, voiceover trend), why each works, and how to find them in the app. Max 200 words.`, 'You are a TikTok trends analyst.');
  return reply(ctx, `🎵 *TIKTOK SOUNDS*\n\n${t || 'Nahi mila.'}`);
};

/* ---- IG story ideas --------------------------------------------- */
handlers.igstory = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `📱 *Usage:* ${ctx.prefix}igstory coffee shop`);
  const t = await ai(ctx, `Give 12 Instagram Story ideas for: "${q}". Include interactive stickers to use (poll, quiz, question, slider, countdown) and a CTA for each. Max 250 words.`, 'You are an Instagram Stories strategist.');
  return reply(ctx, `📱 *STORY IDEAS — ${q.toUpperCase()}*\n\n${t || 'Nahi bana sake.'}`);
};

/* ---- Tweet length ----------------------------------------------- */
handlers.twitlength = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🐦 *Usage:* ${ctx.prefix}twitlength <your tweet text>`);
  const len = [...q].length;
  const bytes = Buffer.byteLength(q, 'utf8');
  return reply(ctx, box('🐦 TWEET LENGTH', [
    `📝 *Characters:* ${len} / 280`,
    `📦 *UTF-8 bytes:* ${bytes}`,
    `✅ *Fits in a tweet:* ${len <= 280 ? 'Yes' : 'No — trim ' + (len - 280) + ' chars'}`,
    `✅ *Fits in X Premium (25k):* ${len <= 25000 ? 'Yes' : 'No'}`,
    '',
    len > 280 ? `✂️ *Suggested cut:*\n"${[...q].slice(0, 277).join('')}..."` : '',
    `\n_Thread needed: ${Math.ceil(len / 280)} tweet(s)_`
  ].filter(Boolean)));
};

/* ---- Thread maker ----------------------------------------------- */
handlers.threadmaker = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🧵 *Usage:* ${ctx.prefix}threadmaker 5 tips to learn coding fast`);
  const t = await ai(ctx, `Write a Twitter/X thread about: "${q}". 6-8 tweets, each under 280 characters, numbered (1/n). First tweet must be a strong hook. Last tweet a CTA. Use line breaks between tweets.`, 'You are a viral thread writer.');
  return reply(ctx, `🧵 *THREAD*\n\n${t || 'Nahi bana sake.'}`);
};

/* ---- Poll maker ------------------------------------------------- */
handlers.pollmaker = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `📊 *Usage:* ${ctx.prefix}pollmaker Best pizza topping | cheese | olives | chicken | pineapple`);
  const parts = q.split('|').map((x) => x.trim()).filter(Boolean);
  if (parts.length < 3) return reply(ctx, `📊 Format: ${ctx.prefix}pollmaker <question> | <option1> | <option2> | ...`);
  const [question, ...options] = parts;
  return reply(ctx, box('📊 POLL READY', [
    `❓ *Question:* ${question}`,
    '',
    ...options.map((o, i) => `${'🅰️🅱️🅲🅳🅴🅵'[i] || `${i + 1}.`} ${o}`),
    '',
    `_WhatsApp poll banane ke liye: attach → Poll → question + options paste karein._`
  ]));
};

/* ---- Influencer rate -------------------------------------------- */
handlers.influencer = async (ctx) => {
  const q = textOf(ctx).replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  const followers = parseFloat(q[0]) || 0;
  const platform = (q[1] || 'instagram').toLowerCase();
  if (!followers) return reply(ctx, `💰 *Usage:* ${ctx.prefix}influencer 50000 instagram`);
  const cpm = { instagram: 250, tiktok: 150, youtube: 400, facebook: 120, twitter: 100 }[platform] || 200;
  const perPost = (followers / 1000) * cpm;
  const tier = followers < 1000 ? 'Nano' : followers < 10000 ? 'Micro' : followers < 100000 ? 'Mid' : followers < 1000000 ? 'Macro' : 'Mega';
  return reply(ctx, box('💰 INFLUENCER RATES', [
    `👥 *Followers:* ${followers.toLocaleString()}`,
    `📱 *Platform:* ${platform}`,
    `🏷️ *Tier:* ${tier}`,
    '',
    `💵 *Per post (est):* PKR ${Math.round(perPost).toLocaleString()}`,
    `💵 *Per story (est):* PKR ${Math.round(perPost * 0.3).toLocaleString()}`,
    `💵 *Per reel/video (est):* PKR ${Math.round(perPost * 1.5).toLocaleString()}`,
    `💵 *Monthly (4 posts):* PKR ${Math.round(perPost * 4).toLocaleString()}`,
    '',
    `_Rates vary widely by niche, engagement and location._`
  ]));
};

/* ---- Repost checker --------------------------------------------- */
handlers.repost = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🔁 *Usage:* ${ctx.prefix}repost https://instagram.com/p/xxxx`);
  const t = await ai(ctx, `The user wants to repost content: "${q}". Give a short guide (6 bullets) on how to repost responsibly: credit the original creator, use native repost tools, avoid watermarks, check permissions, and best timing. Max 180 words.`, 'You are a social media etiquette advisor.');
  return reply(ctx, `🔁 *REPOST GUIDE*\n\n${t || 'Nahi mila.'}`);
};

/* ---- Banner ----------------------------------------------------- */
handlers.banner = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🖼️ *Usage:* ${ctx.prefix}banner My Channel | Gaming`);
  const parts = q.split('|').map((x) => x.trim());
  const title = parts[0] || 'My Channel';
  const sub = parts[1] || '';
  const sharp = (() => { try { return require('sharp'); } catch (e) { return null; } })();
  if (sharp) {
    try {
      const esc = (s) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
      const svg = `<svg width="1500" height="500" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f0c29"/><stop offset="50%" stop-color="#302b63"/><stop offset="100%" stop-color="#24243e"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="1300" cy="80" r="180" fill="#e94560" opacity="0.18"/><circle cx="180" cy="450" r="140" fill="#00d9ff" opacity="0.15"/><text x="750" y="240" text-anchor="middle" fill="#ffffff" font-family="Arial,Helvetica,sans-serif" font-size="86" font-weight="bold">${esc(title)}</text><text x="750" y="330" text-anchor="middle" fill="#9aa5b1" font-family="Arial,Helvetica,sans-serif" font-size="40">${esc(sub)}</text></svg>`;
      const buf = await sharp(Buffer.from(svg)).png().toBuffer();
      return ctx.sock.sendMessage(ctx.m.chat, { image: buf, caption: `🖼️ *BANNER*\n${title}${sub ? `\n${sub}` : ''}` }, { quoted: ctx.m });
    } catch (e) { /* fallthrough */ }
  }
  return reply(ctx, `🖼️ *BANNER*\nTitle: ${title}\nSubtitle: ${sub}\n\n_(Image tools unavailable)_`);
};

/* ---- Clickbait -------------------------------------------------- */
handlers.clickbait = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🎣 *Usage:* ${ctx.prefix}clickbait I made a cake`);
  const t = await ai(ctx, `Turn "${q}" into 8 clickbait-style headlines for YouTube/TikTok. Vary the formula: curiosity gap, number list, negative hook, challenge, transformation, warning. Keep each under 60 chars. Note: use responsibly, no false claims.`, 'You are a headline copywriter.');
  return reply(ctx, `🎣 *CLICKBAIT HEADLINES*\n\n${t || 'Nahi bana sake.'}`);
};

/* ---- Comment generator ------------------------------------------ */
handlers.commentgen = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `💬 *Usage:* ${ctx.prefix}commentgen beautiful sunset photo`);
  const t = await ai(ctx, `Write 10 genuine-sounding comments for a post about: "${q}". Mix: supportive, curious question, funny, insightful, and short emoji-only. Avoid generic "nice pic". Number them.`, 'You are a social media engagement expert.');
  return reply(ctx, `💬 *COMMENTS*\n\n${t || 'Nahi bana sake.'}`);
};

/* ---- Schedule --------------------------------------------------- */
handlers.schedule = async (ctx) => {
  const key = ctx.m.sender || 'anon';
  const q = textOf(ctx);
  const list = scheduleStore.get(key) || [];
  if (!q) {
    if (!list.length) return reply(ctx, `📅 Koi scheduled post nahi.\n\n*${ctx.prefix}schedule 2025-06-01 18:00 Post about launch*`);
    return reply(ctx, box(`📅 SCHEDULE (${list.length})`, list.map((s, i) => `${i + 1}. ${s.when} — ${s.text.slice(0, 50)}`)));
  }
  if (q.toLowerCase() === 'clear') { scheduleStore.delete(key); return reply(ctx, '🗑️ Schedule clear.'); }
  const m = q.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s+(.+)$/);
  if (!m) return reply(ctx, `📅 Format: ${ctx.prefix}schedule YYYY-MM-DD HH:MM <post text>`);
  list.push({ when: `${m[1]} ${m[2]}`, text: m[3], at: Date.now() });
  scheduleStore.set(key, list);
  return reply(ctx, `✅ *Scheduled!*\n\n📅 ${m[1]} ${m[2]}\n📝 ${m[3]}\n\n_Reminder list mein save ho gaya._`);
};

/* ---- Link in bio ------------------------------------------------ */
handlers.linkinbio = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🔗 *Usage:* ${ctx.prefix}linkinbio My Store | https://shop.com | https://youtube.com/@me`);
  const parts = q.split('|').map((x) => x.trim()).filter(Boolean);
  const title = parts[0] || 'My Links';
  const links = parts.slice(1);
  const lines = links.map((l, i) => `${i + 1}. 🔗 ${l}`);
  return reply(ctx, box(`🔗 LINK IN BIO — ${title.toUpperCase()}`, [
    ...(lines.length ? lines : ['Koi link nahi diya.']),
    '',
    '💡 *Free link-in-bio tools:*',
    '• linktr.ee',
    '• bio.link',
    '• beacons.ai',
    '• carrd.co',
    '',
    `_${ctx.prefix}linkinbio Title | url1 | url2_`
  ]));
};

module.exports = { handlers, scheduleStore };
