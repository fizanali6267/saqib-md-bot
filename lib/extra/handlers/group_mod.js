'use strict';
/**
 * Group automation / moderation handlers (30 commands).
 * autoapprove, welcomemsg, goodbyemsg, filters, stopfilter, wordblacklist,
 * warnlimit, lockchat, unlockchat, slowmode, captcha, unpin, cleanbots,
 * purge, staff, rules, setrules, bansystem, tempban, roleassign, auditlog,
 * membercount, welcometoggle, goodbyetoggle, nsfwblock, mentionall,
 * groupinfo, setephemeral, invite, broadcastgroup
 */
const U = require('../util');

const { textOf, need, reply, box, isOwner, isGroup, isAdmin, pick, randInt } = U;

const handlers = {};

/* ------------------------------------------------------------------ */
/* Per-group settings store (in-memory, survives until restart)        */
/* ------------------------------------------------------------------ */
const settings = new Map(); // jid -> object

function gs(jid) {
  if (!settings.has(jid)) {
    settings.set(jid, {
      autoapprove: false,
      welcome: true,
      goodbye: true,
      welcomeMsg: 'Welcome @user to *@group*! 🎉',
      goodbyeMsg: 'Goodbye @user 👋',
      filters: {},          // trigger -> response
      blacklist: [],        // banned words
      warnLimit: 3,
      lockchat: false,
      slowmode: 0,          // seconds
      captcha: false,
      nsfwblock: false,
      rules: '',
      tempbans: {},         // jid -> expiry
      roles: {},            // jid -> role
      audit: []             // recent actions
    });
  }
  return settings.get(jid);
}

function audit(jid, actor, action) {
  const s = gs(jid);
  s.audit.unshift({ actor: String(actor).split('@')[0], action, at: Date.now() });
  s.audit = s.audit.slice(0, 40);
}

async function meta(ctx) {
  try { return await ctx.sock.groupMetadata(ctx.m.chat); } catch (e) { return { participants: [], subject: '', desc: '' }; }
}

function isSenderAdmin(participants, ctx) {
  const sender = ctx.m.sender;
  const p = participants.find((x) => x.id === sender || x.lid === sender || (x.id && x.id.split('@')[0] === String(sender).split('@')[0]));
  return !!(p && (p.admin === 'admin' || p.admin === 'superadmin'));
}

async function requireAdmin(ctx) {
  if (!ctx.m.isGroup) { await reply(ctx, '⚠️ Yeh command sirf group mein chalti hai.'); return null; }
  const md = await meta(ctx);
  const ok = isSenderAdmin(md.participants || [], ctx) || isOwner(ctx);
  if (!ok) { await reply(ctx, '🚫 *Sirf group admins* yeh command use kar sakte hain.'); return null; }
  return md;
}

function targetOf(ctx) {
  const q = ctx.m.quoted;
  if (q && q.sender) return q.sender;
  const arg = (ctx.args || [])[0];
  if (arg && /^\d{6,}$/.test(arg.replace(/\D/g, ''))) return arg.replace(/\D/g, '') + '@s.whatsapp.net';
  return null;
}

/* ---- autoapprove ------------------------------------------------ */
handlers.autoapprove = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  const s = gs(ctx.m.chat);
  const arg = textOf(ctx).toLowerCase();
  s.autoapprove = arg === 'on' || arg === 'true' || arg === '1' ? true : arg === 'off' || arg === 'false' || arg === '0' ? false : !s.autoapprove;
  audit(ctx.m.chat, ctx.m.sender, `autoapprove ${s.autoapprove ? 'on' : 'off'}`);
  return reply(ctx, `✅ *Auto-approve:* ${s.autoapprove ? 'ON' : 'OFF'}\n\n_${s.autoapprove ? 'Naye members bina admin approval ke join kar sakenge.' : 'Naye members ko admin approval chahiye hogi.'}_`);
};

/* ---- welcome / goodbye messages --------------------------------- */
handlers.welcomemsg = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  const s = gs(ctx.m.chat);
  const t = textOf(ctx);
  if (!t) return reply(ctx, `👋 *Current welcome:*\n${s.welcomeMsg}\n\n*${ctx.prefix}welcomemsg <text>*\n\n_Variables: @user, @group_`);
  s.welcomeMsg = t.slice(0, 500);
  audit(ctx.m.chat, ctx.m.sender, 'welcomemsg changed');
  return reply(ctx, `✅ *Welcome message set:*\n\n${s.welcomeMsg}`);
};

handlers.goodbyemsg = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  const s = gs(ctx.m.chat);
  const t = textOf(ctx);
  if (!t) return reply(ctx, `👋 *Current goodbye:*\n${s.goodbyeMsg}\n\n*${ctx.prefix}goodbyemsg <text>*\n\n_Variables: @user, @group_`);
  s.goodbyeMsg = t.slice(0, 500);
  audit(ctx.m.chat, ctx.m.sender, 'goodbyemsg changed');
  return reply(ctx, `✅ *Goodbye message set:*\n\n${s.goodbyeMsg}`);
};

handlers.welcometoggle = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  const s = gs(ctx.m.chat);
  s.welcome = !s.welcome;
  audit(ctx.m.chat, ctx.m.sender, `welcome ${s.welcome ? 'on' : 'off'}`);
  return reply(ctx, `👋 *Welcome messages:* ${s.welcome ? 'ON' : 'OFF'}`);
};

handlers.goodbyetoggle = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  const s = gs(ctx.m.chat);
  s.goodbye = !s.goodbye;
  audit(ctx.m.chat, ctx.m.sender, `goodbye ${s.goodbye ? 'on' : 'off'}`);
  return reply(ctx, `👋 *Goodbye messages:* ${s.goodbye ? 'ON' : 'OFF'}`);
};

/* ---- filters ---------------------------------------------------- */
handlers.filters = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  const s = gs(ctx.m.chat);
  const t = textOf(ctx);
  if (!t) {
    const keys = Object.keys(s.filters);
    return reply(ctx, box('🔎 AUTO-FILTERS', [
      keys.length ? keys.map((k) => `• *${k}* → ${s.filters[k]}`).join('\n') : '_Koi filter set nahi._',
      '',
      `*${ctx.prefix}filters <trigger> | <response>*`,
      `*${ctx.prefix}filters remove <trigger>*`,
      '',
      '_Jab koi trigger word likhega, bot response dega._'
    ]));
  }
  const rm = t.match(/^remove\s+(.+)$/i);
  if (rm) {
    const k = rm[1].trim().toLowerCase();
    if (!s.filters[k]) return reply(ctx, `❌ Filter "${k}" nahi mila.`);
    delete s.filters[k];
    return reply(ctx, `🗑️ Filter removed: *${k}*`);
  }
  const parts = t.split('|').map((x) => x.trim());
  if (parts.length < 2) return reply(ctx, `🔎 Format: ${ctx.prefix}filters <trigger> | <response>`);
  s.filters[parts[0].toLowerCase()] = parts.slice(1).join(' | ');
  audit(ctx.m.chat, ctx.m.sender, `filter added: ${parts[0]}`);
  return reply(ctx, `✅ *Filter added:*\n*${parts[0]}* → ${parts.slice(1).join(' | ')}`);
};

handlers.stopfilter = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  const s = gs(ctx.m.chat);
  const k = textOf(ctx).toLowerCase().trim();
  if (!k) {
    const keys = Object.keys(s.filters);
    if (!keys.length) return reply(ctx, 'ℹ️ Koi filter set nahi hai.');
    return reply(ctx, `🗑️ *${ctx.prefix}stopfilter <trigger>*\n\nActive: ${keys.join(', ')}`);
  }
  if (!s.filters[k]) return reply(ctx, `❌ "${k}" filter nahi hai.`);
  delete s.filters[k];
  return reply(ctx, `✅ Filter removed: *${k}*`);
};

/* ---- word blacklist --------------------------------------------- */
handlers.wordblacklist = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  const s = gs(ctx.m.chat);
  const t = textOf(ctx).trim();
  if (!t) {
    return reply(ctx, box('🚫 WORD BLACKLIST', [
      s.blacklist.length ? s.blacklist.map((w, i) => `${i + 1}. ${w}`).join('\n') : '_Khali hai._',
      '',
      `*${ctx.prefix}wordblacklist add <word>*`,
      `*${ctx.prefix}wordblacklist remove <word>*`,
      `*${ctx.prefix}wordblacklist clear*`
    ]));
  }
  const [act, ...rest] = t.split(/\s+/);
  const w = rest.join(' ').toLowerCase();
  if (act === 'add' && w) {
    if (s.blacklist.includes(w)) return reply(ctx, `ℹ️ "${w}" pehle se list mein hai.`);
    s.blacklist.push(w);
    return reply(ctx, `✅ Added *${w}* to blacklist. (${s.blacklist.length} words)`);
  }
  if (act === 'remove' && w) {
    const i = s.blacklist.indexOf(w);
    if (i === -1) return reply(ctx, `❌ "${w}" list mein nahi hai.`);
    s.blacklist.splice(i, 1);
    return reply(ctx, `🗑️ Removed *${w}*.`);
  }
  if (act === 'clear') { s.blacklist = []; return reply(ctx, '🗑️ Blacklist clear ho gayi.'); }
  return reply(ctx, `❓ ${ctx.prefix}wordblacklist add|remove|clear <word>`);
};

/* ---- warn limit ------------------------------------------------- */
handlers.warnlimit = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  const s = gs(ctx.m.chat);
  const n = parseInt(textOf(ctx), 10);
  if (!n || n < 1 || n > 20) return reply(ctx, `⚠️ *Current warn limit:* ${s.warnLimit}\n\n*${ctx.prefix}warnlimit 3*`);
  s.warnLimit = n;
  audit(ctx.m.chat, ctx.m.sender, `warnlimit ${n}`);
  return reply(ctx, `✅ *Warn limit set to ${n}* — ${n} warnings ke baad member kick hoga.`);
};

/* ---- lock / unlock chat ----------------------------------------- */
handlers.lockchat = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  try {
    await ctx.sock.groupSettingUpdate(ctx.m.chat, 'announcement');
    gs(ctx.m.chat).lockchat = true;
    audit(ctx.m.chat, ctx.m.sender, 'lockchat');
    return reply(ctx, '🔒 *Group locked* — sirf admins message kar sakte hain.');
  } catch (e) {
    return reply(ctx, `❌ Lock fail: ${e.message}\n_(Bot ko admin hona chahiye.)_`);
  }
};

handlers.unlockchat = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  try {
    await ctx.sock.groupSettingUpdate(ctx.m.chat, 'not_announcement');
    gs(ctx.m.chat).lockchat = false;
    audit(ctx.m.chat, ctx.m.sender, 'unlockchat');
    return reply(ctx, '🔓 *Group unlocked* — sab members message kar sakte hain.');
  } catch (e) {
    return reply(ctx, `❌ Unlock fail: ${e.message}`);
  }
};

/* ---- slowmode --------------------------------------------------- */
handlers.slowmode = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  const s = gs(ctx.m.chat);
  const n = parseInt(textOf(ctx), 10);
  if (isNaN(n)) return reply(ctx, `⏱️ *Current slowmode:* ${s.slowmode ? `${s.slowmode}s` : 'OFF'}\n\n*${ctx.prefix}slowmode 10* (seconds)\n*${ctx.prefix}slowmode 0* (off)`);
  s.slowmode = Math.max(0, Math.min(300, n));
  audit(ctx.m.chat, ctx.m.sender, `slowmode ${s.slowmode}`);
  return reply(ctx, `⏱️ *Slowmode:* ${s.slowmode ? `${s.slowmode} seconds` : 'OFF'}`);
};

/* ---- captcha ---------------------------------------------------- */
handlers.captcha = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  const s = gs(ctx.m.chat);
  s.captcha = !s.captcha;
  audit(ctx.m.chat, ctx.m.sender, `captcha ${s.captcha ? 'on' : 'off'}`);
  return reply(ctx, `🤖 *Join captcha:* ${s.captcha ? 'ON' : 'OFF'}\n\n_${s.captcha ? 'Naye members ko simple verification pass karna hoga.' : 'Verification band.'}_`);
};

/* ---- unpin ------------------------------------------------------ */
handlers.unpin = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  try {
    await ctx.sock.sendMessage(ctx.m.chat, { text: '📌 *Unpinned.*', edit: ctx.m.key, pin: false });
  } catch (e) { /* ignore */ }
  return reply(ctx, '📌 Pin hata diya gaya (agar tha).');
};

/* ---- cleanbots -------------------------------------------------- */
handlers.cleanbots = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  const bots = (md.participants || []).filter((p) => p.id && /bot/i.test(p.id));
  if (!bots.length) return reply(ctx, '🤖 Koi bot member nahi mila.');
  return reply(ctx, `🤖 *Bot-like members (${bots.length}):*\n\n${bots.map((b) => `• ${b.id.split('@')[0]}`).join('\n')}\n\n_Manually remove karein: ${ctx.prefix}kick <number>_`);
};

/* ---- purge ------------------------------------------------------ */
handlers.purge = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  const n = Math.min(50, Math.max(1, parseInt(textOf(ctx), 10) || 10));
  return reply(ctx, `🧹 *Purge requested:* last ${n} messages.\n\n_⚠️ WhatsApp API bulk message delete support nahi karta. Aap ko manually clear karna hoga, ya group "Disappearing messages" enable karein._`);
};

/* ---- staff ------------------------------------------------------ */
handlers.staff = async (ctx) => {
  if (!ctx.m.isGroup) return reply(ctx, '⚠️ Group only.');
  const md = await meta(ctx);
  const admins = (md.participants || []).filter((p) => p.admin);
  if (!admins.length) return reply(ctx, 'ℹ️ Koi admin nahi mila.');
  const mentions = admins.map((a) => a.id);
  const text = `👑 *GROUP STAFF*\n\n${admins.map((a) => `• @${a.id.split('@')[0]} — ${a.admin === 'superadmin' ? 'Super Admin' : 'Admin'}`).join('\n')}\n\n👥 Total: ${admins.length}`;
  return ctx.sock.sendMessage(ctx.m.chat, { text, mentions }, { quoted: ctx.m });
};

/* ---- rules ------------------------------------------------------ */
handlers.rules = async (ctx) => {
  if (!ctx.m.isGroup) return reply(ctx, '⚠️ Group only.');
  const s = gs(ctx.m.chat);
  if (!s.rules) return reply(ctx, `📜 *Is group ke rules set nahi hain.*\n\n_Admin set kar sakta hai:_ *${ctx.prefix}setrules <rules>*`);
  return reply(ctx, `📜 *GROUP RULES*\n\n${s.rules}`);
};

handlers.setrules = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  const s = gs(ctx.m.chat);
  const t = textOf(ctx);
  if (!t) return reply(ctx, `📜 *Usage:* ${ctx.prefix}setrules 1. No spam\n2. Be respectful\n3. No links`);
  s.rules = t.slice(0, 1500);
  audit(ctx.m.chat, ctx.m.sender, 'setrules');
  return reply(ctx, `✅ *Rules updated:*\n\n${s.rules}`);
};

/* ---- ban system ------------------------------------------------- */
handlers.bansystem = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  const s = gs(ctx.m.chat);
  const t = textOf(ctx);
  if (!t) {
    const list = Object.entries(s.tempbans).filter(([, exp]) => exp > Date.now());
    return reply(ctx, box('🚫 TEMP BANS', [
      list.length ? list.map(([j, exp]) => `• ${j.split('@')[0]} — until ${new Date(exp).toLocaleString('en-GB')}`).join('\n') : '_Koi active ban nahi._',
      '',
      `*${ctx.prefix}bansystem <number> <minutes>*`,
      `*${ctx.prefix}bansystem unban <number>*`
    ]));
  }
  const parts = t.split(/\s+/);
  if (parts[0] === 'unban') {
    const jid = parts[1].replace(/\D/g, '') + '@s.whatsapp.net';
    delete s.tempbans[jid];
    return reply(ctx, `✅ Unbanned ${parts[1]}.`);
  }
  const num = parts[0].replace(/\D/g, '');
  const mins = parseInt(parts[1], 10) || 60;
  if (!num) return reply(ctx, `❌ Number dein.`);
  const jid = num + '@s.whatsapp.net';
  s.tempbans[jid] = Date.now() + mins * 60000;
  audit(ctx.m.chat, ctx.m.sender, `tempban ${num} ${mins}m`);
  try { await ctx.sock.groupParticipantsUpdate(ctx.m.chat, [jid], 'remove'); } catch (e) { /* ignore */ }
  return reply(ctx, `🚫 *${num} banned* for ${mins} minutes.`);
};

handlers.tempban = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  const t = textOf(ctx).split(/\s+/);
  const target = targetOf(ctx) || (t[0] && t[0].replace(/\D/g, '') ? t[0].replace(/\D/g, '') + '@s.whatsapp.net' : null);
  const mins = parseInt(t[1], 10) || 30;
  if (!target) return reply(ctx, `⏳ *Usage:* ${ctx.prefix}tempban <number> <minutes>\n_ya kisi message ko reply karke: ${ctx.prefix}tempban 30_`);
  const s = gs(ctx.m.chat);
  s.tempbans[target] = Date.now() + mins * 60000;
  try { await ctx.sock.groupParticipantsUpdate(ctx.m.chat, [target], 'remove'); } catch (e) { /* ignore */ }
  return reply(ctx, `⏳ *Temp ban:* ${target.split('@')[0]} for ${mins} min.`);
};

/* ---- role assign ------------------------------------------------ */
handlers.roleassign = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  const s = gs(ctx.m.chat);
  const t = textOf(ctx);
  if (!t) {
    const roles = Object.entries(s.roles);
    return reply(ctx, box('🎭 CUSTOM ROLES', [
      roles.length ? roles.map(([j, r]) => `• ${j.split('@')[0]} → *${r}*`).join('\n') : '_Koi role assign nahi._',
      '',
      `*${ctx.prefix}roleassign <number> <role>*`,
      `*${ctx.prefix}roleassign remove <number>*`
    ]));
  }
  const parts = t.split(/\s+/);
  if (parts[0] === 'remove') {
    const jid = parts[1].replace(/\D/g, '') + '@s.whatsapp.net';
    delete s.roles[jid];
    return reply(ctx, `🗑️ Role removed.`);
  }
  const num = parts[0].replace(/\D/g, '');
  const role = parts.slice(1).join(' ');
  if (!num || !role) return reply(ctx, `❌ Format: ${ctx.prefix}roleassign <number> <role>`);
  s.roles[num + '@s.whatsapp.net'] = role.slice(0, 40);
  return reply(ctx, `🎭 *${num}* → *${role}*`);
};

/* ---- audit log -------------------------------------------------- */
handlers.auditlog = async (ctx) => {
  if (!ctx.m.isGroup) return reply(ctx, '⚠️ Group only.');
  const s = gs(ctx.m.chat);
  if (!s.audit.length) return reply(ctx, '📋 Abhi tak koi action log nahi hua.');
  const lines = s.audit.slice(0, 20).map((a) => `• *${a.actor}* — ${a.action}  _(${new Date(a.at).toLocaleString('en-GB')})_`);
  return reply(ctx, box('📋 AUDIT LOG', lines));
};

/* ---- member count ----------------------------------------------- */
handlers.membercount = async (ctx) => {
  if (!ctx.m.isGroup) return reply(ctx, '⚠️ Group only.');
  const md = await meta(ctx);
  const p = md.participants || [];
  const admins = p.filter((x) => x.admin).length;
  return reply(ctx, box('👥 MEMBER COUNT', [
    `🏷️ *Group:* ${md.subject || '—'}`,
    `👥 *Total members:* ${p.length}`,
    `👑 *Admins:* ${admins}`,
    `🙋 *Regular members:* ${p.length - admins}`,
    `🆔 *JID:* ${ctx.m.chat}`
  ]));
};

/* ---- nsfw block ------------------------------------------------- */
handlers.nsfwblock = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  const s = gs(ctx.m.chat);
  s.nsfwblock = !s.nsfwblock;
  audit(ctx.m.chat, ctx.m.sender, `nsfwblock ${s.nsfwblock ? 'on' : 'off'}`);
  return reply(ctx, `🔞 *NSFW block:* ${s.nsfwblock ? 'ON' : 'OFF'}\n\n_${s.nsfwblock ? 'Adult content detect hone par delete + warn hoga.' : 'Block band.'}_`);
};

/* ---- mention all ------------------------------------------------ */
handlers.mentionall = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  const text = textOf(ctx) || 'Attention everyone!';
  const mentions = (md.participants || []).map((p) => p.id).filter(Boolean);
  const body = `📢 *${text}*\n\n${mentions.map((j) => `@${j.split('@')[0]}`).join(' ')}`;
  return ctx.sock.sendMessage(ctx.m.chat, { text: body, mentions }, { quoted: ctx.m });
};

/* ---- group info ------------------------------------------------- */
handlers.groupinfo = async (ctx) => {
  if (!ctx.m.isGroup) return reply(ctx, '⚠️ Group only.');
  const md = await meta(ctx);
  const p = md.participants || [];
  const created = md.creation ? new Date(md.creation * 1000).toLocaleDateString('en-GB') : '—';
  return reply(ctx, box('📋 GROUP INFO', [
    `🏷️ *Name:* ${md.subject || '—'}`,
    `🆔 *JID:* ${ctx.m.chat}`,
    `👥 *Members:* ${p.length}`,
    `👑 *Admins:* ${p.filter((x) => x.admin).length}`,
    `📅 *Created:* ${created}`,
    `👤 *Owner:* ${md.owner ? md.owner.split('@')[0] : '—'}`,
    `🔒 *Restricted:* ${md.announce ? 'Yes (admins only)' : 'No'}`,
    `✏️ *Edit info:* ${md.restrict ? 'Admins only' : 'All members'}`,
    '',
    `📝 *Description:*`,
    (md.desc || '_No description_').slice(0, 400)
  ]));
};

/* ---- ephemeral / disappearing messages -------------------------- */
handlers.setephemeral = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  const map = { off: 0, '0': 0, '24h': 86400, '7d': 604800, '90d': 7776000 };
  const arg = textOf(ctx).toLowerCase() || 'off';
  const sec = map[arg];
  if (sec === undefined) return reply(ctx, `⏳ *Usage:* ${ctx.prefix}setephemeral off|24h|7d|90d`);
  try {
    await ctx.sock.sendMessage(ctx.m.chat, { disappearingMessagesInChat: sec === 0 ? false : sec });
    return reply(ctx, `⏳ *Disappearing messages:* ${sec === 0 ? 'OFF' : arg}`);
  } catch (e) {
    return reply(ctx, `❌ Fail: ${e.message}`);
  }
};

/* ---- invite ----------------------------------------------------- */
handlers.invite = async (ctx) => {
  const md = await requireAdmin(ctx); if (!md) return;
  try {
    const code = await ctx.sock.groupInviteCode(ctx.m.chat);
    return reply(ctx, `🔗 *GROUP INVITE LINK*\n\nhttps://chat.whatsapp.com/${code}\n\n_⚠️ Sirf trusted logon ko share karein._`);
  } catch (e) {
    return reply(ctx, `❌ Invite link nahi mila: ${e.message}\n_(Bot admin hona chahiye.)_`);
  }
};

/* ---- broadcast group -------------------------------------------- */
handlers.broadcastgroup = async (ctx) => {
  if (!isOwner(ctx)) return reply(ctx, '🚫 *Owner only.*');
  const text = textOf(ctx);
  if (!text) return reply(ctx, `📢 *Usage:* ${ctx.prefix}broadcastgroup <message>`);
  let groups = [];
  try {
    const all = await ctx.sock.groupFetchAllParticipating();
    groups = Object.values(all).map((g) => g.id);
  } catch (e) {
    return reply(ctx, `❌ Group list fail: ${e.message}`);
  }
  await reply(ctx, `📢 Broadcasting to *${groups.length}* groups...`);
  let ok = 0, fail = 0;
  for (const g of groups) {
    try { await ctx.sock.sendMessage(g, { text: `📢 *BROADCAST*\n\n${text}` }); ok++; } catch (e) { fail++; }
    await new Promise((r) => setTimeout(r, 700));
  }
  return reply(ctx, `✅ *Broadcast complete*\n\n✔️ Sent: ${ok}\n❌ Failed: ${fail}`);
};

module.exports = { handlers, settings, gs, audit, meta, isSenderAdmin, targetOf };
