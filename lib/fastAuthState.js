/**
 * FAST AUTH STATE — in-memory cached multi-file auth state for Baileys.
 *
 * Why: Baileys' stock useMultiFileAuthState() does a synchronous
 * fs.readFileSync + JSON.parse for EVERY Signal key lookup, and a
 * synchronous fs.writeFileSync for every key write. On a slow container
 * that means thousands of disk hits per message -> huge latency and the
 * "Waiting for this message" symptom.
 *
 * This implementation:
 *  - keeps every key in a Map (0ms lookup)
 *  - reads from disk only on a cache miss
 *  - batches writes and flushes them asynchronously (debounced)
 *  - flushes on process exit so the session is never lost
 */

const fs = require('fs');
const path = require('path');
const { proto, BufferJSON, initAuthCreds } = require('@whiskeysockets/baileys');

const FLUSH_DELAY_MS = 1200;

function useFastAuthState(folder) {
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

  const credsFile = path.join(folder, 'creds.json');
  const keysFile = path.join(folder, 'keys.json');

  // ---------- credentials ----------
  let creds;
  try {
    if (fs.existsSync(credsFile)) {
      creds = JSON.parse(fs.readFileSync(credsFile, 'utf8'), BufferJSON.reviver);
    }
  } catch (e) {
    console.error('fastAuth: failed to read creds.json, starting fresh:', e.message);
  }
  if (!creds) creds = initAuthCreds();

  // ---------- keys (single JSON file, fully in memory) ----------
  const keyStore = new Map(); // "type-id" -> value
  try {
    if (fs.existsSync(keysFile)) {
      const raw = JSON.parse(fs.readFileSync(keysFile, 'utf8'));
      for (const [k, v] of Object.entries(raw)) {
        keyStore.set(k, v === null ? null : JSON.parse(JSON.stringify(v), BufferJSON.reviver));
      }
    }
  } catch (e) {
    console.error('fastAuth: failed to read keys.json:', e.message);
  }

  // ---------- debounced async persistence ----------
  let flushTimer = null;
  let dirtyKeys = new Set();
  let credsDirty = false;
  let flushing = false;

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush().catch(() => {});
    }, FLUSH_DELAY_MS);
    if (flushTimer.unref) flushTimer.unref();
  }

  async function flush() {
    if (flushing) return;
    flushing = true;
    try {
      if (credsDirty) {
        credsDirty = false;
        const tmp = credsFile + '.tmp';
        await fs.promises.writeFile(tmp, JSON.stringify(creds, BufferJSON.replacer));
        await fs.promises.rename(tmp, credsFile);
      }
      if (dirtyKeys.size > 0) {
        const snapshot = {};
        for (const [k, v] of keyStore) {
          snapshot[k] = v === null ? null : JSON.parse(JSON.stringify(v, BufferJSON.replacer));
        }
        dirtyKeys.clear();
        const tmp = keysFile + '.tmp';
        await fs.promises.writeFile(tmp, JSON.stringify(snapshot));
        await fs.promises.rename(tmp, keysFile);
      }
    } catch (e) {
      console.error('fastAuth flush error:', e.message);
    } finally {
      flushing = false;
    }
  }

  // Never lose the session on shutdown
  const shutdown = () => {
    try {
      if (credsDirty) {
        fs.writeFileSync(credsFile, JSON.stringify(creds, BufferJSON.replacer));
      }
      if (dirtyKeys.size > 0) {
        const snapshot = {};
        for (const [k, v] of keyStore) {
          snapshot[k] = v === null ? null : JSON.parse(JSON.stringify(v, BufferJSON.replacer));
        }
        fs.writeFileSync(keysFile, JSON.stringify(snapshot));
      }
    } catch (_) {}
  };
  process.once('SIGTERM', () => { shutdown(); process.exit(0); });
  process.once('SIGINT', () => { shutdown(); process.exit(0); });
  process.once('beforeExit', shutdown);

  const state = {
    creds,
    keys: {
      get: async (type, ids) => {
        const data = {};
        for (const id of ids) {
          const cacheKey = `${type}-${id}`;
          let value = keyStore.get(cacheKey);
          if (value === undefined) {
            // cache miss -> try disk once, then remember the result (even null)
            try {
              const file = path.join(folder, `${type}-${id}.json`);
              if (fs.existsSync(file)) {
                value = JSON.parse(fs.readFileSync(file, 'utf8'), BufferJSON.reviver);
              } else {
                value = null;
              }
            } catch (_) {
              value = null;
            }
            keyStore.set(cacheKey, value);
          }
          if (value !== null && value !== undefined) {
            if (type === 'app-state-sync-key' && value && proto?.Message?.AppStateSyncKeyData?.fromObject) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          }
        }
        return data;
      },

      set: async (data) => {
        for (const type in data) {
          for (const id in data[type]) {
            const cacheKey = `${type}-${id}`;
            const value = data[type][id];
            if (value === null || value === undefined) {
              keyStore.delete(cacheKey);
            } else {
              keyStore.set(cacheKey, value);
            }
            dirtyKeys.add(cacheKey);
          }
        }
        scheduleFlush();
      }
    }
  };

  const saveCreds = async () => {
    credsDirty = true;
    scheduleFlush();
  };

  return { state, saveCreds, flush };
}

module.exports = { useFastAuthState };
