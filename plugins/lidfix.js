'use strict';
/**
 * plugins/lidfix.js — identity / LID / group diagnostics
 * -------------------------------------------------------------------------
 * Two long-standing bugs were caused by WhatsApp's LID (Linked ID) migration:
 *
 *   1. "Message Yourself" showed "Waiting for this message. This may take a
 *      while." — the bot replied to a fabricated `<15-digit>@s.whatsapp.net`
 *      JID instead of the real `@lid` chat.
 *
 *   2. The bot worked in a 3-member group but not in a 600-member group —
 *      large groups are LID-addressed, so Baileys reported `fromMe: false` for
 *      the owner's own messages and the bot ignored every command.
 *
 * This plugin exists so the fix can be verified from inside WhatsApp, without
 * digging through Railway logs.
 */

const config = require('../config');
const identity = require('../lib/identity');

let lid = null;
try { lid = require('../lib/lid'); } catch (_) { lid = null; }

module.exports = {
  name: 'lidfix',
  commands: ['myid', 'lidinfo', 'groupdebug', 'identity'],

  async execute(sock, m, { command }) {
    if (!config.checkIsOwner(m, sock)) return m.reply(config.MESSAGES.OWNER_ONLY);

    const own = identity.ownIdentifiers(sock);
    const lines = [];

    lines.push('━━━━━━━━━━━━━━━━━━━━━');
    lines.push('   🪪 *IDENTITY DIAGNOSTICS*');
    lines.push('━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`📱 *Own phone*  : ${own.pn || 'unknown'}`);
    lines.push(`🔗 *Own LID*    : ${own.lid || 'unknown'}`);
    lines.push(`🗺️  *LID map*    : ${lid ? lid.size() : 0} pairs known`);
    lines.push('');
    lines.push(`💬 *Chat JID*   : ${m.chat}`);
    lines.push(`🧩 *Addressing* : ${m.addressingMode === 'lid' ? 'LID' : 'Phone number'}`);
    lines.push(`👥 *Group size* : ${m.isGroup ? 'see below' : 'n/a (DM)'}`);
    lines.push(`🙋 *Sender raw* : ${m.senderRaw || 'n/a'}`);
    lines.push(`🙋 *Sender*     : ${m.sender}`);
    lines.push(`👤 *From me*    : ${m.fromMe ? 'YES ✅' : 'NO ❌'}`);
    lines.push(`👑 *Owner check*: ${config.checkIsOwner(m, sock) ? 'PASS ✅' : 'FAIL ❌'}`);
    lines.push(`🛡️  *Work type*  : ${config.WORK_TYPE}`);
    lines.push('━━━━━━━━━━━━━━━━━━━━━');

    if (m.isGroup) {
      try {
        const meta = await sock.groupMetadata(m.chat);
        const participants = Array.isArray(meta?.participants) ? meta.participants : [];
        const lidCount = participants.filter((p) => String(p.id || '').endsWith('@lid')).length;
        lines.push('');
        lines.push('📊 *GROUP DETAIL*');
        lines.push('━━━━━━━━━━━━━━━━━━━━━');
        lines.push(`📛 *Name*        : ${meta?.subject || 'n/a'}`);
        lines.push(`👥 *Members*     : ${participants.length}`);
        lines.push(`🔗 *LID members* : ${lidCount} / ${participants.length}`);
        lines.push(`🧩 *Addr. mode*  : ${meta?.addressingMode || (lidCount ? 'lid' : 'pn')}`);
        lines.push(`🚫 *Announce*    : ${meta?.announce ? 'admins only' : 'everyone'}`);
        lines.push('━━━━━━━━━━━━━━━━━━━━━');

        if (participants.length > 150) {
          lines.push('');
          lines.push('ℹ️ _Large group detected — auto-react is throttled here so');
          lines.push('WhatsApp does not rate-limit the bot._');
        }
      } catch (e) {
        lines.push(`⚠️ *Group metadata error:* ${e?.message || e}`);
      }
    }

    lines.push('');
    lines.push('✅ _If "From me" and "Owner check" both pass, commands work in this chat._');

    return m.reply(lines.join('\n'));
  }
};
