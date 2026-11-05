const fs = require('fs');
try {
  require('dotenv').config();
} catch (_) {}

// Helper to safely parse booleans from environment variables
// Prevents the bug where '=== "true" || true' is always true
const parseBool = (val, defaultVal = true) => {
  if (val === undefined || val === null || val === '') return defaultVal;
  return String(val).trim().toLowerCase() === 'true';
};

const PAIRING_LINK = process.env.PAIRING_LINK || "https://saqib-iqbal-pairing.up.railway.app";
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;

module.exports = {
  parseBool,

  // Bot Identity & General Settings
  BOT_NAME: process.env.BOT_NAME || "SAQIB-MD",
  OWNER_NAME: process.env.OWNER_NAME || "Saqib Iqbal",
  // Owner WhatsApp Number(s) — OWNER_NUMBERS (comma separated) ko priority.
  // OWNER_NUMBER sirf pehla number hota hai (backward compatibility).
  OWNER_NUMBERS: (process.env.OWNER_NUMBERS || process.env.OWNER_NUMBER || "923106762478")
    .split(',')
    .map((s) => String(s).replace(/[^0-9]/g, ''))
    .filter(Boolean),
  OWNER_NUMBER: (process.env.OWNER_NUMBERS || process.env.OWNER_NUMBER || "923106762478")
    .split(',')[0]
    .replace(/[^0-9]/g, ''),
  PREFIX: process.env.PREFIX || ".",
  WORK_TYPE: process.env.WORK_TYPE || "public", // 'public' or 'private'
  PORT: PORT,
  PAIRING_LINK: PAIRING_LINK,

  // MongoDB 24/7 Atlas Connection (Pre-configured for 24/7 persistent session)
  MONGO_URI: process.env.MONGO_URI || "",
  SESSION_ID: process.env.SESSION_ID || "saqib_md_session",

  // Granular Anti-Delete Settings (Fixed boolean parsing)
  ANTI_DELETE: parseBool(process.env.ANTI_DELETE, false),
  ANTI_DELETE_MODE: process.env.ANTI_DELETE_MODE || "same", // 'same' (same chat) or 'inbox' (owner PM)

  // Anti-View-Once & Auto-VV Settings (Fixed boolean parsing)
  ANTI_VIEW_ONCE: parseBool(process.env.ANTI_VIEW_ONCE, false), // Manual & Quoted .vv
  AUTO_VIEW_ONCE: parseBool(process.env.AUTO_VIEW_ONCE, false), // Auto-recovers incoming view once to personal inbox

  // Automation & Presence Features
  ALWAYS_ONLINE: parseBool(process.env.ALWAYS_ONLINE, true),
  AUTO_READ: parseBool(process.env.AUTO_READ, false), // Blue tick automation
  AUTO_REACT: parseBool(process.env.AUTO_REACT, false),
  AUTO_REACT_MODE: process.env.AUTO_REACT_MODE || "sender", // 'sender', 'all', 'me', 'mirror'
  AI_REACT: parseBool(process.env.AI_REACT, false), // Smart sentiment reaction
  AUTO_STATUS_READ: parseBool(process.env.AUTO_STATUS_READ, false),
  AUTO_STATUS_REACT: parseBool(process.env.AUTO_STATUS_REACT, false),
  STATUS_REACT_EMOJI: process.env.STATUS_REACT_EMOJI || "❤️",

  // Granular Chatbot Settings (Friendly, human-like AI)
  CHATBOT_PM: parseBool(process.env.CHATBOT_PM, false), // Active in Private DM
  CHATBOT_GROUP: parseBool(process.env.CHATBOT_GROUP, false), // Active in Groups

  // Issue 7 Fix: single-session bot hai, is liye public pairing se koi bhi
  // banda owner ki session overwrite kar sakta tha. Default: owner-only.
  // Public portal wapas chalu karna ho to ALLOW_PUBLIC_PAIRING=true set karein.
  ALLOW_PUBLIC_PAIRING: parseBool(process.env.ALLOW_PUBLIC_PAIRING, false),

  // Pairing allowlist: agar public pairing band hai (default), to sirf yeh
  // numbers pairing kar sakte hain (OWNER_NUMBERS hamesha allowed hote hain).
  // Comma separated, e.g. PAIRING_ALLOWED_NUMBERS=923008760205,923067846267
  PAIRING_ALLOWED_NUMBERS: (process.env.PAIRING_ALLOWED_NUMBERS || '')
    .split(',')
    .map((s) => String(s).replace(/[^0-9]/g, ''))
    .filter(Boolean),

  // Other Security Features (Fixed boolean parsing)
  ANTI_LINK: parseBool(process.env.ANTI_LINK, false),
  ANTI_BADWORD: parseBool(process.env.ANTI_BADWORD, false),
  ANTI_CALL: parseBool(process.env.ANTI_CALL, false),
  AUTO_BIO: parseBool(process.env.AUTO_BIO, false),

  // Maintenance mode: when ON, only the owner can use commands.
  MAINTENANCE: parseBool(process.env.MAINTENANCE, false),
  // Incognito mode: suppresses read receipts / presence where possible.
  INCOGNITO: parseBool(process.env.INCOGNITO, false),

  // AI APIs — SAQIB-MD uses Google Gemini EVERYWHERE (no OpenAI needed).
  // .gpt, .ai, .gemini, .summarize, .code, chatbot — sab isi key se chalte hain.
  // Fallback: agar purani deployment par key OPENAI_API_KEY naam se padi ho
  // to usay bhi accept kar lete hain (migration safety).
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || "",

  // Weather API (Pre-configured)
  WEATHER_API_KEY: process.env.WEATHER_API_KEY || "",

  // Custom Sticker Pack Metadata
  STICKER_PACK_NAME: process.env.STICKER_PACK_NAME || "SAQIB-MD",
  STICKER_AUTHOR: process.env.STICKER_AUTHOR || "Saqib Iqbal",

  // Custom Response Messages with User-Growth Promotion Link
  MESSAGES: {
    WAIT: "⏳ *Processing your request, please wait...*",
    SUCCESS: "✅ *Done successfully!*",
    OWNER_ONLY: `❌ *Access Denied! This command is reserved for Bot Owner only.*\n\n🚀 *Get Your Own Saqib-MD Bot For FREE Now:*\n🔗 ${PAIRING_LINK}`,
    GROUP_ONLY: "❌ *This command can only be used in WhatsApp Groups!*",
    ADMIN_ONLY: "❌ *You must be a Group Admin to use this command!*",
    BOT_ADMIN: "❌ *Saqib-MD must be an Admin to execute this command!*",
    ERROR: "⚠️ *An error occurred while executing this command.*"
  }
};

const getOwnerJid = (sock) => {
  const num = module.exports.OWNER_NUMBER;
  if (num && num.trim() !== '') {
    const d = String(num).replace(/[^0-9]/g, '');
    // If the bot runs on the owner's own number, WhatsApp now addresses that
    // account by LID. Sending to the phone-number JID in that case produces
    // "Waiting for this message. This may take a while." on the owner's phone.
    const botNum = String(sock?.user?.id || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
    if (sock?.user?.lid && d && d === botNum) return sock.user.lid;
    return `${num}@s.whatsapp.net`;
  }
  if (sock?.user?.id) {
    return (sock.user.id.split(':')[0].split('@')[0]) + '@s.whatsapp.net';
  }
  return null;
};

const onlyDigits = (v) => String(v || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');

// Resolve any JID (LID or phone) to a plain phone-number string.
// LID (`<15-digit>@lid`) is WhatsApp's privacy identifier and never matches a
// real owner number, so it MUST be mapped back through lib/lid.js first.
const resolveNumber = (jid) => {
  if (!jid) return '';
  const raw = String(jid);
  if (raw.endsWith('@s.whatsapp.net')) return onlyDigits(raw);
  try {
    const lid = require('./lib/lid');
    const resolved = lid.resolve(raw);
    if (resolved) return onlyDigits(resolved);
    // If we were handed a bare LID, try the LID form too.
    if (raw.endsWith('@lid')) {
      const asLid = lid.toLid ? lid.toLid(raw) : null;
      if (asLid) {
        const again = lid.resolve(asLid);
        if (again) return onlyDigits(again);
      }
      return ''; // unresolved LID — cannot be trusted as a phone number
    }
  } catch (_) {}
  const d = onlyDigits(raw);
  // Real phone numbers with country code are 8-14 digits; a 15-digit value is
  // an unresolved LID and must not be compared against owner numbers.
  if (d.length >= 8 && d.length <= 14) return d;
  return '';
};

const checkIsOwner = (m, sock) => {
  if (!m) return false;
  if (m.fromMe) return true;
  const botNumber = onlyDigits(sock?.user?.id);
  const owners = (Array.isArray(module.exports.OWNER_NUMBERS) && module.exports.OWNER_NUMBERS.length
    ? module.exports.OWNER_NUMBERS
    : [module.exports.OWNER_NUMBER].filter(Boolean)
  ).map(onlyDigits).filter(Boolean);

  // Collect every identifier we have for the sender and try each one.
  const candidates = [
    m.sender,
    m.senderLid,
    m.key?.senderPn,
    m.key?.participantPn,
    m.key?.participant,
    m.key?.senderLid,
    m.key?.participantLid,
    m.participant,
  ].filter(Boolean);

  const numbers = new Set();
  for (const c of candidates) {
    const n = resolveNumber(c);
    if (n) numbers.add(n);
  }

  if (botNumber && numbers.has(botNumber)) return true;
  for (const n of numbers) {
    if (owners.includes(n)) return true;
  }
  return false;
};

module.exports.getOwnerJid = getOwnerJid;
module.exports.checkIsOwner = checkIsOwner;

// ---------------------------------------------------------------------------
// Runtime settings persistence
// ---------------------------------------------------------------------------
// Toggles such as `.autoreact all`, `.antidelete inbox`, `.autovv on` used to
// live only in RAM, so every restart / redeploy silently reverted them to the
// .env defaults. From the user's side the command "turned on" but the feature
// stopped working. We now persist them to data/settings.json and reload on boot.
const path = require('path');
// Prefer a persistent location when available. On Railway the volume is
// mounted at /app/session, so runtime toggles survive redeploys instead of
// silently reverting to .env defaults.
const SETTINGS_FILE = (() => {
  if (process.env.SETTINGS_FILE) return process.env.SETTINGS_FILE;
  const volumeDir = path.join(__dirname, 'session');
  try {
    if (fs.existsSync(volumeDir) && fs.statSync(volumeDir).isDirectory()) {
      return path.join(volumeDir, 'settings.json');
    }
  } catch (_) {}
  return path.join(__dirname, 'data', 'settings.json');
})();
const PERSISTED_KEYS = [
  'PREFIX', 'WORK_TYPE',
  'AUTO_REACT', 'AUTO_REACT_MODE', 'AI_REACT',
  'AUTO_READ', 'ALWAYS_ONLINE', 'AUTO_BIO',
  'ANTI_DELETE', 'ANTI_DELETE_MODE',
  'ANTI_VIEW_ONCE', 'AUTO_VIEW_ONCE',
  'AUTO_STATUS_READ', 'AUTO_STATUS_REACT', 'STATUS_REACT_EMOJI',
  'ANTI_BADWORD', 'ANTI_CALL', 'ANTI_LINK',
  'CHATBOT_PM', 'CHATBOT_GROUP',
  'MAINTENANCE', 'INCOGNITO'
];

// Bump this whenever the factory defaults change. A settings.json written by an
// older version is then ignored once, so the bot really starts from the new
// defaults instead of silently keeping stale toggles from a previous deploy.
const SETTINGS_VERSION = 3;

const loadSettings = () => {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const saved = JSON.parse(raw);
    if (saved.__v !== SETTINGS_VERSION) {
      console.log('\u2699\ufe0f  Settings version changed \u2014 resetting to factory defaults.');
      try { fs.unlinkSync(SETTINGS_FILE); } catch (_) {}
      return;
    }
    let applied = 0;
    for (const k of PERSISTED_KEYS) {
      if (Object.prototype.hasOwnProperty.call(saved, k)) {
        module.exports[k] = saved[k];
        applied++;
      }
    }
    if (applied) console.log(`⚙️  Restored ${applied} saved settings from data/settings.json`);
  } catch (_) { /* first run — no settings file yet */ }
};

let __lastSettingsJson = null;
const persistSettings = () => {
  try {
    const out = { __v: SETTINGS_VERSION };
    for (const k of PERSISTED_KEYS) out[k] = module.exports[k];
    const json = JSON.stringify(out, null, 2);
    if (json === __lastSettingsJson) return true; // nothing changed — no disk IO
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, json);
    __lastSettingsJson = json;
    return true;
  } catch (e) {
    console.log('⚠️  Could not save settings:', e.message);
    return false;
  }
};

module.exports.persistSettings = persistSettings;
loadSettings();
