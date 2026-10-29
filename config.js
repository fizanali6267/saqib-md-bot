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
  ANTI_DELETE: parseBool(process.env.ANTI_DELETE, true),
  ANTI_DELETE_MODE: process.env.ANTI_DELETE_MODE || "same", // 'same' (same chat) or 'inbox' (owner PM)

  // Anti-View-Once & Auto-VV Settings (Fixed boolean parsing)
  ANTI_VIEW_ONCE: parseBool(process.env.ANTI_VIEW_ONCE, true), // Manual & Quoted .vv
  AUTO_VIEW_ONCE: parseBool(process.env.AUTO_VIEW_ONCE, true), // Auto-recovers incoming view once to personal inbox

  // Automation & Presence Features
  ALWAYS_ONLINE: parseBool(process.env.ALWAYS_ONLINE, true),
  AUTO_READ: parseBool(process.env.AUTO_READ, false), // Blue tick automation
  AUTO_REACT: parseBool(process.env.AUTO_REACT, true),
  AUTO_REACT_MODE: process.env.AUTO_REACT_MODE || "sender", // 'sender', 'all', 'me', 'mirror'
  AI_REACT: parseBool(process.env.AI_REACT, false), // Smart sentiment reaction
  AUTO_STATUS_READ: parseBool(process.env.AUTO_STATUS_READ, true),
  AUTO_STATUS_REACT: parseBool(process.env.AUTO_STATUS_REACT, true),
  STATUS_REACT_EMOJI: process.env.STATUS_REACT_EMOJI || "❤️",

  // Granular Chatbot Settings (Friendly, human-like AI)
  CHATBOT_PM: parseBool(process.env.CHATBOT_PM, true), // Active in Private DM
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
  ANTI_LINK: parseBool(process.env.ANTI_LINK, true),
  ANTI_BADWORD: parseBool(process.env.ANTI_BADWORD, true),
  ANTI_CALL: parseBool(process.env.ANTI_CALL, false),
  AUTO_BIO: parseBool(process.env.AUTO_BIO, false),

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
    return `${num}@s.whatsapp.net`;
  }
  if (sock?.user?.id) {
    return (sock.user.id.split(':')[0].split('@')[0]) + '@s.whatsapp.net';
  }
  return null;
};

const checkIsOwner = (m, sock) => {
  if (m.fromMe) return true;
  const botNumber = sock?.user?.id?.split(':')[0]?.split('@')[0];
  const senderNumber = m.sender?.split('@')[0]?.split(':')[0];
  if (botNumber && senderNumber === botNumber) return true;
  const owners = Array.isArray(module.exports.OWNER_NUMBERS) && module.exports.OWNER_NUMBERS.length
    ? module.exports.OWNER_NUMBERS
    : [module.exports.OWNER_NUMBER].filter(Boolean);
  if (senderNumber && owners.includes(senderNumber)) return true;
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
const SETTINGS_FILE = path.join(__dirname, 'data', 'settings.json');
const PERSISTED_KEYS = [
  'PREFIX', 'WORK_TYPE',
  'AUTO_REACT', 'AUTO_REACT_MODE', 'AI_REACT',
  'AUTO_READ', 'ALWAYS_ONLINE', 'AUTO_BIO',
  'ANTI_DELETE', 'ANTI_DELETE_MODE',
  'ANTI_VIEW_ONCE', 'AUTO_VIEW_ONCE',
  'AUTO_STATUS_READ', 'AUTO_STATUS_REACT', 'STATUS_REACT_EMOJI',
  'ANTI_BADWORD', 'ANTI_CALL', 'ANTI_LINK',
  'CHATBOT_PM', 'CHATBOT_GROUP'
];

const loadSettings = () => {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const saved = JSON.parse(raw);
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
    const out = {};
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
