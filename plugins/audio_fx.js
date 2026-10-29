const crypto = require("crypto");
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const axios = require('axios');
const config = require('../config');

module.exports = {
  name: 'audio_fx',
  commands: ['bass', 'nightcore', 'slowed', 'reverb', 'reverse', 'mute', 'compress', 'circle', 'round', 'emojimix'],
  execute: async (sock, m, { command, args, prefix }) => {
    switch (command) {
      case 'bass':
      case 'nightcore':
      case 'slowed':
      case 'reverb':
      case 'reverse':
      case 'mute':
      case 'compress': {
        const targetMsg = m.quoted ? m.quoted : m;
        const isAudio = targetMsg.type?.includes('audio');
        const isVideo = targetMsg.type?.includes('video');

        if (!targetMsg || (!isAudio && !isVideo)) {
          return m.reply(`❓ Quote an audio or video message to apply *${prefix}${command}* effect!`);
        }

        await m.react('🎛️');
        try {
          const mediaBuffer = await targetMsg.download();
          const tmpId = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
          const extIn = isAudio ? 'mp3' : 'mp4';
          const extOut = (command === 'mute' || isVideo) ? 'mp4' : 'mp3';
          const tmpIn = path.join(os.tmpdir(), `in_${tmpId}.${extIn}`);
          const tmpOut = path.join(os.tmpdir(), `out_${tmpId}.${extOut}`);

          fs.writeFileSync(tmpIn, mediaBuffer);

          let filter = '';
          if (command === 'bass') filter = '-af "equalizer=f=60:width_type=h:width=50:g=15"';
          else if (command === 'nightcore') filter = '-af "asetrate=44100*1.25,atempo=1.0"';
          else if (command === 'slowed' || command === 'reverb') filter = '-af "asetrate=44100*0.85,atempo=1.0,aecho=0.8:0.88:60:0.4"';
          else if (command === 'reverse') filter = isAudio ? '-af "areverse"' : '-vf "reverse" -af "areverse"';
          else if (command === 'mute') filter = '-an -c:v copy';
          else if (command === 'compress') filter = isVideo ? '-vcodec libx264 -crf 28' : '-b:a 64k';

          exec(`ffmpeg -y -i "${tmpIn}" ${filter} "${tmpOut}"`, async (err) => {
            try {
              if (err || !fs.existsSync(tmpOut)) throw new Error(err?.message || 'FFmpeg conversion error');
              const resBuffer = fs.readFileSync(tmpOut);

              if (extOut === 'mp4') {
                await sock.sendMessage(m.chat, { video: resBuffer, caption: `🎬 *Processed with ${command.toUpperCase()} Effect*` }, { quoted: m });
              } else {
                await sock.sendMessage(m.chat, { audio: resBuffer, mimetype: 'audio/mpeg', ptt: false }, { quoted: m });
              }
              await m.react('✅');
            } catch (procErr) {
              await m.reply('❌ Audio effect failed: ' + procErr.message);
            } finally {
              try { fs.unlinkSync(tmpIn); } catch (_) {}
              try { fs.unlinkSync(tmpOut); } catch (_) {}
            }
          });
        } catch (e) {
          await m.reply('❌ Failed to process media: ' + e.message);
        }
        break;
      }

      case 'circle':
      case 'round': {
        const targetMsg = m.quoted ? m.quoted : m;
        if (!targetMsg || !targetMsg.type?.includes('image')) {
          return m.reply(`❓ Quote an image to turn it into a round circular sticker!`);
        }
        await m.react('⭕');
        try {
          const mediaBuffer = await targetMsg.download();
          const tmpId = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
          const tmpIn = path.join(os.tmpdir(), `c_in_${tmpId}.png`);
          const tmpOut = path.join(os.tmpdir(), `c_out_${tmpId}.webp`);
          fs.writeFileSync(tmpIn, mediaBuffer);

          const filter = `scale=512:512,format=rgba,geq=r='r(X,Y)':a='if(lte((X-256)*(X-256)+(Y-256)*(Y-256),256*256),255,0)'`;
          exec(`ffmpeg -y -i "${tmpIn}" -vf "${filter}" -vcodec libwebp -lossless 1 -loop 0 "${tmpOut}"`, async (err) => {
            try {
              if (err || !fs.existsSync(tmpOut)) throw err;
              await sock.sendMessage(m.chat, {
                sticker: fs.readFileSync(tmpOut),
                packname: config.STICKER_PACK_NAME,
                author: config.STICKER_AUTHOR
              }, { quoted: m });
              await m.react('✅');
            } catch (errCircle) {
              await m.reply('❌ Failed to create circular sticker.');
            } finally {
              try { fs.unlinkSync(tmpIn); } catch (_) {}
              try { fs.unlinkSync(tmpOut); } catch (_) {}
            }
          });
        } catch (e) {
          await m.reply('❌ Circle sticker error: ' + e.message);
        }
        break;
      }

      case 'emojimix': {
        const text = args.join(' ');
        const emojis = text.match(/(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu) || [];
        if (emojis.length < 2) {
          return m.reply(`❓ Provide 2 emojis to mix together!\n*Example:* *${prefix}emojimix 🐶+😎*`);
        }

        await m.react('🎨');
        try {
          const e1 = emojis[0];
          const e2 = emojis[1];
          const res = await axios.get(`https://tenor.googleapis.com/v2/featured?key=LIVDSRZULELA&limit=1`).catch(() => null);
          const mixUrl = `https://api.giftedtech.my.id/api/maker/emojimix?apikey=gifted&emoji1=${encodeURIComponent(e1)}&emoji2=${encodeURIComponent(e2)}`;
          const imgRes = await axios.get(mixUrl, { responseType: 'arraybuffer' }).catch(() => null);

          if (imgRes && imgRes.data) {
            await sock.sendMessage(m.chat, {
              sticker: Buffer.from(imgRes.data),
              packname: config.STICKER_PACK_NAME,
              author: config.STICKER_AUTHOR
            }, { quoted: m });
            await m.react('✅');
          } else {
            await m.reply(`🎨 *Emoji Mix created for:* ${e1} + ${e2}`);
          }
        } catch (e) {
          await m.reply('❌ Failed to mix emojis: ' + e.message);
        }
        break;
      }
    }
  }
};
