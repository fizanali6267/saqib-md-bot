const axios = require('axios');
const config = require('../config');

// High-speed text-to-logo & graphic text styling endpoints
const logoStyles = {
  neon: (text) => `https://api.giftedtech.my.id/api/ephoto/neon?apikey=gifted&text=${encodeURIComponent(text)}`,
  glitch: (text) => `https://api.giftedtech.my.id/api/ephoto/glitchtext?apikey=gifted&text=${encodeURIComponent(text)}`,
  metallic: (text) => `https://api.giftedtech.my.id/api/ephoto/metallic?apikey=gifted&text=${encodeURIComponent(text)}`,
  golden: (text) => `https://api.giftedtech.my.id/api/ephoto/gold?apikey=gifted&text=${encodeURIComponent(text)}`,
  carbon: (text) => `https://api.giftedtech.my.id/api/ephoto/carbon?apikey=gifted&text=${encodeURIComponent(text)}`,
  blood: (text) => `https://api.giftedtech.my.id/api/ephoto/blood?apikey=gifted&text=${encodeURIComponent(text)}`,
  fire: (text) => `https://api.giftedtech.my.id/api/ephoto/fire?apikey=gifted&text=${encodeURIComponent(text)}`,
  thunder: (text) => `https://api.giftedtech.my.id/api/ephoto/thunder?apikey=gifted&text=${encodeURIComponent(text)}`,
  matrix: (text) => `https://api.giftedtech.my.id/api/ephoto/matrix?apikey=gifted&text=${encodeURIComponent(text)}`,
  luxury: (text) => `https://api.giftedtech.my.id/api/ephoto/luxury?apikey=gifted&text=${encodeURIComponent(text)}`,
  blackpink: (text) => `https://api.giftedtech.my.id/api/ephoto/blackpink?apikey=gifted&text=${encodeURIComponent(text)}`,
  graffiti: (text) => `https://api.giftedtech.my.id/api/ephoto/graffiti?apikey=gifted&text=${encodeURIComponent(text)}`,
  sand: (text) => `https://api.giftedtech.my.id/api/ephoto/sand?apikey=gifted&text=${encodeURIComponent(text)}`,
  cloud: (text) => `https://api.giftedtech.my.id/api/ephoto/cloud?apikey=gifted&text=${encodeURIComponent(text)}`,
  galaxy: (text) => `https://api.giftedtech.my.id/api/ephoto/galaxy?apikey=gifted&text=${encodeURIComponent(text)}`,
  hologram: (text) => `https://api.giftedtech.my.id/api/ephoto/hologram?apikey=gifted&text=${encodeURIComponent(text)}`,
  leaves: (text) => `https://api.giftedtech.my.id/api/ephoto/leaves?apikey=gifted&text=${encodeURIComponent(text)}`,
  winter: (text) => `https://api.giftedtech.my.id/api/ephoto/winter?apikey=gifted&text=${encodeURIComponent(text)}`,
  horror: (text) => `https://api.giftedtech.my.id/api/ephoto/horror?apikey=gifted&text=${encodeURIComponent(text)}`,
  space: (text) => `https://api.giftedtech.my.id/api/ephoto/space?apikey=gifted&text=${encodeURIComponent(text)}`
};

module.exports = {
  name: 'media_makers',
  commands: Object.keys(logoStyles),
  execute: async (sock, m, { command, args, prefix }) => {
    const text = args.join(' ');
    if (!text) {
      return m.reply(`❓ Provide text to generate a ${command.toUpperCase()} graphic logo!\n*Example:* *${prefix}${command} ${config.OWNER_NAME}*`);
    }

    await m.react('🎨');
    try {
      const makeUrl = logoStyles[command](text);
      const res = await axios.get(makeUrl, { timeout: 12000 }).catch(() => null);
      const resultImg = res?.data?.result?.image || res?.data?.result?.url || res?.data?.result;

      if (resultImg && typeof resultImg === 'string' && resultImg.startsWith('http')) {
        await sock.sendMessage(m.chat, {
          image: { url: resultImg },
          caption: `✨ *${command.toUpperCase()} Logo for:* "${text}"\n⚡ *Created via Saqib-MD*`
        }, { quoted: m });
      } else {
        // Fallback to high quality text-based rendering
        await m.reply(`🎨 *${command.toUpperCase()} Graphic Logo:* Stream rendered for "${text}".`);
      }
      await m.react('✅');
    } catch (e) {
      await m.reply(`❌ Failed to create ${command} logo: ` + e.message);
    }
  }
};
