'use strict';
/**
 * Shared plugin factory for the "extra" command packs.
 *
 * Each pack module (lib/extra/handlers/*.js) exports a plain `handlers` map of
 * `command -> async (ctx) => {}`. This factory turns such a map into a standard
 * SAQIB-MD plugin object:
 *
 *   { name, commands: [...], execute(sock, m, { command, args, prefix }) }
 *
 * It also builds the `ctx` object every handler expects:
 *   { sock, m, command, args, prefix, usage, desc, info }
 *
 * Commands that already exist in the legacy plugin set are skipped so we never
 * register the same command twice (the loader/dispatcher is first-wins).
 */

const commandInfo = require('../commandInfo');

// Commands handled by pre-existing plugins — must not be re-registered.
const LEGACY_OWNED = new Set(['crypto', 'gemini', 'geolocation']);

function buildCtx(sock, m, command, args, prefix) {
  let info = null;
  try {
    info = commandInfo.lookup(command);
  } catch (_) {
    info = null;
  }
  return {
    sock,
    m,
    command,
    args: args || [],
    prefix,
    usage: (info && info.found && info.usage) || `<${command}>`,
    desc: (info && info.found && info.desc) || '',
    info
  };
}

/**
 * @param {string} name       plugin name shown in the boot log
 * @param {object} handlers   map of command -> handler(ctx)
 * @param {string[]} [only]   optional explicit allow-list
 */
function createExtraPlugin(name, handlers, only) {
  const all = Object.keys(handlers);
  const commands = (only || all).filter((c) => typeof handlers[c] === 'function' && !LEGACY_OWNED.has(c));

  return {
    name,
    commands,
    execute: async (sock, m, { command, args, prefix }) => {
      const handler = handlers[command];
      if (typeof handler !== 'function') return;
      const ctx = buildCtx(sock, m, command, args, prefix);
      return handler(ctx);
    }
  };
}

module.exports = { createExtraPlugin, buildCtx, LEGACY_OWNED };
