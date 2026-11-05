/**
 * lib/messageStore.js
 * ---------------------------------------------------------------------------
 * Bounded, process-wide cache of recently seen messages.
 *
 * Why it is its own module:
 *   - `getMessage()` needs it to re-serve a message WhatsApp asks for during a
 *     decrypt retry (otherwise the sender sees "Waiting for this message").
 *   - Anti-delete needs it to re-send a deleted message.
 *   - `.vv` needs it to recover a view-once whose mediaKey was stripped from
 *     the quoted copy but is still present on the original payload.
 *
 * Keeping it in index.js meant plugins could not reach it without a circular
 * require, so the view-once recovery path had no way back to the original.
 */

const LIMIT = 4000;
const store = new Map();

function cache(id, entry) {
  if (!id) return;
  store.set(String(id), entry);
  while (store.size > LIMIT) {
    const oldest = store.keys().next().value;
    if (!oldest) break;
    store.delete(oldest);
  }
}

function get(id) {
  if (!id) return null;
  return store.get(String(id)) || null;
}

function has(id) {
  return Boolean(get(id));
}

function size() {
  return store.size;
}

module.exports = { cache, get, has, size, LIMIT, store };
