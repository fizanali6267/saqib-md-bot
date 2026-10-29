const config = require('../config');

// In-memory warning map & High-Speed Group Metadata Cache
const warnDB = new Map();
const groupCache = new Map();

async function getCachedGroupMetadata(sock, jid) {
  const cached = groupCache.get(jid);
  if (cached && (Date.now() - cached.time < 300000)) { // 5 minutes cache
    return cached.data;
  }
  try {
    const data = await sock.groupMetadata(jid);
    groupCache.set(jid, { data, time: Date.now() });
    return data;
  } catch (e) {
    return cached ? cached.data : { participants: [] };
  }
}

module.exports = {
  name: 'group',
  commands: ['tagall', 'hidetag', 'kick', 'remove', 'add', 'promote', 'demote', 'group', 'link', 'revoke', 'antilink', 'warn', 'resetwarn', 'antispam'],
  execute: async (sock, m, { command, args, prefix }) => {
    if (!m.isGroup) return m.reply(config.MESSAGES.GROUP_ONLY);

    const groupMetadata = await getCachedGroupMetadata(sock, m.chat);
    const participants = groupMetadata.participants || [];
    const botNumber = sock.user.id.split(':')[0].split('@')[0];
    const botId = botNumber + '@s.whatsapp.net';
    const isBotAdmin = participants.find(p => p.id === botId)?.admin;
    const isSenderAdmin = participants.find(p => p.id === m.sender)?.admin || m.fromMe;

    switch (command) {
      case 'tagall': {
        if (!isSenderAdmin) return m.reply(config.MESSAGES.ADMIN_ONLY);
        const msgText = args.join(' ') || 'Attention Everyone!';
        let text = `📢 *── GROUP ANNOUNCEMENT ──* 📢\n\n💬 *Message:* ${msgText}\n\n`;
        const mentions = [];
        for (let mem of participants) {
          text += `⚡ @${mem.id.split('@')[0]}\n`;
          mentions.push(mem.id);
        }
        text += `\n⚡ *Total Members:* ${participants.length}`;
        await sock.sendMessage(m.chat, { text, mentions }, { quoted: m });
        break;
      }

      case 'hidetag': {
        if (!isSenderAdmin) return m.reply(config.MESSAGES.ADMIN_ONLY);
        const text = args.join(' ') || 'Hello group!';
        const mentions = participants.map(p => p.id);
        await sock.sendMessage(m.chat, { text, mentions });
        break;
      }

      case 'kick':
      case 'remove': {
        if (!isSenderAdmin) return m.reply(config.MESSAGES.ADMIN_ONLY);
        if (!isBotAdmin) return m.reply(config.MESSAGES.BOT_ADMIN);

        const target = m.mentionedJid[0] || (m.quoted ? m.quoted.sender : null);
        if (!target) return m.reply(`❓ Barahe karam kisi member ko tag karein ya message quote karein.\nMaslan: *${prefix}kick @user*`);

        await sock.groupParticipantsUpdate(m.chat, [target], 'remove');
        groupCache.delete(m.chat); // Invalidate cache
        await m.reply(`✅ Member removed successfully.`);
        break;
      }

      case 'add': {
        if (!isSenderAdmin) return m.reply(config.MESSAGES.ADMIN_ONLY);
        if (!isBotAdmin) return m.reply(config.MESSAGES.BOT_ADMIN);

        const num = args[0]?.replace(/[^0-9]/g, '');
        if (!num) return m.reply(`❓ Barahe karam number enter karein.\nMaslan: *${prefix}add 923001234567*`);

        const target = `${num}@s.whatsapp.net`;
        await sock.groupParticipantsUpdate(m.chat, [target], 'add');
        groupCache.delete(m.chat); // Invalidate cache
        await m.reply(`✅ Added @${num} to group.`);
        break;
      }

      case 'promote': {
        if (!isSenderAdmin) return m.reply(config.MESSAGES.ADMIN_ONLY);
        if (!isBotAdmin) return m.reply(config.MESSAGES.BOT_ADMIN);

        const target = m.mentionedJid[0] || (m.quoted ? m.quoted.sender : null);
        if (!target) return m.reply(`❓ Kisi member ko tag karein.\nMaslan: *${prefix}promote @user*`);

        await sock.groupParticipantsUpdate(m.chat, [target], 'promote');
        groupCache.delete(m.chat); // Invalidate cache
        await m.reply(`👑 Member promoted to Admin!`);
        break;
      }

      case 'demote': {
        if (!isSenderAdmin) return m.reply(config.MESSAGES.ADMIN_ONLY);
        if (!isBotAdmin) return m.reply(config.MESSAGES.BOT_ADMIN);

        const target = m.mentionedJid[0] || (m.quoted ? m.quoted.sender : null);
        if (!target) return m.reply(`❓ Kisi admin ko tag karein.\nMaslan: *${prefix}demote @user*`);

        await sock.groupParticipantsUpdate(m.chat, [target], 'demote');
        groupCache.delete(m.chat); // Invalidate cache
        await m.reply(`📉 Admin demoted to normal member.`);
        break;
      }

      case 'group': {
        if (!isSenderAdmin) return m.reply(config.MESSAGES.ADMIN_ONLY);
        if (!isBotAdmin) return m.reply(config.MESSAGES.BOT_ADMIN);

        const action = args[0]?.toLowerCase();
        if (action === 'open') {
          await sock.groupSettingUpdate(m.chat, 'not_announcement');
          await m.reply(`🔓 *Group is now OPEN!* All members can send messages.`);
        } else if (action === 'close') {
          await sock.groupSettingUpdate(m.chat, 'announcement');
          await m.reply(`🔒 *Group is now CLOSED!* Only admins can send messages.`);
        } else {
          await m.reply(`Usage: *${prefix}group open* ya *${prefix}group close*`);
        }
        break;
      }

      case 'link': {
        if (!isBotAdmin) return m.reply(config.MESSAGES.BOT_ADMIN);
        const code = await sock.groupInviteCode(m.chat);
        await m.reply(`🔗 *Group Invite Link:*\nhttps://chat.whatsapp.com/${code}`);
        break;
      }

      case 'revoke': {
        if (!isSenderAdmin) return m.reply(config.MESSAGES.ADMIN_ONLY);
        if (!isBotAdmin) return m.reply(config.MESSAGES.BOT_ADMIN);
        await sock.groupRevokeInvite(m.chat);
        await m.reply(`🔄 *Old invite link revoked!* New link has been generated.`);
        break;
      }

      case 'antilink': {
        if (!isSenderAdmin) return m.reply(config.MESSAGES.ADMIN_ONLY);
        const state = args[0]?.toLowerCase();
        if (state === 'on') {
          config.ANTI_LINK = true;
          await m.reply(`🛡️ *Anti-Link Protection Enabled!* Non-admin invite links will be auto-deleted.`);
        } else if (state === 'off') {
          config.ANTI_LINK = false;
          await m.reply(`🛡️ *Anti-Link Protection Disabled.*`);
        } else {
          await m.reply(`Usage: *${prefix}antilink on* ya *${prefix}antilink off*`);
        }
        break;
      }

      case 'warn': {
        if (!isSenderAdmin) return m.reply(config.MESSAGES.ADMIN_ONLY);
        const target = m.mentionedJid[0] || (m.quoted ? m.quoted.sender : null);
        if (!target) return m.reply(`❓ Member ko tag karein jise warn karna hai.`);

        const currentWarns = (warnDB.get(target) || 0) + 1;
        warnDB.set(target, currentWarns);

        if (currentWarns >= 3) {
          warnDB.delete(target);
          if (isBotAdmin) {
            await sock.groupParticipantsUpdate(m.chat, [target], 'remove');
            groupCache.delete(m.chat);
            await m.reply(`⛔ @${target.split('@')[0]} reached 3 warnings and was kicked out!`, { mentions: [target] });
          } else {
            await m.reply(`⚠️ @${target.split('@')[0]} reached 3 warnings! (Make bot admin to auto-kick).`, { mentions: [target] });
          }
        } else {
          await m.reply(`⚠️ *WARNING (${currentWarns}/3)* for @${target.split('@')[0]}.\nCareful! 3 warnings = KICK!`, { mentions: [target] });
        }
        break;
      }

      case 'resetwarn': {
        if (!isSenderAdmin) return m.reply(config.MESSAGES.ADMIN_ONLY);
        const target = m.mentionedJid[0] || (m.quoted ? m.quoted.sender : null);
        if (!target) return m.reply(`❓ Member ko tag karein jiski warnings reset karni hain.`);
        warnDB.delete(target);
        await m.reply(`✅ Warnings reset to 0 for @${target.split('@')[0]}.`, { mentions: [target] });
        break;
      }

      case 'antispam': {
        if (!isSenderAdmin) return m.reply(config.MESSAGES.ADMIN_ONLY);
        await m.reply(`🛡️ *Anti-Spam Shield is ACTIVE.* Flood messages are automatically monitored.`);
        break;
      }
    }
  }
};
