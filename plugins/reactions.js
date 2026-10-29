const axios = require('axios');
const config = require('../config');

// 100% Real, Working High-Speed Anime Reaction GIF APIs (SFW Endpoints)
const reactionEndpoints = {
  kiss: 'https://api.waifu.pics/sfw/kiss',
  angry: 'https://api.waifu.pics/sfw/bonk',
  love: 'https://api.waifu.pics/sfw/cuddle',
  lovebite: 'https://api.waifu.pics/sfw/bite',
  bite: 'https://api.waifu.pics/sfw/bite',
  hug: 'https://api.waifu.pics/sfw/hug',
  slap: 'https://api.waifu.pics/sfw/slap',
  pat: 'https://api.waifu.pics/sfw/pat',
  cry: 'https://api.waifu.pics/sfw/cry',
  cuddle: 'https://api.waifu.pics/sfw/cuddle',
  dance: 'https://api.waifu.pics/sfw/dance',
  wave: 'https://api.waifu.pics/sfw/wave',
  wink: 'https://api.waifu.pics/sfw/wink',
  punch: 'https://api.waifu.pics/sfw/bonk',
  blush: 'https://api.waifu.pics/sfw/blush',
  highfive: 'https://api.waifu.pics/sfw/highfive',
  kill: 'https://api.waifu.pics/sfw/kill',
  poke: 'https://api.waifu.pics/sfw/poke',
  happy: 'https://api.waifu.pics/sfw/happy',
  smile: 'https://api.waifu.pics/sfw/smile',
  nom: 'https://api.waifu.pics/sfw/nom'
};

const reactionTexts = {
  kiss: (s, t) => `💋 *Mwah!* @${s} gave a romantic sweet kiss to @${t}! ❤️`,
  angry: (s, t) => `😡 *Furious!* @${s} is furiously angry at @${t}! 💢`,
  love: (s, t) => `💖 *Pure Love!* @${s} is showing unconditional love to @${t}! 🥰`,
  lovebite: (s, t) => `🧛 *Love Bite!* @${s} gave a playful sweet love bite to @${t}! 🍓`,
  bite: (s, t) => `😬 *Chomp!* @${s} took a playful bite out of @${t}!`,
  hug: (s, t) => `🤗 *Warm Hug!* @${s} wrapped @${t} in a tight affectionate hug! ✨`,
  slap: (s, t) => `👋 *Ouch!* @${s} slapped @${t} right across the face! 💥`,
  pat: (s, t) => `💆 *Gentle Pat!* @${s} gently patted @${t}'s head! 🌸`,
  cry: (s, t) => `😭 *Tears!* @${s} is crying on @${t}'s shoulder! 💧`,
  cuddle: (s, t) => `🛌 *Cuddle!* @${s} is snuggling and cuddling up close with @${t}! 🧸`,
  dance: (s, t) => `💃 *Dance Party!* @${s} is joyfully dancing with @${t}! 🎶`,
  wave: (s, t) => `👋 *Hello!* @${s} enthusiastically waved at @${t}! ✨`,
  wink: (s, t) => `😉 *Wink!* @${s} playfully winked at @${t}! 💫`,
  punch: (s, t) => `👊 *Pow!* @${s} landed a powerful punch on @${t}! 💥`,
  blush: (s, t) => `😳 *Blushing!* @${s} is blushing shyly because of @${t}! 🌸`,
  highfive: (s, t) => `🙌 *High Five!* @${s} gave a thunderous high-five to @${t}! ✋`,
  kill: (s, t) => `⚔️ *Elimination!* @${s} dramatically took down @${t}! 💀`,
  poke: (s, t) => `👉 *Poke!* @${s} playfully poked @${t} to get their attention!`,
  happy: (s, t) => `😄 *Joy!* @${s} is feeling super happy spending time with @${t}! 🌟`,
  smile: (s, t) => `😊 *Bright Smile!* @${s} gave a heart-warming smile to @${t}! ☀️`,
  nom: (s, t) => `🍪 *Nom Nom!* @${s} is feeding delicious treats to @${t}! 😋`
};

module.exports = {
  name: 'reactions',
  commands: Object.keys(reactionEndpoints),
  execute: async (sock, m, { command, args, prefix }) => {
    const senderNumber = m.sender.split('@')[0].split(':')[0];
    const targetJid = m.mentionedJid[0] || (m.quoted ? m.quoted.sender : null);

    if (!targetJid) {
      return m.reply(`❓ Please mention someone or reply to their message!\nExample: *${prefix}${command} @user*`);
    }

    const targetNumber = targetJid.split('@')[0].split(':')[0];
    await m.react('✨');

    try {
      const endpoint = reactionEndpoints[command] || reactionEndpoints.love;
      const res = await axios.get(endpoint, { timeout: 7000 });
      const gifUrl = res.data?.url;

      if (!gifUrl) throw new Error('Reaction asset fetch failed');

      const captionFormatter = reactionTexts[command] || reactionTexts.love;
      const captionText = captionFormatter(senderNumber, targetNumber);

      await sock.sendMessage(m.chat, {
        video: { url: gifUrl },
        gifPlayback: true,
        caption: captionText,
        mentions: [m.sender, targetJid]
      }, { quoted: m });

    } catch (e) {
      const captionFormatter = reactionTexts[command] || reactionTexts.love;
      const captionText = captionFormatter(senderNumber, targetNumber);
      await m.reply(captionText, { mentions: [m.sender, targetJid] });
    }
  }
};
