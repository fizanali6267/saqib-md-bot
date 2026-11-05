const config = require('../config');
const { isAdmin } = require('../lib/admin');

module.exports = {
  name: 'privacy_tools',
  commands: ['del', 'dlt', 'vvphoto', 'vvvideo', 'forward', 'readmore', 'quoted'],
  execute: async (sock, m, { command, args, prefix }) => {
    switch (command) {
      case 'del':
      case 'dlt': {
        if (!m.quoted) return m.reply(`❓ Reply to the message you want to delete!`);

        // Check permissions: either message from bot, or user is admin in group
        const isBotMessage = m.quoted.fromMe;
        if (m.isGroup) {
          const groupMeta = await sock.groupMetadata(m.chat);
          const isSenderAdmin = isAdmin(groupMeta?.participants, m.sender) || m.fromMe;
          if (!isBotMessage && !isSenderAdmin) {
            return m.reply(config.MESSAGES.ADMIN_ONLY);
          }
        }

        try {
          await sock.sendMessage(m.chat, {
            delete: {
              remoteJid: m.chat,
              fromMe: m.quoted.fromMe,
              id: m.quoted.id,
              participant: m.quoted.sender
            }
          });
        } catch (e) {
          await m.reply('❌ Failed to delete message: ' + e.message);
        }
        break;
      }

      case 'vvphoto':
      case 'vvvideo': {
        const targetMsg = m.quoted ? m.quoted : m;
        const isImage = targetMsg.type?.includes('image');
        const isVideo = targetMsg.type?.includes('video');

        if (!targetMsg || (!isImage && !isVideo)) {
          return m.reply(`❓ Quote a photo or video to convert it into a View-Once message!`);
        }

        await m.react('🔒');
        try {
          const buffer = await targetMsg.download();
          const mediaType = isImage ? 'image' : 'video';
          await sock.sendMessage(m.chat, {
            [mediaType]: buffer,
            viewOnce: true,
            caption: args.join(' ') || '🔒 View-Once Media'
          }, { quoted: m });
          await m.react('✅');
        } catch (e) {
          await m.reply('❌ Error generating View-Once: ' + e.message);
        }
        break;
      }

      case 'forward': {
        if (!m.quoted) {
          return m.reply(
            `❓ *How to use ${prefix}forward:*\n\n` +
            `• Reply to any message and send *${prefix}forward* → forwards it to the current chat\n` +
            `• Reply and send *${prefix}forward 923001234567* → forwards it to that number\n` +
            `• Reply and send *${prefix}forward 1203630xxxx@g.us* → forwards it to a group\n\n` +
            `_Works with text, images, videos, stickers, audio and documents._`
          );
        }

        const rawDest = args[0] ? args[0].trim() : '';
        let destination = m.chat;
        if (rawDest) {
          if (rawDest.includes('@g.us')) {
            destination = rawDest;
          } else {
            const num = rawDest.replace(/[^0-9]/g, '');
            if (num.length < 8) {
              return m.reply(`⚠️ Invalid destination. Send a phone number (e.g. 923001234567) or a group JID.`);
            }
            destination = `${num}@s.whatsapp.net`;
          }
        }

        const content = m.quoted.rawMessage || m.quoted.message || null;
        if (!content || !Object.keys(content).length) {
          return m.reply('❌ *Failed to forward:* the quoted message has no content.');
        }

        // Baileys expects `forward` to be a WAMessage-like object with
        // `key` + `message`. Passing the raw content object caused the old
        // "no content in message" error.
        const forwardMessage = {
          key: {
            remoteJid: m.chat,
            fromMe: !!m.quoted.fromMe,
            id: m.quoted.id,
            participant: m.quoted.sender
          },
          message: content
        };

        try {
          await sock.sendMessage(destination, { forward: forwardMessage, force: true });
          await m.reply(`✅ Message forwarded successfully to *${destination.split('@')[0]}*.`);
        } catch (e) {
          await m.reply(`❌ Failed to forward message: ${e && e.message ? e.message : 'unknown error'}`);
        }
        break;
      }

      case 'readmore': {
        const text = args.join(' ');
        if (!text || !text.includes('|')) {
          return m.reply(`❓ Provide text before and after the spoiler divider "|".\n*Example:* *${prefix}readmore Click to see secret | The secret code is 1234!*`);
        }
        const [visible, hidden] = text.split('|').map(s => s.trim());
        const readMoreChar = String.fromCharCode(8206).repeat(4001);
        await m.reply(`${visible}${readMoreChar}\n\n${hidden}`);
        break;
      }

      case 'quoted': {
        if (!m.quoted) return m.reply(`❓ Reply to any message to unpack its hidden stanza details!`);
        const senderNum = m.quoted.sender.split('@')[0];
        const msg = `📑 *── QUOTED MESSAGE METADATA ──* 📑\n\n` +
          `• *Sender:* @${senderNum}\n` +
          `• *Message ID:* \`${m.quoted.id}\`\n` +
          `• *Type:* ${m.quoted.type}\n` +
          `• *Text Length:* ${m.quoted.text?.length || 0} characters\n` +
          `• *From Me:* ${m.quoted.fromMe ? 'Yes' : 'No'}`;
        await m.reply(msg, { mentions: [m.quoted.sender] });
        break;
      }
    }
  }
};
