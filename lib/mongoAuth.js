const mongoose = require('mongoose');
const { proto, BufferJSON, initAuthCreds } = require('@whiskeysockets/baileys');

// MongoDB Schema for storing Baileys Auth Session Metadata & Credentials
const SessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  creds: { type: Object, default: {} },
  updatedAt: { type: Date, default: Date.now }
});

// MongoDB Schema for storing individual Signal Cryptographic Keys (Pre-keys, Sessions, App-state, etc.)
// Storing keyId as a document field (value) completely eliminates the MongoDB dotted-field restriction (e.g. session-...@s.whatsapp.net.0)
// and prevents hitting the 16MB single-document BSON limit while enabling fast atomic indexed queries.
const KeySchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  keyId: { type: String, required: true },
  value: { type: Object, default: null },
  updatedAt: { type: Date, default: Date.now }
});

KeySchema.index({ sessionId: 1, keyId: 1 }, { unique: true });

const SessionModel = mongoose.models.SaqibSession || mongoose.model('SaqibSession', SessionSchema);
const KeyModel = mongoose.models.SaqibKey || mongoose.model('SaqibKey', KeySchema);

const useMongoDBAuthState = async (mongoUri, sessionId = 'saqib_md_session') => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB Atlas successfully.');
  }

  // Issue 2 Fix: High-speed RAM cache for Signal keys.
  // WhatsApp asks for 10-30 encryption keys to decrypt ONE message. Hitting
  // Atlas for every one of them cost 200ms each (6-10s per message, and up to
  // a minute when keys were missing). Now every key is served from memory and
  // MongoDB is only queried for genuine cache misses.
  const inMemoryKeyCache = new Map(); // `${sessionId}:${type}-${id}` -> value | null

  let sessionDoc = await SessionModel.findOne({ sessionId });
  let creds;

  if (sessionDoc && sessionDoc.creds && Object.keys(sessionDoc.creds).length > 0) {
    try {
      creds = JSON.parse(JSON.stringify(sessionDoc.creds), BufferJSON.reviver);
    } catch (_) {
      creds = initAuthCreds();
    }
  } else {
    creds = initAuthCreds();
    await SessionModel.findOneAndUpdate(
      { sessionId },
      { creds: JSON.parse(JSON.stringify(creds, BufferJSON.replacer)), updatedAt: new Date() },
      { upsert: true, new: true }
    );
  }

  // Pre-load every key for this session into RAM at boot (one query, not N).
  try {
    const existingKeys = await KeyModel.find({ sessionId }).lean();
    for (const doc of existingKeys) {
      if (doc && doc.keyId) {
        let val = null;
        if (doc.value) {
          // Store the RAW value: conversion happens on every read, so a cached
          // hit behaves exactly like a fresh database hit.
          val = JSON.parse(JSON.stringify(doc.value), BufferJSON.reviver);
        }
        inMemoryKeyCache.set(`${sessionId}:${doc.keyId}`, val);
      }
    }
    console.log(`⚡ Pre-loaded ${existingKeys.length} Signal keys into fast memory cache!`);
  } catch (e) {
    console.error('Signal key pre-load failed (continuing with cold cache):', e?.message || e);
  }

  const state = {
    creds,
    keys: {
      get: async (type, ids) => {
        const data = {};
        const missingIds = [];
        const missingKeyMap = {}; // keyId -> original id

        // 1. Instant RAM lookup
        for (const id of ids) {
          const keyId = `${type}-${id}`;
          const cacheKey = `${sessionId}:${keyId}`;
          if (inMemoryKeyCache.has(cacheKey)) {
            let val = inMemoryKeyCache.get(cacheKey);
            if (val !== null && val !== undefined) {
              // Issue 4 Fix: apply the same proto decoding on cache hits as on
              // database hits, so a warm cache behaves identically.
              if (type === 'app-state-sync-key' && proto?.Message?.AppStateSyncKeyData?.fromObject) {
                val = proto.Message.AppStateSyncKeyData.fromObject(val);
              }
              data[id] = val;
            }
          } else {
            missingIds.push(keyId);
            missingKeyMap[keyId] = id;
          }
        }

        // 2. Only genuine misses reach MongoDB
        if (missingIds.length > 0) {
          const docs = await KeyModel.find({ sessionId, keyId: { $in: missingIds } }).lean();
          const foundKeyIds = new Set();

          for (const doc of docs) {
            if (doc && doc.value) {
              foundKeyIds.add(doc.keyId);
              let val = JSON.parse(JSON.stringify(doc.value), BufferJSON.reviver);
              // Issue 4 Fix: app-state-sync-key must be decoded through proto
              if (type === 'app-state-sync-key' && val && proto?.Message?.AppStateSyncKeyData?.fromObject) {
                val = proto.Message.AppStateSyncKeyData.fromObject(val);
              }
              inMemoryKeyCache.set(`${sessionId}:${doc.keyId}`, val);
              data[doc.keyId.slice(type.length + 1)] = val;
            }
          }

          // 3. Negative caching: remember keys that do NOT exist so the same
          // missing key never triggers another DB round-trip (kills the storm).
          for (const keyId of missingIds) {
            if (!foundKeyIds.has(keyId)) {
              inMemoryKeyCache.set(`${sessionId}:${keyId}`, null);
            }
          }
        }

        return data;
      },
      set: async (data) => {
        const bulkOps = [];
        for (const type in data) {
          for (const id in data[type]) {
            const value = data[type][id];
            const keyId = `${type}-${id}`;
            const cacheKey = `${sessionId}:${keyId}`;
            if (value) {
              // 0ms RAM update first, DB write happens in the background
              inMemoryKeyCache.set(cacheKey, value);
              const serialized = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
              bulkOps.push({
                updateOne: {
                  filter: { sessionId, keyId },
                  update: { $set: { value: serialized, updatedAt: new Date() } },
                  upsert: true
                }
              });
            } else {
              inMemoryKeyCache.delete(cacheKey);
              bulkOps.push({
                deleteOne: {
                  filter: { sessionId, keyId }
                }
              });
            }
          }
        }
        if (bulkOps.length > 0) {
          // Issue 2 Fix: never block Baileys on the network write
          KeyModel.bulkWrite(bulkOps, { ordered: false }).catch(() => null);
        }
      }
    }
  };

  return {
    state,
    saveCreds: async () => {
      await SessionModel.findOneAndUpdate(
        { sessionId },
        { 
          creds: JSON.parse(JSON.stringify(state.creds, BufferJSON.replacer)),
          updatedAt: new Date() 
        },
        { upsert: true }
      );
    }
  };
};

// Atomically promotes a temporary pairing session into the primary bot session
const promoteSession = async (fromSessionId, targetSessionId) => {
  try {
    const fromDoc = await SessionModel.findOne({ sessionId: fromSessionId });
    if (fromDoc && fromDoc.creds) {
      // 1. Promote Credentials
      await SessionModel.findOneAndUpdate(
        { sessionId: targetSessionId },
        { 
          creds: fromDoc.creds, 
          updatedAt: new Date() 
        },
        { upsert: true, new: true }
      );

      // 2. Promote Keys: Delete old target keys and reassign temp session keys atomically
      await KeyModel.deleteMany({ sessionId: targetSessionId });
      await KeyModel.updateMany({ sessionId: fromSessionId }, { $set: { sessionId: targetSessionId } });

      // 3. Verify target session exists before removing temporary session doc
      const targetDoc = await SessionModel.findOne({ sessionId: targetSessionId });
      if (targetDoc && targetDoc.creds) {
        await SessionModel.deleteOne({ sessionId: fromSessionId });
        console.log(`✅ Session successfully promoted and verified from ${fromSessionId} to ${targetSessionId}`);
        return true;
      }
    }
  } catch (err) {
    console.error(`Failed to promote session from ${fromSessionId} to ${targetSessionId}:`, err);
  }
  return false;
};

// Cleans up a temporary or cancelled session
const deleteSession = async (sessionId) => {
  try {
    await SessionModel.deleteOne({ sessionId });
    await KeyModel.deleteMany({ sessionId });
  } catch (_) {}
};

// Deletes every stored Signal SESSION (ratchet) for a session id, while keeping
// creds, prekeys and app-state keys intact.
//
// Why: jab koi naya device pair hota hai, pairing socket kuch Signal sessions
// bana leta hai. Woh sessions naye device identity ke sath reuse hone par
// desync ho jate hain -> "Bad MAC" + "Waiting for this message. This may take
// a while." Sessions ko clear karne se WhatsApp prekey bundle bhejta hai aur
// session bilkul fresh (aur correct) banta hai.
const clearSignalSessions = async (sessionId) => {
  try {
    const res = await KeyModel.deleteMany({ sessionId, keyId: /^session-/ });
    return res?.deletedCount || 0;
  } catch (_) {
    return 0;
  }
};

module.exports = {
  useMongoDBAuthState,
  promoteSession,
  deleteSession,
  clearSignalSessions,
  SessionModel,
  KeyModel
};
