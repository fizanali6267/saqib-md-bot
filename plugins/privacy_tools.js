const config = require('../config');

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
          const isSenderAdmin = groupMeta?.participants.find(p => p.id === m.sender)?.admin || m.fromMe;
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
        if (!m.quoted) return m.reply(`❓ Reply to the message you want to forward!`);
        let destination = args[0]?.replace(/[^0-9]/g, '');
        if (!destination) destination = m.chat;
        else destination = `${destination}@s.whatsapp.net`;

        try {
          await sock.sendMessage(destination, { forward: m.quoted.msg }, { quoted: m });
          await m.reply(`✅ Message forwarded successfully.`);
        } catch (e) {
          await m.reply('❌ Failed to forward message: ' + e.message);
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
