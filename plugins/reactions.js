const axios = require('axios');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../config');
const mention = require('../lib/mention');

/**
 * Anime reaction GIFs.
 * -------------------------------------------------------------------------
 * The old implementation used api.waifu.pics, which is now dead (empty
 * responses), so every command fell back to a plain text message. This
 * version uses api.otakugifs.xyz (verified working), downloads the GIF itself
 * and delivers it as an animated video so the recipient sees the animation
 * immediately instead of a text line.
 */

// command -> otakugifs reaction slug
const REACTIONS = {
  kiss: 'kiss',
  airkiss: 'airkiss',
  cry: 'cry',
  sad: 'sad',
  angry: 'mad',
  mad: 'mad',
  angrystare: 'angrystare',
  love: 'love',
  lovebite: 'bite',
  bite: 'bite',
  hug: 'hug',
  cuddle: 'cuddle',
  nuzzle: 'nuzzle',
  handhold: 'handhold',
  slap: 'slap',
  smack: 'smack',
  punch: 'punch',
  pat: 'pat',
  poke: 'poke',
  pinch: 'pinch',
  tickle: 'tickle',
  dance: 'dance',
  wave: 'wave',
  wink: 'wink',
  blush: 'blush',
  shy: 'shy',
  happy: 'happy',
  smile: 'smile',
  laugh: 'laugh',
  yay: 'yay',
  celebrate: 'celebrate',
  cheers: 'cheers',
  clap: 'clap',
  slowclap: 'slowclap',
  brofist: 'brofist',
  highfive: 'brofist',
  thumbsup: 'thumbsup',
  facepalm: 'facepalm',
  headbang: 'headbang',
  sing: 'sing',
  sleep: 'sleep',
  tired: 'tired',
  yawn: 'yawn',
  sip: 'sip',
  nom: 'nom',
  drool: 'drool',
  lick: 'lick',
  bleh: 'bleh',
  pout: 'pout',
  confused: 'confused',
  huh: 'huh',
  shrug: 'shrug',
  sigh: 'sigh',
  sorry: 'sorry',
  stare: 'stare',
  scared: 'scared',
  nervous: 'nervous',
  sweat: 'sweat',
  shout: 'shout',
  surprised: 'surprised',
  woah: 'woah',
  cool: 'cool',
  smug: 'smug',
  nyah: 'nyah',
  nosebleed: 'nosebleed',
  peek: 'peek',
  run: 'run',
  roll: 'roll',
  stop: 'stop',
  yes: 'yes',
  no: 'no',
  evillaugh: 'evillaugh',
  kill: 'smack'
};

// Emoji + caption per reaction. Pure English, friendly, no LID numbers.
const CAPTIONS = {
  kiss: (a, b) => `💋 *Mwah!* ${a} just gave ${b} a sweet romantic kiss! ❤️`,
  airkiss: (a, b) => `😘 *Air Kiss!* ${a} blew a flying kiss to ${b}! 💨`,
  cry: (a, b) => `😭 *Tears!* ${a} is crying on ${b}'s shoulder! 💧`,
  sad: (a, b) => `🥺 *Feeling Down!* ${a} feels sad because of ${b}.`,
  angry: (a, b) => `😡 *Furious!* ${a} is absolutely furious with ${b}! 💢`,
  mad: (a, b) => `😠 *So Mad!* ${a} is mad at ${b} right now!`,
  angrystare: (a, b) => `😤 *Death Stare!* ${a} is glaring at ${b} without blinking!`,
  love: (a, b) => `💖 *Pure Love!* ${a} is showering love on ${b}! 🥰`,
  lovebite: (a, b) => `🧛 *Love Bite!* ${a} playfully bit ${b}! 🍓`,
  bite: (a, b) => `😬 *Chomp!* ${a} took a playful bite out of ${b}!`,
  hug: (a, b) => `🤗 *Warm Hug!* ${a} wrapped ${b} in a tight hug! ✨`,
  cuddle: (a, b) => `🛌 *Cuddle!* ${a} is snuggling up close with ${b}! 🧸`,
  nuzzle: (a, b) => `🐾 *Nuzzle!* ${a} nuzzled softly against ${b}.`,
  handhold: (a, b) => `🤝 *Hand in Hand!* ${a} is holding ${b}'s hand! 💞`,
  slap: (a, b) => `@${a} slapped @${b} 💥😂`,
  smack: (a, b) => `💢 *Smack!* ${a} smacked ${b}! 😵`,
  punch: (a, b) => `👊 *Pow!* ${a} landed a powerful punch on ${b}! 💥`,
  pat: (a, b) => `💆 *Gentle Pat!* ${a} gently patted ${b}'s head! 🌸`,
  poke: (a, b) => `👉 *Poke!* ${a} poked ${b} to get their attention!`,
  pinch: (a, b) => `🤏 *Pinch!* ${a} pinched ${b}'s cheek! 😖`,
  tickle: (a, b) => `🤣 *Tickle Attack!* ${a} is tickling ${b} mercilessly!`,
  dance: (a, b) => `💃 *Dance Party!* ${a} is dancing joyfully with ${b}! 🎶`,
  wave: (a, b) => `👋 *Hello!* ${a} waved enthusiastically at ${b}! ✨`,
  wink: (a, b) => `😉 *Wink!* ${a} playfully winked at ${b}! 💫`,
  blush: (a, b) => `😳 *Blushing!* ${a} is blushing shyly because of ${b}! 🌸`,
  shy: (a, b) => `🙈 *So Shy!* ${a} is hiding their face from ${b}.`,
  happy: (a, b) => `😄 *Joy!* ${a} is super happy spending time with ${b}! 🌟`,
  smile: (a, b) => `😊 *Bright Smile!* ${a} gave a heart-warming smile to ${b}! ☀️`,
  laugh: (a, b) => `😂 *Hahaha!* ${a} cannot stop laughing at ${b}!`,
  yay: (a, b) => `🎉 *Yay!* ${a} is celebrating with ${b}!`,
  celebrate: (a, b) => `🎊 *Celebration!* ${a} and ${b} are celebrating together!`,
  cheers: (a, b) => `🥂 *Cheers!* ${a} raised a glass with ${b}!`,
  clap: (a, b) => `👏 *Applause!* ${a} is clapping for ${b}!`,
  slowclap: (a, b) => `👏 *Slow Clap!* ${a} is slowly clapping at ${b}...`,
  brofist: (a, b) => `🤜 *Brofist!* ${a} bumped fists with ${b}!`,
  highfive: (a, b) => `🙌 *High Five!* ${a} gave a thunderous high-five to ${b}! ✋`,
  thumbsup: (a, b) => `👍 *Nice!* ${a} gave ${b} a big thumbs up!`,
  facepalm: (a, b) => `🤦 *Facepalm!* ${a} facepalmed because of ${b}.`,
  headbang: (a, b) => `🤘 *Headbang!* ${a} is headbanging with ${b}!`,
  sing: (a, b) => `🎤 *Singing!* ${a} is singing a song for ${b}!`,
  sleep: (a, b) => `😴 *Zzz...* ${a} fell asleep next to ${b}.`,
  tired: (a, b) => `🥱 *So Tired!* ${a} is exhausted after dealing with ${b}.`,
  yawn: (a, b) => `🥱 *Yawn!* ${a} yawned right at ${b}.`,
  sip: (a, b) => `☕ *Sip!* ${a} is sipping tea with ${b}.`,
  nom: (a, b) => `🍪 *Nom Nom!* ${a} is feeding treats to ${b}! 😋`,
  drool: (a, b) => `🤤 *Drooling!* ${a} is drooling over ${b}.`,
  lick: (a, b) => `😋 *Lick!* ${a} licked ${b}!`,
  bleh: (a, b) => `😝 *Bleh!* ${a} stuck their tongue out at ${b}!`,
  pout: (a, b) => `😤 *Pout!* ${a} is pouting at ${b}.`,
  confused: (a, b) => `😕 *Confused!* ${a} has no idea what ${b} is talking about.`,
  huh: (a, b) => `🤨 *Huh?* ${a} is totally lost because of ${b}.`,
  shrug: (a, b) => `🤷 *Shrug!* ${a} has no clue what ${b} means.`,
  sigh: (a, b) => `😮‍💨 *Sigh...* ${a} sighed deeply at ${b}.`,
  sorry: (a, b) => `🙇 *Sorry!* ${a} is apologising to ${b}.`,
  stare: (a, b) => `👁️ *Staring!* ${a} is silently staring at ${b}...`,
  scared: (a, b) => `😱 *Scared!* ${a} is terrified of ${b}!`,
  nervous: (a, b) => `😰 *Nervous!* ${a} is sweating nervously around ${b}.`,
  sweat: (a, b) => `💧 *Sweating!* ${a} is sweating because of ${b}.`,
  shout: (a, b) => `📢 *Shout!* ${a} is shouting at ${b}!`,
  surprised: (a, b) => `😲 *Surprised!* ${a} was shocked by ${b}!`,
  woah: (a, b) => `😮 *Woah!* ${a} is amazed by ${b}!`,
  cool: (a, b) => `😎 *So Cool!* ${a} is acting cool in front of ${b}.`,
  smug: (a, b) => `😏 *Smug!* ${a} is feeling very smug about ${b}.`,
  nyah: (a, b) => `😼 *Nyah!* ${a} is teasing ${b}!`,
  nosebleed: (a, b) => `🩸 *Nosebleed!* ${a} got a nosebleed because of ${b}!`,
  peek: (a, b) => `👀 *Peeking!* ${a} is secretly peeking at ${b}.`,
  run: (a, b) => `🏃 *Run!* ${a} is running away from ${b}!`,
  roll: (a, b) => `🌀 *Roll!* ${a} rolled away from ${b}.`,
  stop: (a, b) => `✋ *Stop!* ${a} told ${b} to stop!`,
  yes: (a, b) => `✅ *Yes!* ${a} agreed with ${b}.`,
  no: (a, b) => `❌ *No!* ${a} refused ${b}.`,
  evillaugh: (a, b) => `😈 *Evil Laugh!* ${a} is laughing wickedly at ${b}!`,
  kill: (a, b) => `⚔️ *Eliminated!* ${a} dramatically took down ${b}! 💀`
};

const API_HOST = 'https://api.otakugifs.xyz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Small in-memory cache so repeat reactions are instant.
const urlCache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

async function fetchGifUrl(slug) {
  const hit = urlCache.get(slug);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.url;

  const res = await axios.get(`${API_HOST}/gif`, {
    params: { reaction: slug },
    timeout: 9000,
    headers: { 'User-Agent': UA, Accept: 'application/json' }
  });
  const url = res.data && res.data.url;
  if (!url || !/^https?:\/\//i.test(url)) throw new Error('No gif url in response');
  urlCache.set(slug, { url, at: Date.now() });
  return url;
}

async function fetchBuffer(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 15000,
    maxContentLength: 12 * 1024 * 1024,
    headers: { 'User-Agent': UA, Accept: 'image/gif,image/*,*/*' }
  });
  return Buffer.from(res.data);
}

/**
 * Convert an animated GIF to an MP4 so WhatsApp plays it inline as a looping
 * "GIF". Falls back to null when ffmpeg is unavailable.
 */
function gifToMp4(gifBuffer) {
  return new Promise((resolve) => {
    let dir;
    try {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react_'));
    } catch (_) {
      return resolve(null);
    }
    const input = path.join(dir, 'in.gif');
    const output = path.join(dir, 'out.mp4');
    try {
      fs.writeFileSync(input, gifBuffer);
    } catch (_) {
      return resolve(null);
    }
    execFile('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-i', input,
      '-movflags', 'faststart',
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-an',
      output
    ], { timeout: 20000 }, (err) => {
      let buf = null;
      try {
        if (!err && fs.existsSync(output)) buf = fs.readFileSync(output);
      } catch (_) {}
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
      resolve(buf);
    });
  });
}

module.exports = {
  name: 'reactions',
  commands: Object.keys(REACTIONS),
  execute: async (sock, m, { command, args, prefix }) => {
    const slug = REACTIONS[command] || 'kiss';

    // Resolve participants to REAL phone numbers (never expose a raw LID).
    const targetJid = (m.mentionedJid && m.mentionedJid[0]) || (m.quoted ? m.quoted.sender : null);

    if (!targetJid) {
      return m.reply(
        `❓ Please mention someone or reply to their message.\n` +
        `Example: *${prefix}${command} @user*`
      );
    }

    const senderLabel = mention.displayName(m.sender, m.pushName);
    const targetLabel = mention.displayName(targetJid, m.quoted && m.quoted.pushName);
    const caption = (CAPTIONS[command] || CAPTIONS.kiss)(senderLabel, targetLabel);
    const mentions = mention.mentionsFor(m.sender, targetJid);

    // Acknowledge instantly so the user sees something within ~100ms.
    m.react('✨').catch(() => null);

    let gifBuffer = null;
    try {
      const gifUrl = await fetchGifUrl(slug);
      gifBuffer = await fetchBuffer(gifUrl);
    } catch (_) {
      gifBuffer = null;
    }

    if (!gifBuffer || gifBuffer.length < 200) {
      try {
        const retrySlug = slug === 'kiss' ? 'love' : 'kiss';
        const gifUrl = await fetchGifUrl(retrySlug);
        gifBuffer = await fetchBuffer(gifUrl);
      } catch (_) {}
    }

    if (!gifBuffer || gifBuffer.length < 200) {
      return m.reply(`${caption}\n\n_GIF service is temporarily unavailable, please try again._`, { mentions });
    }

    const mp4 = await gifToMp4(gifBuffer);

    const attempts = [];
    if (mp4) {
      attempts.push({ video: mp4, gifPlayback: true, caption, mentions, mimetype: 'video/mp4' });
    }
    attempts.push({ video: gifBuffer, gifPlayback: true, caption, mentions, mimetype: 'video/mp4' });
    attempts.push({ image: gifBuffer, caption, mentions, mimetype: 'image/gif' });

    for (const payload of attempts) {
      try {
        await sock.sendMessage(m.chat, payload, { quoted: m });
        return;
      } catch (_) {
        // try the next representation
      }
    }

    try {
      await m.reply(caption, { mentions });
    } catch (_) {}
  }
};
