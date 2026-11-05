/**
 * Per-session runtime context.
 *
 * The bot was originally single-session: `config` was one global object and
 * `index.js` kept one global socket. Multi-session needs every command to see
 * the settings / owner / socket of the session that received the message.
 *
 * Instead of rewriting 44 plugins to take a context argument, we carry the
 * active session in an AsyncLocalStorage store. `config` is a Proxy that reads
 * through to `ctx.settings` when a context is active, so `config.PREFIX`,
 * `config.WORK_TYPE`, `config.checkIsOwner(...)` etc. automatically become
 * session-scoped with zero plugin changes.
 */
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

/** Run `fn` with `ctx` as the active session context. */
function runWithSession(ctx, fn) {
  return als.run(ctx, fn);
}

/** Currently active session context, or undefined outside a session. */
function current() {
  return als.getStore();
}

/** Active session id, or null. */
function currentSessionId() {
  const c = als.getStore();
  return c ? c.sessionId : null;
}

module.exports = { als, runWithSession, current, currentSessionId };
