const config = require('../config');
const { flags: adminFlags, matches } = require('../lib/admin');
const mention = require('../lib/mention');

module.exports = {
  name: 'group_advanced',
  commands: ['tagadmin', 'listadmin', 'setname', 'setdesc', 'setgpp', 'mutechat', 'unmutechat', 'ghost', 'inactive', 'kickinactive'],
  execute: async (sock, m, { command, args, prefix }) => {
    if (!m.isGroup) return m.reply(config.MESSAGES.GROUP_ONLY);

    const groupMeta = await sock.groupMetadata(m.chat);
    const participants = groupMeta.participants || [];
    const { isBotAdmin, isSenderAdmin } = adminFlags(participants, sock, m);

    switch (command) {
      case 'tagadmin': {
        const admins = participants.filter(p => p.admin);
        let msg = `🚨 *── ATTENTION GROUP ADMINISTRATORS ──* 🚨\n\n`;
        const mentions = [];
        for (let adm of admins) {
          msg += `👑 @${adm.id.split('@')[0]}\n`;
          mentions.push(adm.id);
        }
        msg += `\n💬 *Reason:* ${args.join(' ') || 'Admin attention required immediately!'}`;
        await sock.sendMessage(m.chat, { text: msg, mentions }, { quoted: m });
        break;
      }

      case 'listadmin': {
        const admins = participants.filter(p => p.admin);
        let msg = `👑 *── GROUP ADMINISTRATORS (${groupMeta.subject}) ──* 👑\n\n`;
        admins.forEach((adm, i) => {
          msg += `${i + 1}. @${adm.id.split('@')[0]} [${adm.admin.toUpperCase()}]\n`;
        });
        await sock.sendMessage(m.chat, { text: msg, mentions: admins.map(a => a.id) }, { quoted: m });
        break;
      }

      case 'setname': {
        if (!isSenderAdmin) return m.reply(config.MESSAGES.ADMIN_ONLY);
        if (!isBotAdmin) return m.reply(config.MESSAGES.BOT_ADMIN);
        const newName = args.join(' ');
        if (!newName) return m.reply(`❓ Enter new group name!\nExample: *${prefix}setname Saqib-MD Official*`);

        await sock.groupUpdateSubject(m.chat, newName);
        await m.reply(`✅ Group subject updated to: *${newName}*`);
        break;
      }

      case 'setdesc': {
        if (!isSenderAdmin) return m.reply(config.MESSAGES.ADMIN_ONLY);
        if (!isBotAdmin) return m.reply(config.MESSAGES.BOT_ADMIN);
        const newDesc = args.join(' ');
        if (!newDesc) return m.reply(`❓ Enter new group description!\nExample: *${prefix}setdesc Welcome to our official group!*`);

        await sock.groupUpdateDescription(m.chat, newDesc);
        await m.reply(`✅ Group description updated successfully!`);
        break;
      }

      case 'setgpp': {
        if (!isSenderAdmin) return m.reply(config.MESSAGES.ADMIN_ONLY);
        if (!isBotAdmin) return m.reply(config.MESSAGES.BOT_ADMIN);
        const targetMsg = m.quoted ? m.quoted : m;
        if (!targetMsg || !targetMsg.type?.includes('image')) {
          return m.reply(`❓ Reply to an image to set it as Group Profile Icon!`);
        }
        try {
          const buffer = await targetMsg.download();
          await sock.updateProfilePicture(m.chat, buffer);
          await m.reply(`🖼️ *Group Icon updated successfully!*`);
        } catch (e) {
          await m.reply('❌ Failed to update group icon: ' + e.message);
        }
        break;
      }

      case 'mutechat': {
        if (!isSenderAdmin) return m.reply(config.MESSAGES.ADMIN_ONLY);
        if (!isBotAdmin) return m.reply(config.MESSAGES.BOT_ADMIN);
        await sock.groupSettingUpdate(m.chat, 'announcement');
        await m.reply(`🔒 *Group is now MUTED!* Only admins can send messages.`);
        break;
      }

      case 'unmutechat': {
        if (!isSenderAdmin) return m.reply(config.MESSAGES.ADMIN_ONLY);
        if (!isBotAdmin) return m.reply(config.MESSAGES.BOT_ADMIN);
        await sock.groupSettingUpdate(m.chat, 'not_announcement');
        await m.reply(`🔓 *Group is now UNMUTED!* All members can chat freely.`);
        break;
      }

      case 'ghost':
      case 'inactive': {
        if (!isSenderAdmin) return m.reply(config.MESSAGES.ADMIN_ONLY);

        // A "ghost" is a silent, non-admin member who never interacts.
        const ghosts = participants.filter(
          (p) =>
            !p.admin &&
            !matches(p, sock.user?.id) &&
            !matches(p, m.sender)
        );

        if (!ghosts.length) {
          return m.reply(`👻 *No ghosts found!* Every member here is an admin or the bot itself.`);
        }

        const lines = ['👻 *Ghost Found!* 👻', ''];
        const mentions = [];
        for (const p of ghosts.slice(0, 20)) {
          const jid = p.id || p.jid || p.lid;
          const label = mention.displayName(jid, p.name || p.notify || p.pushName);
          lines.push(`@${label} is a ghost!`);
          const mj = mention.mentionsFor(jid)[0];
          if (mj) mentions.push(mj);
        }
        if (ghosts.length > 20) lines.push(`…and *${ghosts.length - 20}* more.`);
        lines.push('', '👀 Watch out for them!');

        await sock.sendMessage(m.chat, { text: lines.join('\n'), mentions }, { quoted: m });
        break;
      }

      case 'kickinactive': {
        if (!isSenderAdmin) return m.reply(config.MESSAGES.ADMIN_ONLY);
        if (!isBotAdmin) return m.reply(config.MESSAGES.BOT_ADMIN);

        const targets = participants.filter(
          (p) => !p.admin && !matches(p, sock.user?.id) && !matches(p, m.sender)
        );
        if (!targets.length) return m.reply(`✅ *Nothing to purge.* No inactive non-admin members found.`);

        const jids = targets.map((p) => p.id || p.jid || p.lid).filter(Boolean);
        let removed = 0;
        try {
          const res = await sock.groupParticipantsUpdate(m.chat, jids, 'remove');
          removed = Array.isArray(res) ? res.filter((r) => String(r.status).includes('200')).length : jids.length;
        } catch (e) {
          return m.reply(`❌ *Purge failed:* ${e.message || 'unknown error'}`);
        }
        await m.reply(`🧹 *Purge complete.* Removed *${removed || jids.length}* inactive member(s) from the group.`);
        break;
      }
    }
  }
};
