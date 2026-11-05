/**
 * lib/viewOnceCache.js
 * ---------------------------------------------------------------------------
 * WhatsApp strips the mediaKey from a view-once message after it has been
 * opened. When that happens Baileys throws:
 *   "Cannot derive from empty media key"
 * and `.vv` / auto-save can no longer download the media.
 *
 * To make recovery reliable we cache the decrypted buffer the moment the
 * view-once message arrives (before the recipient opens it). `.vv` then falls
 * back to this cache if a later download fails.
 *
 * The cache is intentionally small and time-limited so it never grows without
 * bound on a long-running Railway container.
 */

const TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ENTRIES = 60;

const store = new Map();

function cleanup() {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (!entry || now - entry.time > TTL_MS) store.delete(id);
  }
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (!oldest) break;
    store.delete(oldest);
  }
}

function put(id, data) {
  if (!id || !data || !data.buffer || !data.buffer.length) return false;
  store.set(String(id), {
    buffer: data.buffer,
    type: data.type || 'image',
    sender: data.sender || null,
    chat: data.chat || null,
    time: Date.now()
  });
  cleanup();
  return true;
}

function get(id) {
  if (!id) return null;
  const entry = store.get(String(id));
  if (!entry) return null;
  if (Date.now() - entry.time > TTL_MS) {
    store.delete(String(id));
    return null;
  }
  return entry;
}

function has(id) {
  return Boolean(get(id));
}

function size() {
  return store.size;
}

module.exports = { put, get, has, size, cleanup, TTL_MS };
