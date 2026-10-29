/**
 * SAQIB-MD — One-time session migration: disk (session/) -> MongoDB Atlas
 * Run inside the container so it can reuse the installed mongoose + baileys.
 *
 *   node migrate_session_to_mongo.js
 *
 * Reads Baileys multi-file auth state (creds.json + keys.json) and writes it
 * into the same collections that lib/mongoAuth.js uses (SaqibSession/SaqibKey).
 * Safe to re-run: it upserts.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { BufferJSON } = require('@whiskeysockets/baileys');

const MONGO_URI = process.env.MONGO_URI;
const SESSION_ID = process.env.SESSION_ID || 'saqib_md_session';
const SESSION_DIR = path.join(__dirname, 'session');

if (!MONGO_URI) {
  console.error('❌ MONGO_URI not set in environment.');
  process.exit(1);
}
if (!fs.existsSync(path.join(SESSION_DIR, 'creds.json'))) {
  console.error('❌ No session/creds.json found — nothing to migrate.');
  process.exit(1);
}

const SessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  creds: { type: Object, default: {} },
  updatedAt: { type: Date, default: Date.now }
});
const KeySchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  keyId: { type: String, required: true },
  value: { type: Object, default: null },
  updatedAt: { type: Date, default: Date.now }
});
KeySchema.index({ sessionId: 1, keyId: 1 }, { unique: true });

const SessionModel = mongoose.models.SaqibSession || mongoose.model('SaqibSession', SessionSchema);
const KeyModel = mongoose.models.SaqibKey || mongoose.model('SaqibKey', KeySchema);

(async () => {
  console.log('🔌 Connecting to MongoDB Atlas...');
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  console.log('✅ Connected.');

  // ---- 1. creds ----
  const rawCreds = JSON.parse(fs.readFileSync(path.join(SESSION_DIR, 'creds.json'), 'utf8'), BufferJSON.reviver);
  await SessionModel.updateOne(
    { sessionId: SESSION_ID },
    { $set: { creds: JSON.parse(JSON.stringify(rawCreds, BufferJSON.replacer)), updatedAt: new Date() } },
    { upsert: true }
  );
  console.log(`✅ creds migrated (me: ${rawCreds?.me?.id || 'unknown'})`);

  // ---- 2. keys ----
  const keysPath = path.join(SESSION_DIR, 'keys.json');
  let keyCount = 0;
  if (fs.existsSync(keysPath)) {
    const keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'), BufferJSON.reviver);
    const bulkOps = [];

    for (const type of Object.keys(keys)) {
      const bucket = keys[type];
      if (!bucket || typeof bucket !== 'object') continue;
      for (const id of Object.keys(bucket)) {
        const value = bucket[id];
        const keyId = `${type}-${id}`;
        if (value === null || value === undefined) continue;
        bulkOps.push({
          updateOne: {
            filter: { sessionId: SESSION_ID, keyId },
            update: {
              $set: {
                value: JSON.parse(JSON.stringify(value, BufferJSON.replacer)),
                updatedAt: new Date()
              }
            },
            upsert: true
          }
        });
        keyCount++;
      }
    }

    if (bulkOps.length) {
      // chunk to avoid oversized bulk requests
      const CHUNK = 500;
      for (let i = 0; i < bulkOps.length; i += CHUNK) {
        await KeyModel.bulkWrite(bulkOps.slice(i, i + CHUNK), { ordered: false });
      }
    }
    console.log(`✅ ${keyCount} Signal keys migrated.`);
  } else {
    console.log('ℹ️  keys.json not found — only creds migrated.');
  }

  // ---- 3. verify ----
  const sessionCheck = await SessionModel.findOne({ sessionId: SESSION_ID }).lean();
  const keyCheck = await KeyModel.countDocuments({ sessionId: SESSION_ID });
  console.log('🔎 Verify -> session doc:', Boolean(sessionCheck?.creds), '| keys in DB:', keyCheck);
  console.log('🎉 MIGRATION COMPLETE');

  await mongoose.disconnect();
  process.exit(0);
})().catch(async (e) => {
  console.error('❌ Migration failed:', e?.message || e);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
