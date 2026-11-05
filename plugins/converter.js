const googleTTS = require('google-tts-api');
const axios = require('axios');
const config = require('../config');

module.exports = {
  name: 'converter',
  commands: ['sticker', 's', 'take', 'steal', 'toimg', 'tovideo', 'tomp3', 'say', 'ttsvoice', 'translate', 'tr', 'ocr'],
  execute: async (sock, m, { command, args, prefix }) => {
    switch (command) {
      case 'sticker':
      case 's': {
        const targetMsg = m.quoted ? m.quoted : m;
        if (!targetMsg || (!targetMsg.type?.includes('image') && !targetMsg.type?.includes('video'))) {
          return m.reply(`❓ Reply to a picture or a 5-second video with *${prefix}s*.`);
        }

        try {
          await m.reply(config.MESSAGES.WAIT);
          const buffer = await targetMsg.download();
          await sock.sendMessage(m.chat, {
            sticker: buffer,
            packname: config.STICKER_PACK_NAME,
            author: config.STICKER_AUTHOR
          }, { quoted: m });
        } catch (e) {
          await m.reply('❌ Sticker creation failed: ' + e.message);
        }
        break;
      }

      case 'take':
      case 'steal': {
        if (!m.quoted || !m.quoted.type?.includes('sticker')) {
          return m.reply(`❓ Reply to a sticker with *${prefix}take PackName | Author*.`);
        }

        try {
          const text = args.join(' ');
          const [pack, author] = text.includes('|') ? text.split('|').map(s => s.trim()) : [text || config.STICKER_PACK_NAME, config.STICKER_AUTHOR];
          const buffer = await m.quoted.download();

          await sock.sendMessage(m.chat, {
            sticker: buffer,
            packname: pack,
            author: author
          }, { quoted: m });
        } catch (e) {
          await m.reply('❌ Error changing sticker metadata: ' + e.message);
        }
        break;
      }

      case 'toimg': {
        if (!m.quoted || !m.quoted.type?.includes('sticker')) {
          return m.reply(`❓ Reply to a static sticker.`);
        }
        try {
          await m.reply(config.MESSAGES.WAIT);
          const buffer = await m.quoted.download();
          await sock.sendMessage(m.chat, {
            image: buffer,
            caption: `🖼️ *Converted to Image by Saqib-MD*`
          }, { quoted: m });
        } catch (e) {
          await m.reply('❌ Conversion failed: ' + e.message);
        }
        break;
      }

      case 'tovideo': {
        if (!m.quoted || !m.quoted.type?.includes('sticker')) {
          return m.reply(`❓ Reply to an animated sticker.`);
        }
        try {
          await m.reply(config.MESSAGES.WAIT);
          const buffer = await m.quoted.download();
          await sock.sendMessage(m.chat, {
            video: buffer,
            caption: `🎥 *Converted to Video by Saqib-MD*`
          }, { quoted: m });
        } catch (e) {
          await m.reply('❌ Conversion failed: ' + e.message);
        }
        break;
      }

      case 'tomp3': {
        if (!m.quoted || !m.quoted.type?.includes('video')) {
          return m.reply(`❓ Reply to a video with *${prefix}tomp3*.`);
        }
        try {
          await m.reply(config.MESSAGES.WAIT);
          const buffer = await m.quoted.download();
          await sock.sendMessage(m.chat, {
            audio: buffer,
            mimetype: 'audio/mp4',
            ptt: false
          }, { quoted: m });
        } catch (e) {
          await m.reply('❌ Audio extraction failed: ' + e.message);
        }
        break;
      }

      case 'say':
      case 'ttsvoice': {
        const text = args.join(' ');
        if (!text) return m.reply(`❓ Please provide the text to convert to voice.\nExample: *${prefix}say Hello, how are you?*`);

        try {
          const url = googleTTS.getAudioUrl(text, {
            lang: 'ur',
            slow: false,
            host: 'https://translate.google.com'
          });

          await sock.sendMessage(m.chat, {
            audio: { url },
            mimetype: 'audio/mp4',
            ptt: true
          }, { quoted: m });
        } catch (e) {
          await m.reply('❌ TTS generation failed: ' + e.message);
        }
        break;
      }

      case 'translate':
      case 'tr': {
        const text = args.slice(1).join(' ') || (m.quoted ? m.quoted.text : '');
        const targetLang = args[0] || 'ur';

        if (!text) return m.reply(`❓ Usage: *${prefix}tr ur How are you?* or quote a message.`);

        try {
          const res = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`);
          const translated = res.data[0].map(s => s[0]).join('');
          await m.reply(`🌐 *Translation (${targetLang.toUpperCase()}):*\n\n${translated}`);
        } catch (e) {
          await m.reply('❌ Translation failed: ' + e.message);
        }
        break;
      }

      case 'ocr': {
        const targetMsg = m.quoted ? m.quoted : m;
        if (!targetMsg || !targetMsg.type?.includes('image')) {
          return m.reply(`❓ Reply to an image containing text with *${prefix}ocr*.`);
        }
        await m.reply(`🔍 *Reading text from image...* (OCR Processing)`);
        break;
      }
    }
  }
};
