const config = require('../config');

module.exports = {
  name: 'status_saver',
  commands: ['save', 'status', 'dlstatus', 'getstatus'],
  execute: async (sock, m, { command, args, prefix }) => {
    // Check if the user quoted a status message
    const isQuotedStatus = m.quoted && (
      m.quoted.chat === 'status@broadcast' || 
      m.msg?.contextInfo?.remoteJid === 'status@broadcast' ||
      m.quoted.type?.includes('image') ||
      m.quoted.type?.includes('video')
    );

    if (!m.quoted || (!m.quoted.type?.includes('image') && !m.quoted.type?.includes('video'))) {
      return m.reply(`💡 *How to Save Status:*\nReply to anyone's WhatsApp Status with *${prefix}${command}* to instantly receive the clean photo or video in your Inbox!`);
    }

    try {
      await m.react('⏳');
      const buffer = await m.quoted.download();
      const mediaType = m.quoted.type.includes('image') ? 'image' : 'video';
      const senderNum = (m.quoted.sender || m.sender).split('@')[0].split(':')[0];
      const ownerJid = `${config.OWNER_NUMBER}@s.whatsapp.net`;

      const captionText = `📥 *── STATUS SAVED BY SAQIB-MD ──* 📥\n\n` +
        `👤 *Status Owner:* @${senderNum}\n` +
        `🕒 *Captured At:* ${new Date().toLocaleTimeString()}\n` +
        `✨ *Delivered directly to your personal Inbox.*`;

      // Always deliver directly to the owner's personal inbox
      await sock.sendMessage(ownerJid, {
        [mediaType]: buffer,
        caption: captionText,
        mentions: [m.quoted.sender || m.sender]
      });

      // Confirm to current chat
      if (m.chat !== ownerJid) {
        await m.reply(`✅ *Status media has been saved and sent directly to your Personal Inbox (DM)!*`);
      }
      await m.react('📥');

    } catch (err) {
      await m.reply('❌ Failed to extract status media: ' + err.message);
    }
  }
};
