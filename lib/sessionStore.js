/**
 * Multi-session registry.
 *
 * One MongoDB document per linked WhatsApp number. Each document owns:
 *   - the Baileys session id used by `useMongoDBAuthState`
 *   - the owner number for that session (owner commands are scoped per session)
 *   - its own runtime settings (so `.autoreact off` on session A does not
 *     affect session B)
 *   - lifecycle flags (`enabled`) so a session can be stopped without deleting
 *     its credentials
 *
 * Collection: `saqib_bot_sessions`
 */
const { MongoClient } = require('mongodb');

const COLLECTION = 'saqib_bot_sessions';
const DEFAULT_SESSION_ID = process.env.SESSION_ID || 'saqib_md_session';

let client = null;
let db = null;
let collection = null;
let connecting = null;

function uri() {
  return process.env.MONGO_URI || require('../config').MONGO_URI;
}

async function connect() {
  if (collection) return collection;
  if (connecting) return connecting;
  connecting = (async () => {
    const c = new MongoClient(uri(), { serverSelectionTimeoutMS: 15000 });
    await c.connect();
    client = c;
    db = c.db();
    collection = db.collection(COLLECTION);
    await collection.createIndex({ sessionId: 1 }, { unique: true });
    return collection;
  })();
  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

const digits = (v) => String(v || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');

/** Build the default settings object for a brand-new session. */
function defaultSettings(overrides = {}) {
  const cfg = require('../config');
  const keys = [
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
  const out = {};
  for (const k of keys) out[k] = cfg[k];
  return Object.assign(out, overrides);
}

/** All sessions, oldest first. */
async function list() {
  const col = await connect();
  return col.find({}).sort({ createdAt: 1 }).toArray();
}

/** Only sessions that should be running. */
async function listEnabled() {
  const col = await connect();
  return col.find({ enabled: { $ne: false } }).sort({ createdAt: 1 }).toArray();
}

async function get(sessionId) {
  const col = await connect();
  return col.findOne({ sessionId });
}

/**
 * Create (or return the existing) session for a phone number.
 * A number can only ever have ONE session — re-pairing reuses the same
 * sessionId so the credentials document is updated in place.
 */
async function ensureForNumber(number, opts = {}) {
  const col = await connect();
  const ownerNumber = digits(number);
  const sessionId = opts.sessionId || `sess_${ownerNumber}`;

  const existing = await col.findOne({ sessionId });
  if (existing) {
    await col.updateOne(
      { sessionId },
      { $set: { enabled: true, lastPairedAt: new Date(), updatedAt: new Date() } }
    );
    return { ...existing, enabled: true };
  }

  const cfg = require('../config');
  const doc = {
    sessionId,
    ownerNumber,
    ownerNumbers: [ownerNumber],
    ownerName: opts.ownerName || cfg.OWNER_NAME || 'Owner',
    botName: opts.botName || cfg.BOT_NAME || 'SAQIB-MD',
    settings: defaultSettings(opts.settings || {}),
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastPairedAt: new Date()
  };
  await col.insertOne(doc);
  return doc;
}

async function setEnabled(sessionId, enabled) {
  const col = await connect();
  await col.updateOne({ sessionId }, { $set: { enabled: !!enabled, updatedAt: new Date() } });
}

async function saveSettings(sessionId, settings) {
  const col = await connect();
  await col.updateOne(
    { sessionId },
    { $set: { settings, updatedAt: new Date() } },
    { upsert: false }
  );
}

async function touch(sessionId, patch = {}) {
  const col = await connect();
  await col.updateOne({ sessionId }, { $set: { ...patch, lastSeen: new Date() } });
}

async function remove(sessionId) {
  const col = await connect();
  await col.deleteOne({ sessionId });
}

/**
 * One-time migration: if the registry is empty but the legacy single-session
 * credentials exist, register them so an existing deployment keeps running
 * after the multi-session upgrade.
 */
async function migrateLegacyIfNeeded() {
  const col = await connect();
  const count = await col.countDocuments({});
  if (count > 0) return null;

  const cfg = require('../config');
  const ownerNumber = digits(cfg.OWNER_NUMBER);
  if (!ownerNumber) return null;

  const doc = {
    sessionId: DEFAULT_SESSION_ID,
    ownerNumber,
    ownerNumbers: [ownerNumber],
    ownerName: cfg.OWNER_NAME || 'Owner',
    botName: cfg.BOT_NAME || 'SAQIB-MD',
    settings: defaultSettings(),
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    legacy: true
  };
  await col.insertOne(doc);
  console.log(`🗂️  Migrated legacy session into multi-session registry (${ownerNumber})`);
  return doc;
}

module.exports = {
  DEFAULT_SESSION_ID,
  connect,
  list,
  listEnabled,
  get,
  ensureForNumber,
  setEnabled,
  saveSettings,
  touch,
  remove,
  defaultSettings,
  migrateLegacyIfNeeded,
  digits
};
