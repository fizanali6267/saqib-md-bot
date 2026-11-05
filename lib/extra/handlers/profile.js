'use strict';
/**
 * Extra profile handlers (12 commands).
 * card, rank, leveltop, afk, unafk, birthday, horoscope,
 * customtitle, avatar, reputation, repcount, signature
 */
const U = require('../util');
const { textOf, reply, ai, box, getJson, pick, randInt, config, fs, path, isGroup } = U;

const handlers = {};

/* ------------------------------------------------------------------ *
 * Tiny JSON store so profile data survives restarts.
 * ------------------------------------------------------------------ */
const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'profiles.json');

let store = {
  afk: {},        // jid -> { reason, since }
  birthday: {},   // jid -> 'MM-DD'
  title: {},      // jid -> string
  signature: {},  // jid -> string
  rep: {},        // jid -> number
  points: {},     // jid -> { xp, level }
  given: {}       // giverJid -> [receiverJid...]
};

function loadStore() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(STORE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
      store = Object.assign(store, raw || {});
    }
  } catch (e) {
    /* ignore corrupt store */
  }
}
loadStore();

let saveTimer = null;
function saveStore() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
    } catch (e) {
      /* ignore write errors */
    }
  }, 800);
}

const AFK = store.afk;
const BDAY = store.birthday;
const TITLE = store.title;
const SIG = store.signature;
const REP = store.rep;
const PTS = store.points;
const GIVEN = store.given;

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */
function jidOf(ctx) {
  return (ctx.m && (ctx.m.sender || (ctx.m.key && ctx.m.key.participant) || ctx.m.chat)) || 'unknown';
}

function nameOf(ctx, jid) {
  const j = jid || jidOf(ctx);
  return String(j).split('@')[0].split(':')[0];
}

function mentionOf(ctx) {
  const m = ctx.m || {};
  if (m.mentionedJid && m.mentionedJid.length) return m.mentionedJid[0];
  if (m.quoted && m.quoted.sender) return m.quoted.sender;
  return null;
}

function xpFor(level) {
  return Math.floor(100 * Math.pow(level, 1.5));
}

function levelInfo(jid) {
  const rec = PTS[jid] || { xp: 0, level: 1 };
  const need = xpFor(rec.level);
  return { ...rec, need, pct: Math.min(100, Math.round((rec.xp / need) * 100)) };
}

function addXp(jid, amount) {
  const rec = PTS[jid] || { xp: 0, level: 1 };
  rec.xp += amount;
  while (rec.xp >= xpFor(rec.level)) {
    rec.xp -= xpFor(rec.level);
    rec.level += 1;
  }
  PTS[jid] = rec;
  saveStore();
  return rec;
}

function bar(pct, size = 12) {
  const filled = Math.round((pct / 100) * size);
  return '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, size - filled));
}

const ZODIAC = [
  ['capricorn', '12-22', '01-19', '♑'],
  ['aquarius', '01-20', '02-18', '♒'],
  ['pisces', '02-19', '03-20', '♓'],
  ['aries', '03-21', '04-19', '♈'],
  ['taurus', '04-20', '05-20', '♉'],
  ['gemini', '05-21', '06-20', '♊'],
  ['cancer', '06-21', '07-22', '♋'],
  ['leo', '07-23', '08-22', '♌'],
  ['virgo', '08-23', '09-22', '♍'],
  ['libra', '09-23', '10-22', '♎'],
  ['scorpio', '10-23', '11-21', '♏'],
  ['sagittarius', '11-22', '12-21', '♐']
];

function zodiacFor(mmdd) {
  const [m, d] = mmdd.split('-').map(Number);
  const val = m * 100 + d;
  for (const [name, from, to, glyph] of ZODIAC) {
    const f = Number(from.split('-')[0]) * 100 + Number(from.split('-')[1]);
    const t = Number(to.split('-')[0]) * 100 + Number(to.split('-')[1]);
    if (f <= t) {
      if (val >= f && val <= t) return { name, glyph };
    } else if (val >= f || val <= t) {
      return { name, glyph };
    }
  }
  return { name: 'capricorn', glyph: '♑' };
}

function parseDate(raw) {
  if (!raw) return null;
  const m = String(raw).match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (!m) return null;
  let a = Number(m[1]);
  let b = Number(m[2]);
  // Support both DD-MM and MM-DD: if first > 12 it must be day.
  let month;
  let day;
  if (a > 12) {
    day = a;
    month = b;
  } else if (b > 12) {
    month = a;
    day = b;
  } else {
    month = a;
    day = b;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ *
 * .card — full profile card
 * ------------------------------------------------------------------ */
handlers.card = async (ctx) => {
  const target = mentionOf(ctx) || jidOf(ctx);
  const lv = levelInfo(target);
  const rep = REP[target] || 0;
  const title = TITLE[target] || '—';
  const sig = SIG[target] || '—';
  const bd = BDAY[target];
  const z = bd ? zodiacFor(bd) : null;

  const lines = [
    `👤 *Name:* ${nameOf(ctx, target)}`,
    `🆔 *JID:* ${String(target).split('@')[0]}`,
    `🏅 *Level:* ${lv.level}  ${bar(lv.pct)}  ${lv.pct}%`,
    `✨ *XP:* ${lv.xp} / ${lv.need}`,
    `⭐ *Reputation:* ${rep}`,
    `🏷️ *Title:* ${title}`,
    `✍️ *Signature:* ${sig}`,
    bd ? `🎂 *Birthday:* ${bd} (${z.glyph} ${z.name})` : '🎂 *Birthday:* not set',
    AFK[target] ? `💤 *AFK:* ${AFK[target].reason}` : '🟢 *Status:* available'
  ];
  await reply(ctx, box('🪪 PROFILE CARD', lines));
};

/* ------------------------------------------------------------------ *
 * .rank — level & XP of a member
 * ------------------------------------------------------------------ */
handlers.rank = async (ctx) => {
  const target = mentionOf(ctx) || jidOf(ctx);
  const lv = levelInfo(target);
  const sorted = Object.entries(PTS).sort((a, b) => (b[1].level - a[1].level) || (b[1].xp - a[1].xp));
  const pos = sorted.findIndex(([j]) => j === target) + 1;
  await reply(
    ctx,
    box('📊 RANK', [
      `👤 *User:* ${nameOf(ctx, target)}`,
      `🏅 *Level:* ${lv.level}`,
      `✨ *XP:* ${lv.xp} / ${lv.need}`,
      `📈 *Progress:* ${bar(lv.pct)} ${lv.pct}%`,
      `🥇 *Server rank:* ${pos ? `#${pos} of ${sorted.length}` : 'unranked'}`
    ])
  );
};

/* ------------------------------------------------------------------ *
 * .leveltop — leaderboard
 * ------------------------------------------------------------------ */
handlers.leveltop = async (ctx) => {
  const sorted = Object.entries(PTS)
    .sort((a, b) => (b[1].level - a[1].level) || (b[1].xp - a[1].xp))
    .slice(0, 10);
  if (!sorted.length) {
    return reply(ctx, '📭 Abhi tak koi XP record nahi hai. Chat karte raho, XP khud barhta rahega.');
  }
  const medals = ['🥇', '🥈', '🥉'];
  const lines = sorted.map(([j, r], i) => {
    const medal = medals[i] || `${i + 1}.`;
    return `${medal} ${nameOf(ctx, j)} — Lv.${r.level} (${r.xp} XP)`;
  });
  await reply(ctx, box('🏆 LEVEL LEADERBOARD', lines));
};

/* ------------------------------------------------------------------ *
 * .afk / .unafk
 * ------------------------------------------------------------------ */
handlers.afk = async (ctx) => {
  const reason = textOf(ctx) || 'Busy hoon, baad mein baat karte hain.';
  const jid = jidOf(ctx);
  AFK[jid] = { reason, since: Date.now() };
  saveStore();
  await reply(ctx, `💤 *AFK set.*\n\n👤 ${nameOf(ctx, jid)}\n📝 ${reason}\n\n_${ctx.prefix}unafk likhne par wapas online ho jayenge._`);
};

handlers.unafk = async (ctx) => {
  const jid = jidOf(ctx);
  if (!AFK[jid]) return reply(ctx, 'ℹ️ Aap AFK mode mein nahi hain.');
  const mins = Math.max(1, Math.round((Date.now() - AFK[jid].since) / 60000));
  delete AFK[jid];
  saveStore();
  await reply(ctx, `🟢 *Welcome back!* Aap ${mins} minute(s) AFK thay.`);
};

/* ------------------------------------------------------------------ *
 * .birthday
 * ------------------------------------------------------------------ */
handlers.birthday = async (ctx) => {
  const raw = textOf(ctx);
  const jid = jidOf(ctx);
  if (!raw || /^(list|all)$/i.test(raw)) {
    const entries = Object.entries(BDAY).slice(0, 20);
    if (!entries.length) return reply(ctx, `🎂 Abhi koi birthday save nahi hai.\n\n*Usage:* ${ctx.prefix}birthday 15-08`);
    const lines = entries.map(([j, d]) => `• ${nameOf(ctx, j)} — ${d} (${zodiacFor(d).glyph} ${zodiacFor(d).name})`);
    return reply(ctx, box('🎂 BIRTHDAYS', lines));
  }
  const mmdd = parseDate(raw);
  if (!mmdd) {
    return reply(ctx, `❌ Date samajh nahi aayi.\n\n*Usage:* ${ctx.prefix}birthday 15-08\n_Format: DD-MM ya MM-DD_`);
  }
  BDAY[jid] = mmdd;
  saveStore();
  const z = zodiacFor(mmdd);
  const [mm, dd] = mmdd.split('-');
  const now = new Date();
  let next = new Date(now.getFullYear(), Number(mm) - 1, Number(dd));
  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
    next = new Date(now.getFullYear() + 1, Number(mm) - 1, Number(dd));
  }
  const days = Math.ceil((next - now) / 86400000);
  await reply(
    ctx,
    `🎂 *Birthday saved!*\n\n📅 ${mmdd}  ${z.glyph} *${z.name}*\n⏳ ${days} din baad aap ka birthday hai.`
  );
};

/* ------------------------------------------------------------------ *
 * .horoscope
 * ------------------------------------------------------------------ */
const HORO_SIGNS = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];

handlers.horoscope = async (ctx) => {
  let sign = (textOf(ctx) || '').toLowerCase().trim();
  if (!sign) {
    const bd = BDAY[jidOf(ctx)];
    if (bd) sign = zodiacFor(bd).name;
  }
  if (!sign || !HORO_SIGNS.includes(sign)) {
    return reply(
      ctx,
      `🔮 *Horoscope*\n\n*Usage:* ${ctx.prefix}horoscope <sign>\n\n*Signs:* ${HORO_SIGNS.join(', ')}\n\n_Tip: ${ctx.prefix}birthday se apni date save karo, phir sign khud aa jayega._`
    );
  }
  await ctx.m.react('🔮').catch(() => {});
  const z = ZODIAC.find((x) => x[0] === sign);
  const prompt = `Write a fun daily horoscope for ${sign} for today (${new Date().toDateString()}).
Include: overall mood, love, career, lucky number, lucky colour.
Keep it 120-160 words, warm and positive, no medical or financial guarantees.`;
  const out = await ai(ctx, prompt, 'You are a friendly astrologer. Keep it light, positive and clearly entertainment-only.');
  if (!out) return;
  await reply(ctx, box(`${z ? z[3] : '🔮'} ${sign.toUpperCase()}`, out.split('\n').filter(Boolean)));
};

/* ------------------------------------------------------------------ *
 * .customtitle
 * ------------------------------------------------------------------ */
handlers.customtitle = async (ctx) => {
  const raw = textOf(ctx);
  const jid = jidOf(ctx);
  if (!raw) {
    const t = TITLE[jid];
    return reply(ctx, t ? `🏷️ *Aap ka title:* ${t}` : `🏷️ Koi title set nahi.\n\n*Usage:* ${ctx.prefix}customtitle King of the Group`);
  }
  if (/^(clear|remove|reset|off)$/i.test(raw)) {
    delete TITLE[jid];
    saveStore();
    return reply(ctx, '🗑️ Title remove kar diya gaya.');
  }
  if (raw.length > 40) return reply(ctx, '❌ Title 40 characters se chhota rakhein.');
  TITLE[jid] = raw;
  saveStore();
  await reply(ctx, `🏷️ *Title set:* ${raw}`);
};

/* ------------------------------------------------------------------ *
 * .avatar — fetch profile picture
 * ------------------------------------------------------------------ */
handlers.avatar = async (ctx) => {
  const target = mentionOf(ctx) || jidOf(ctx);
  try {
    let url;
    try {
      url = await ctx.sock.profilePictureUrl(target, 'image');
    } catch (e) {
      return reply(ctx, `❌ ${nameOf(ctx, target)} ki profile picture nahi mili (privacy settings ya DP nahi hai).`);
    }
    await ctx.sock.sendMessage(ctx.m.chat, {
      image: { url },
      caption: `🖼️ *${nameOf(ctx, target)}* ki profile picture`
    }, { quoted: ctx.m });
  } catch (e) {
    await reply(ctx, `❌ Avatar laane mein masla hua: ${e.message}`);
  }
};

/* ------------------------------------------------------------------ *
 * .reputation / .repcount
 * ------------------------------------------------------------------ */
handlers.reputation = async (ctx) => {
  const target = mentionOf(ctx);
  const giver = jidOf(ctx);
  if (!target) {
    return reply(ctx, `⭐ *Usage:* ${ctx.prefix}reputation @user\n\n_Kisi ko reputation dene ke liye us ko reply ya mention karein._`);
  }
  if (target === giver) return reply(ctx, '😅 Khud ko reputation nahi de sakte.');

  const today = new Date().toISOString().slice(0, 10);
  GIVEN[giver] = GIVEN[giver] || [];
  const key = `${target}|${today}`;
  if (GIVEN[giver].includes(key)) {
    return reply(ctx, `⏳ Aap aaj already ${nameOf(ctx, target)} ko reputation de chuke hain. Kal dobara try karein.`);
  }
  GIVEN[giver].push(key);
  if (GIVEN[giver].length > 200) GIVEN[giver] = GIVEN[giver].slice(-200);
  REP[target] = (REP[target] || 0) + 1;
  saveStore();
  await reply(ctx, `⭐ *Reputation +1* → ${nameOf(ctx, target)}\n\nAb total: *${REP[target]}*`);
};

handlers.repcount = async (ctx) => {
  const target = mentionOf(ctx) || jidOf(ctx);
  const rep = REP[target] || 0;
  const sorted = Object.entries(REP).sort((a, b) => b[1] - a[1]);
  const pos = sorted.findIndex(([j]) => j === target) + 1;
  await reply(
    ctx,
    box('⭐ REPUTATION', [
      `👤 *User:* ${nameOf(ctx, target)}`,
      `⭐ *Reputation:* ${rep}`,
      `🏅 *Position:* ${pos ? `#${pos}` : 'unranked'}`
    ])
  );
};

/* ------------------------------------------------------------------ *
 * .signature
 * ------------------------------------------------------------------ */
handlers.signature = async (ctx) => {
  const raw = textOf(ctx);
  const jid = jidOf(ctx);
  if (!raw) {
    const s = SIG[jid];
    return reply(ctx, s ? `✍️ *Aap ka signature:*\n${s}` : `✍️ Signature set nahi.\n\n*Usage:* ${ctx.prefix}signature Carpe Diem 🌙`);
  }
  if (/^(clear|remove|reset|off)$/i.test(raw)) {
    delete SIG[jid];
    saveStore();
    return reply(ctx, '🗑️ Signature remove kar diya gaya.');
  }
  if (raw.length > 120) return reply(ctx, '❌ Signature 120 characters se chhota rakhein.');
  SIG[jid] = raw;
  saveStore();
  await reply(ctx, `✍️ *Signature saved:*\n${raw}`);
};

/* ------------------------------------------------------------------ *
 * Passive XP hook (called by the plugin wrapper on every message)
 * ------------------------------------------------------------------ */
function bumpXp(ctx) {
  try {
    const jid = jidOf(ctx);
    if (!jid || jid === 'unknown') return;
    addXp(jid, randInt(3, 8));
  } catch (e) {
    /* never break message flow */
  }
}

module.exports = { handlers, AFK, BDAY, TITLE, SIG, REP, PTS, bumpXp, zodiacFor, parseDate };
