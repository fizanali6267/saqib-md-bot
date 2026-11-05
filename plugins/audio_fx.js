const crypto = require("crypto");
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const axios = require('axios');
const config = require('../config');
const { createSticker } = require('../lib/sticker');

// ---------------------------------------------------------------------------
// Google Emoji Kitchen (gstatic) — free, keyless, always available.
// URL shape: https://www.gstatic.com/android/keyboard/emojikitchen/<date>/u<L>/u<L>_u<R>.png
// The date folder varies per emoji pair, so we probe all known release dates
// in parallel with HEAD requests and only download the matching image.
// ---------------------------------------------------------------------------
const KITCHEN_DATES = [
  '20201001','20210218','20210521','20210831','20211115','20220110','20220203',
  '20220406','20220506','20220815','20220823','20221101','20221107','20230118',
  '20230126','20230127','20230216','20230221','20230301','20230405','20230418',
  '20230421','20230426','20230803','20230818','20230821','20231113','20231128',
  '20240206','20240214','20240530','20240610','20240715','20241021','20241023',
  '20250130','20250204','20250430','20250501','20250519','20250731','20251029',
  '20260128','20260202','20260429'
];

function emojiCodepoints(emoji) {
  const cps = [...String(emoji)].map((c) => c.codePointAt(0).toString(16));
  const joined = cps.join('-');
  const noFe0f = joined.replace(/-fe0f/g, '');
  const out = new Set([joined]);
  if (noFe0f) out.add(noFe0f);
  return [...out];
}

async function probeKitchen(leftCp, rightCp) {
  const results = await Promise.all(
    KITCHEN_DATES.map(async (date) => {
      const url = `https://www.gstatic.com/android/keyboard/emojikitchen/${date}/u${leftCp}/u${leftCp}_u${rightCp}.png`;
      try {
        const res = await axios.head(url, { timeout: 8000, validateStatus: (s) => s === 200 });
        if (res.status === 200) return url;
      } catch (_) {}
      return null;
    })
  );
  return results.find(Boolean) || null;
}

async function findEmojiKitchen(e1, e2) {
  const lefts = emojiCodepoints(e1);
  const rights = emojiCodepoints(e2);
  // Try both orders — Google stores some pairs only one way round.
  for (const [a, b] of [[lefts, rights], [rights, lefts]]) {
    for (const l of a) {
      for (const r of b) {
        const url = await probeKitchen(l, r);
        if (url) {
          const img = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
          return { url, data: Buffer.from(img.data) };
        }
      }
    }
  }
  return null;
}

module.exports = {
  _internal: { emojiCodepoints, probeKitchen, findEmojiKitchen },
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
          const hit = await findEmojiKitchen(e1, e2);
          if (!hit) {
            await m.react('❌');
            return m.reply(
              `😔 *Google hasn't made a mix for* ${e1} + ${e2} *yet.*\n` +
                `Try another pair, e.g. *${prefix}emojimix 😂+😍* or *${prefix}emojimix 🐱+🔥*`
            );
          }
          const sticker = await createSticker(hit.data, {
            packName: config.STICKER_PACK_NAME,
            author: config.STICKER_AUTHOR,
            emoji: e1 + e2,
          });
          await sock.sendMessage(m.chat, { sticker }, { quoted: m });
          await m.react('✅');
        } catch (e) {
          await m.react('❌');
          await m.reply('❌ Failed to mix emojis: ' + (e.message || 'unknown error'));
        }
        break;
      }
    }
  }
};
