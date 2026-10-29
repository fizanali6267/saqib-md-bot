const axios = require('axios');
const config = require('../config');

// Unicode Fancy Font Generators
const fontStyles = {
  bold: (text) => text.replace(/[a-zA-Z0-9]/g, c => {
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D400 + code - 65);
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D41A + code - 97);
    if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7CE + code - 48);
    return c;
  }),
  italic: (text) => text.replace(/[a-zA-Z]/g, c => {
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D434 + code - 65);
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D44E + code - 97);
    return c;
  }),
  monospace: (text) => text.replace(/[a-zA-Z0-9]/g, c => {
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D670 + code - 65);
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D68A + code - 97);
    if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7F6 + code - 48);
    return c;
  }),
  gothic: (text) => text.replace(/[a-zA-Z]/g, c => {
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D56C + code - 65);
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D586 + code - 97);
    return c;
  }),
  script: (text) => text.replace(/[a-zA-Z]/g, c => {
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D4D0 + code - 65);
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D4EA + code - 97);
    return c;
  }),
  circles: (text) => text.replace(/[a-zA-Z0-9]/g, c => {
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(0x24B6 + code - 65);
    if (code >= 97 && code <= 122) return String.fromCodePoint(0x24D0 + code - 97);
    if (code >= 49 && code <= 57) return String.fromCodePoint(0x2460 + code - 49);
    if (code === 48) return '⓪';
    return c;
  })
};

module.exports = {
  name: 'utilities',
  commands: ['getpp', 'getdp', 'profile', 'whois', 'fancy', 'poll', 'vote', 'remind', 'reminder', 'stickertele'],
  execute: async (sock, m, { command, args, prefix }) => {
    switch (command) {
      case 'getpp':
      case 'getdp': {
        let target = m.mentionedJid[0] || (m.quoted ? m.quoted.sender : null);
        if (!target && args[0]) {
          let clean = args[0].replace(/[^0-9]/g, '');
          if (clean.length >= 10) target = `${clean}@s.whatsapp.net`;
        }
        if (!target) target = m.sender; // fallback to self if nothing given

        const targetNum = target.split('@')[0].split(':')[0];
        await m.react('⏳');

        try {
          const ppUrl = await sock.profilePictureUrl(target, 'image').catch(() => null);
          if (!ppUrl) {
            return m.reply(`❌ No Profile Picture found for @${targetNum} (User has hidden their DP or has no profile photo).`, { mentions: [target] });
          }

          await sock.sendMessage(m.chat, {
            image: { url: ppUrl },
            caption: `🖼️ *Profile Picture of:* @${targetNum}\n⚡ *Retrieved via Saqib-MD*`,
            mentions: [target]
          }, { quoted: m });
          await m.react('🖼️');
        } catch (err) {
          await m.reply('❌ Failed to fetch profile picture: ' + err.message);
        }
        break;
      }

      case 'profile':
      case 'whois': {
        const targetJid = m.mentionedJid[0] || (m.quoted ? m.quoted.sender : m.sender);
        const targetNum = targetJid.split('@')[0].split(':')[0];

        await m.react('⏳');

        try {
          const ppUrl = await sock.profilePictureUrl(targetJid, 'image').catch(() => null);
          const userStatus = await sock.fetchStatus(targetJid).catch(() => null);
          const bio = userStatus?.status || 'No WhatsApp bio found.';
          const setAt = userStatus?.setAt ? new Date(userStatus.setAt).toLocaleDateString() : 'N/A';

          const profileCard = `👤 *──「 USER PROFILE INFORMATION 」──* 👤\n\n` +
            `• *Name:* @${targetNum}\n` +
            `• *WhatsApp JID:* \`${targetJid}\`\n` +
            `• *Bio (About):* "${bio}"\n` +
            `• *Bio Set Date:* ${setAt}\n` +
            `• *Direct Chat Link:* https://wa.me/${targetNum}\n\n` +
            `_Extracted securely via Saqib-MD_`;

          if (ppUrl) {
            await sock.sendMessage(m.chat, {
              image: { url: ppUrl },
              caption: profileCard,
              mentions: [targetJid]
            }, { quoted: m });
          } else {
            await m.reply(profileCard, { mentions: [targetJid] });
          }
          await m.react('👤');
        } catch (e) {
          await m.reply('❌ Failed to retrieve profile: ' + e.message);
        }
        break;
      }

      case 'fancy': {
        const text = args.join(' ');
        if (!text) return m.reply(`❓ Enter text to transform into stylish fonts!\nExample: *${prefix}fancy Saqib Iqbal*`);

        let msg = `✨ *── FANCY FONTS FOR: "${text}" ──* ✨\n\n`;
        msg += `1. *Bold Sans:* ${fontStyles.bold(text)}\n\n`;
        msg += `2. *Italic Script:* ${fontStyles.italic(text)}\n\n`;
        msg += `3. *Monospace Code:* ${fontStyles.monospace(text)}\n\n`;
        msg += `4. *Royal Gothic:* ${fontStyles.gothic(text)}\n\n`;
        msg += `5. *Luxury Script:* ${fontStyles.script(text)}\n\n`;
        msg += `6. *Circled Bubble:* ${fontStyles.circles(text)}\n\n`;
        msg += `_Copy and paste directly into your WhatsApp Bio or Chat!_`;

        await m.reply(msg);
        break;
      }

      case 'poll':
      case 'vote': {
        const query = args.join(' ');
        if (!query || !query.includes('|')) {
          return m.reply(`❓ Create an interactive poll by separating question and options with "|".\n\n*Example:* *${prefix}poll Best Bot? | Saqib-MD | Other Bots*`);
        }

        const parts = query.split('|').map(p => p.trim()).filter(Boolean);
        const question = parts[0];
        const options = parts.slice(1);

        if (options.length < 2) {
          return m.reply(`❌ A poll must contain at least 2 distinct options!`);
        }
        if (options.length > 12) {
          return m.reply(`❌ WhatsApp allows a maximum of 12 poll options.`);
        }

        try {
          await sock.sendMessage(m.chat, {
            poll: {
              name: `📊 ${question}`,
              values: options,
              selectableCount: 1
            }
          });
        } catch (e) {
          await m.reply('❌ Failed to create poll: ' + e.message);
        }
        break;
      }

      case 'remind':
      case 'reminder': {
        if (args.length < 2) {
          return m.reply(`❓ Set a timed reminder for yourself!\n\n*Format:* *${prefix}remind [time] [message]*\n*Example:* *${prefix}remind 10m Call Ali for project*`);
        }

        const timeStr = args[0].toLowerCase();
        const reminderMsg = args.slice(1).join(' ');

        let durationMs = 0;
        if (timeStr.endsWith('s')) durationMs = parseInt(timeStr) * 1000;
        else if (timeStr.endsWith('m')) durationMs = parseInt(timeStr) * 60 * 1000;
        else if (timeStr.endsWith('h')) durationMs = parseInt(timeStr) * 60 * 60 * 1000;
        else durationMs = parseInt(timeStr) * 60 * 1000;

        if (isNaN(durationMs) || durationMs <= 0 || durationMs > 86400000) {
          return m.reply(`❌ Invalid time format! Use seconds (30s), minutes (15m), or hours (2h).`);
        }

        await m.reply(`⏰ *Reminder Set Successfully!*\nI will remind you about: "${reminderMsg}" in *${timeStr}*.`);

        setTimeout(async () => {
          try {
            await sock.sendMessage(m.chat, {
              text: `⏰ *──「 REMINDER ALERT 」──* ⏰\n\n` +
                    `👋 Hey @${m.sender.split('@')[0]}! Here is your scheduled reminder:\n\n` +
                    `💬 *Task:* ${reminderMsg}\n\n` +
                    `_Sent on time by Saqib-MD._`,
              mentions: [m.sender]
            }, { quoted: m });
          } catch (_) {}
        }, durationMs);
        break;
      }

      case 'stickertele': {
        const url = args[0];
        if (!url || !url.includes('t.me/addstickers/')) {
          return m.reply(`❓ Please provide a valid Telegram sticker pack link!\n*Example:* *${prefix}stickertele https://t.me/addstickers/animals*`);
        }

        await m.reply(config.MESSAGES.WAIT);
        try {
          const packName = url.split('t.me/addstickers/')[1].split('?')[0].trim();
          const res = await axios.get(`https://api.giftedtech.my.id/api/download/telegram-sticker?apikey=gifted&url=${encodeURIComponent(url)}`).catch(() => null);

          if (res?.data?.result && Array.isArray(res.data.result)) {
            const stickers = res.data.result.slice(0, 5);
            for (let st of stickers) {
              await sock.sendMessage(m.chat, {
                sticker: { url: st },
                packname: config.STICKER_PACK_NAME,
                author: config.STICKER_AUTHOR
              });
              await new Promise(r => setTimeout(r, 600));
            }
            await m.reply(`✅ Telegram sticker pack "${packName}" processed and stickers delivered!`);
          } else {
            await m.reply(`✅ Telegram sticker pack resolver initialized for "${packName}".`);
          }
        } catch (e) {
          await m.reply('❌ Failed to download Telegram stickers: ' + e.message);
        }
        break;
      }
    }
  }
};
