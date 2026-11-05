const config = require('../config');

/**
 * Multi-session management, from WhatsApp itself.
 *
 *   .sessions              — list every linked session + live status
 *   .session start <id>    — start a stopped session
 *   .session stop <id>     — stop a running session (keeps credentials)
 *   .session remove <id>   — stop + delete the session from the registry
 */
module.exports = {
  name: 'sessions',
  commands: ['sessions', 'sessionlist', 'mysessions', 'sessionmgr'],
  execute: async (sock, m, { command, args, prefix }) => {
    if (!config.checkIsOwner(m, sock)) return m.reply(config.MESSAGES.OWNER_ONLY);

    const botIndex = require('../index');
    const sessionStore = require('../lib/sessionStore');

    const sub = (args[0] || '').toLowerCase();
    const target = args[1];

    // ---- .session start|stop|remove <id> --------------------------------
    if (command === 'sessionmgr' && ['start', 'stop', 'remove', 'delete'].includes(sub)) {
      if (!target) {
        return m.reply(`❓ Usage: *${prefix}sessionmgr ${sub} <sessionId>*\n\nGet ids from *${prefix}sessions*.`);
      }
      try {
        if (sub === 'start') {
          await botIndex.SessionManager.start(target);
          return m.reply(`▶️ Session *${target}* is starting...`);
        }
        if (sub === 'stop') {
          await botIndex.SessionManager.stop(target);
          return m.reply(`⏸️ Session *${target}* has been stopped.`);
        }
        await botIndex.SessionManager.remove(target);
        return m.reply(`🗑️ Session *${target}* has been removed.`);
      } catch (e) {
        return m.reply(`❌ ${sub} failed: ${e?.message || e}`);
      }
    }

    // ---- .sessions : full list -----------------------------------------
    const runtime = botIndex.SessionManager.list();
    let registry = [];
    try { registry = await sessionStore.list(); } catch (_) {}

    const lines = [];

    if (runtime.length) {
      lines.push(`🟢 *RUNNING (${runtime.length})*`);
      runtime.forEach((s, i) => {
        const dot = s.connected ? '🟢' : (s.status === 'open' ? '🟡' : '🔴');
        lines.push(
          `${i + 1}. ${dot} *${s.sessionId}*\n` +
          `   📱 +${s.ownerNumber || '—'}\n` +
          `   ⚙️ ${s.status}${s.jid ? ` · ${String(s.jid).split('@')[0].split(':')[0]}` : ''}`
        );
      });
    } else {
      lines.push('🔴 *No sessions running.*');
    }

    const runningIds = new Set(runtime.map((s) => s.sessionId));
    const stopped = registry.filter((d) => !runningIds.has(d.sessionId));
    if (stopped.length) {
      lines.push('');
      lines.push(`⚪ *STOPPED (${stopped.length})*`);
      stopped.forEach((d, i) => {
        lines.push(`${i + 1}. *${d.sessionId}* — +${d.ownerNumber || '—'}${d.enabled === false ? ' (disabled)' : ''}`);
      });
    }

    lines.push('');
    lines.push(`_Manage: ${prefix}sessionmgr start|stop|remove <id>_`);

    return m.reply(`🗂️ *─── MULTI-SESSION MANAGER ───* 🗂️\n\n${lines.join('\n')}`);
  }
};
