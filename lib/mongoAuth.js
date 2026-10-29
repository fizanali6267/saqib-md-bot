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

  const state = {
    creds,
    keys: {
      get: async (type, ids) => {
        const data = {};
        const keyIds = ids.map(id => `${type}-${id}`);
        const docs = await KeyModel.find({ sessionId, keyId: { $in: keyIds } }).lean();
        
        for (const doc of docs) {
          if (doc && doc.value) {
            const id = doc.keyId.slice(type.length + 1);
            let val = JSON.parse(JSON.stringify(doc.value), BufferJSON.reviver);
            // Convert app-state-sync-key values with proto.Message.AppStateSyncKeyData.fromObject
            if (type === 'app-state-sync-key' && val && proto?.Message?.AppStateSyncKeyData?.fromObject) {
              val = proto.Message.AppStateSyncKeyData.fromObject(val);
            }
            data[id] = val;
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
            if (value) {
              const serialized = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
              bulkOps.push({
                updateOne: {
                  filter: { sessionId, keyId },
                  update: { $set: { value: serialized, updatedAt: new Date() } },
                  upsert: true
                }
              });
            } else {
              bulkOps.push({
                deleteOne: {
                  filter: { sessionId, keyId }
                }
              });
            }
          }
        }
        if (bulkOps.length > 0) {
          await KeyModel.bulkWrite(bulkOps, { ordered: false });
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

module.exports = { useMongoDBAuthState, promoteSession, deleteSession, SessionModel, KeyModel };
