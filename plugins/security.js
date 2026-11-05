const config = require('../config');

module.exports = {
  name: 'security',
  commands: ['antidelete', 'antiviewonce', 'autovv', 'vv', 'vv2', 'vvinbox', 'autoreact', 'autostatus', 'autobio', 'antibadword', 'anticall', 'aireact', 'alwaysonline', 'online', 'autoread', 'bluetick'],
  execute: async (sock, m, { command, args, prefix }) => {
    // Handling .vv and .vv2 (Can be executed by owner or user if public)
    if (command === 'vv' || command === 'vv2' || command === 'vvinbox') {
      const isOwner = config.checkIsOwner(m, sock);
      if (config.WORK_TYPE === 'private' && !isOwner) {
        return m.reply(config.MESSAGES.OWNER_ONLY);
      }

      // Robust view-once detection. `m.quoted.type` is rewritten to the INNER
      // content type (imageMessage/videoMessage) by serialize, so checking
      // `type === 'viewOnceMessage'` never matched. We inspect the raw payload.
      const raw = (m.quoted && (m.quoted.rawMessage || m.quoted.message)) || null;
      const VO_KEYS = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];
      const isViewOnce = !!(
        m.quoted &&
        (m.quoted.isViewOnce ||
          (raw && VO_KEYS.some((k) => raw[k])) ||
          m.quoted.msg?.viewOnce ||
          m.quoted.msg?.viewOnceV2)
      );

      // Also allow .vv on any quoted image/video (helpful, harmless).
      const quotedType = m.quoted?.type || '';
      const quotedMime = m.quoted?.msg?.mimetype || '';
      const isImage = quotedType.includes('image') || quotedMime.startsWith('image/');
      const isVideo = quotedType.includes('video') || quotedMime.startsWith('video/');
      const isMedia = isImage || isVideo;

      if (m.quoted && (isViewOnce || isMedia)) {
        try {
          await m.react('⏳');
          let buffer;
          try {
            buffer = await m.quoted.download();
          } catch (firstErr) {
            // Fallback: some clients deliver the payload without the wrapper.
            const { downloadMediaMessage } = require('@whiskeysockets/baileys');
            buffer = await downloadMediaMessage(
              {
                key: {
                  remoteJid: m.chat,
                  id: m.quoted.id,
                  participant: m.quoted.senderLid || m.quoted.sender,
                },
                message: raw,
              },
              'buffer',
              {}
            );
          }
          if (!buffer || !buffer.length) throw new Error('media download returned no data');

          const mediaType = isImage ? 'image' : 'video';

          // Determine destination: .vv = current chat, .vv2 = owner private inbox
          const isInboxMode = command === 'vv2' || command === 'vvinbox';
          const destinationChat = isInboxMode ? (config.getOwnerJid(sock) || m.chat) : m.chat;

          const senderJid = m.quoted.sender || m.quoted.senderLid || m.chat;
          const senderNumber = String(senderJid).split('@')[0].split(':')[0];
          const caption = isInboxMode
            ? `🔓 *── VIEW ONCE RECOVERED TO INBOX ──* 🔓\n👤 *Sent by:* @${senderNumber}\n💬 *Original Chat:* ${m.isGroup ? 'Group' : 'Direct DM'}\n🕒 *Time:* ${new Date().toLocaleTimeString()}`
            : `🔓 *View Once Media Recovered by Saqib-MD*`;

          await sock.sendMessage(destinationChat, {
            [mediaType]: buffer,
            caption,
            mentions: [senderJid],
          });

          if (isInboxMode) {
            await m.reply(`✅ *View-Once media has been sent secretly to your Personal Inbox (DM)!*`);
          }
          await m.react('✅');
        } catch (e) {
          await m.react('❌');
          await m.reply('❌ Failed to download ViewOnce media: ' + (e.message || 'unknown error'));
        }
      } else {
        await m.reply(`💡 Reply to a *View-Once* image or video with *${prefix}${command}*.\n• *${prefix}vv* (Recover it in the current chat)\n• *${prefix}vv2* (Send it secretly to your personal inbox)`);
      }
      return;
    }

    // Owner only commands for settings configuration
    const isOwner = config.checkIsOwner(m, sock);
    if (!isOwner) return m.reply(config.MESSAGES.OWNER_ONLY);

    const sub = args[0]?.toLowerCase();
    const val = args[1]?.toLowerCase();

    switch (command) {
      case 'antiviewonce':
      case 'autovv': {
        if (sub === 'on') {
          config.ANTI_VIEW_ONCE = true;
          config.AUTO_VIEW_ONCE = true;
          await m.reply(`🔓 *AUTO ANTI-VIEW-ONCE ACTIVATED!*\nFrom now on, whenever someone sends a View-Once photo or video in a group or DM, Saqib-MD will instantly download it and secretly send it to your *personal inbox (DM)*!`);
        } else if (sub === 'off') {
          config.ANTI_VIEW_ONCE = false;
          config.AUTO_VIEW_ONCE = false;
          await m.reply(`🔓 *Auto Anti-View-Once DISABLED.*`);
        } else {
          await m.reply(`Current Status: *${(config.ANTI_VIEW_ONCE || config.AUTO_VIEW_ONCE) ? 'ENABLED (Auto Inbox) ✅' : 'DISABLED ❌'}*\nUsage: *${prefix}autovv on* or *${prefix}autovv off*`);
        }
        break;
      }

      case 'alwaysonline': {
        if (sub === 'on') {
          config.ALWAYS_ONLINE = true;
          await sock.sendPresenceUpdate('available');
          await m.reply(`🟢 *ALWAYS ONLINE ACTIVATED!*\nYour WhatsApp will appear Online 24/7 to everyone, even when you are offline or asleep.`);
        } else if (sub === 'off') {
          config.ALWAYS_ONLINE = false;
          await sock.sendPresenceUpdate('unavailable');
          await m.reply(`⚪ *Always Online DEACTIVATED.* Normal presence restored.`);
        } else {
          await m.reply(`Current Status: *${config.ALWAYS_ONLINE ? 'ALWAYS ONLINE 🟢' : 'NORMAL ⚪'}*\nUsage: *${prefix}online on* or *${prefix}online off*`);
        }
        break;
      }

      case 'autoread':
      case 'bluetick': {
        if (sub === 'on') {
          config.AUTO_READ = true;
          await m.reply(`🔵 *AUTO READ / BLUE TICK ACTIVATED!*\nEvery incoming message will be marked as read (blue tick) instantly.`);
        } else if (sub === 'off') {
          config.AUTO_READ = false;
          await m.reply(`⚪ *DOUBLE GREY TICK MODE ACTIVATED!*\nMessages will not be auto-read (they will stay on double grey tick until you open them yourself).`);
        } else {
          await m.reply(`Current Status: *${config.AUTO_READ ? 'BLUE TICK (Auto Read) 🔵' : 'DOUBLE GREY TICK (No Read) ⚪'}*\nUsage: *${prefix}bluetick on* or *${prefix}bluetick off*`);
        }
        break;
      }

      case 'antidelete': {
        if (sub === 'same' || sub === 'chat') {
          config.ANTI_DELETE = true;
          config.ANTI_DELETE_MODE = 'same';
          await m.reply(`🛡️ *ANTI-DELETE: SAME CHAT MODE ACTIVATED!*\n\nDeleted messages will be recovered instantly in the same chat.`);
        } else if (sub === 'inbox' || sub === 'pm') {
          config.ANTI_DELETE = true;
          config.ANTI_DELETE_MODE = 'inbox';
          await m.reply(`🛡️ *ANTI-DELETE: INBOX MODE ACTIVATED!*\n\nDeleted messages will be sent secretly to your private chat (DM).`);
        } else if (sub === 'off') {
          config.ANTI_DELETE = false;
          await m.reply(`🛡️ *Anti-Delete has been TURNED OFF.*`);
        } else {
          await m.reply(`⚙️ *── ANTI-DELETE SETTINGS ──* ⚙️\n\n• *Status:* ${config.ANTI_DELETE ? 'ENABLED ✅' : 'DISABLED ❌'}\n• *Destination:* ${config.ANTI_DELETE_MODE.toUpperCase()}\n\nUsage: *${prefix}antidelete same* | *${prefix}antidelete inbox* | *${prefix}antidelete off*`);
        }
        break;
      }

      case 'autoreact': {
        if (sub === 'all') {
          config.AUTO_REACT = true;
          config.AUTO_REACT_MODE = 'all';
          await m.reply(`✨ *AUTO-REACT: ALL MESSAGES MODE!*`);
        } else if (sub === 'sender') {
          config.AUTO_REACT = true;
          config.AUTO_REACT_MODE = 'sender';
          await m.reply(`✨ *AUTO-REACT: SENDER ONLY MODE!*`);
        } else if (sub === 'me' || sub === 'receiver') {
          config.AUTO_REACT = true;
          config.AUTO_REACT_MODE = 'me';
          await m.reply(`✨ *AUTO-REACT: RECEIVER/ME ONLY MODE!*`);
        } else if (sub === 'mirror' || sub === 'match') {
          config.AUTO_REACT = true;
          config.AUTO_REACT_MODE = 'mirror';
          await m.reply(`✨ *AUTO-REACT: MIRROR EMOJI MODE!*`);
        } else if (sub === 'off') {
          config.AUTO_REACT = false;
          config.AUTO_REACT_MODE = 'off';
          await m.reply(`✨ *Auto-Reaction has been TURNED OFF.*`);
        } else {
          await m.reply(`Usage: *${prefix}autoreact all* | *sender* | *me* | *mirror* | *off*`);
        }
        break;
      }

      case 'autostatus': {
        if (sub === 'on') {
          config.AUTO_STATUS_READ = true;
          await m.reply(`👁️ *Auto-Status Viewer ENABLED!*`);
        } else if (sub === 'off') {
          config.AUTO_STATUS_READ = false;
          await m.reply(`👁️ *Auto-Status Viewer DISABLED.*`);
        } else if (sub === 'react') {
          config.AUTO_STATUS_REACT = (val === 'on');
          await m.reply(`💚 *Auto-Status Reaction:* ${config.AUTO_STATUS_REACT ? 'ENABLED' : 'DISABLED'}`);
        } else if (sub === 'emoji') {
          config.STATUS_REACT_EMOJI = args[1] || '❤️';
          config.AUTO_STATUS_REACT = true;
          await m.reply(`💚 *Status Reaction Emoji updated to:* ${config.STATUS_REACT_EMOJI}`);
        } else {
          await m.reply(`Usage: *${prefix}autostatus on/off* | *react on/off* | *emoji ❤️*`);
        }
        break;
      }

      case 'aireact': {
        config.AI_REACT = (sub === 'on');
        await m.reply(`🧠 *AI-React:* ${config.AI_REACT ? 'ENABLED' : 'DISABLED'}`);
        break;
      }

      case 'autobio': {
        config.AUTO_BIO = (sub === 'on');
        await m.reply(`🕒 *Auto-Bio:* ${config.AUTO_BIO ? 'ENABLED' : 'DISABLED'}\n_Status will automatically refresh every minute with live clock._`);
        break;
      }

      case 'antibadword': {
        config.ANTI_BADWORD = (sub === 'on');
        await m.reply(`🚫 *Anti-Badword:* ${config.ANTI_BADWORD ? 'ENABLED' : 'DISABLED'}\n_Inappropriate/abusive messages in groups will now be automatically deleted._`);
        break;
      }

      case 'anticall': {
        config.ANTI_CALL = (sub === 'on');
        await m.reply(`📵 *Anti-Call:* ${config.ANTI_CALL ? 'ENABLED' : 'DISABLED'}`);
        break;
      }
    }
  }
};
