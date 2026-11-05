/**
 * lib/identity.js — who am I, and who is this sender?
 * -------------------------------------------------------------------------
 * WhatsApp's LID (Linked ID) migration broke two assumptions this bot used to
 * make:
 *
 *   1. "My own messages come back with `key.fromMe === true`."
 *      Baileys decides `fromMe` by comparing `stanza.attrs.participant` with
 *      `creds.me.id` (the PHONE NUMBER). In a LID-addressed group the
 *      participant is our LID, so `fromMe` comes back **false** for messages
 *      the owner sent from their own phone. The bot then treats the owner as a
 *      stranger: private mode ignores the command, and in public mode the bot
 *      answers itself. This is why the bot worked in small (phone-number)
 *      groups and did nothing in 600-member (LID) groups.
 *
 *   2. "A 15-digit number is a phone number."
 *      It is not — it is a LID. Turning `<15-digit>@lid` into
 *      `<15-digit>@s.whatsapp.net` produces a JID that does not exist, so the
 *      reply is encrypted for nobody and the phone shows
 *      "Waiting for this message. This may take a while."
 *
 * Everything here is deliberately side-effect free so it can be unit tested.
 */

const lid = require('./lid');

const digits = (j) => String(j || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
const isLidJid = (j) => typeof j === 'string' && j.endsWith('@lid');
const isPnJid = (j) => typeof j === 'string' && j.endsWith('@s.whatsapp.net');

/** A real phone number with country code is 8-14 digits. A LID is 15+. */
const isPhoneNumber = (d) => {
  const s = String(d || '');
  return s.length >= 8 && s.length <= 14;
};

/** Turn a local Pakistani number (03xx…) into full international form. */
function normalizeNumber(d) {
  let s = String(d || '');
  if (!s) return s;
  if (s.startsWith('0092')) s = s.slice(2);
  if (s.startsWith('0') && s.length === 11) s = '92' + s.slice(1);
  else if (s.length === 10 && s.startsWith('3')) s = '92' + s;
  return s;
}

/**
 * Collect every identifier that points at the bot's own account.
 * `sock.user` is `creds.me`, which carries BOTH `id` (phone number, possibly
 * with a `:device` suffix) and `lid` (the linked id).
 */
function ownIdentifiers(sock) {
  const pnRaw = sock?.user?.id || sock?.authState?.creds?.me?.id || '';
  const lidRaw = sock?.user?.lid || sock?.authState?.creds?.me?.lid || '';
  const pn = digits(pnRaw);
  const lidDigits = digits(lidRaw);
  const set = new Set([pn, lidDigits].filter(Boolean));
  return {
    pn,
    lid: lidDigits,
    pnJid: pn ? `${pn}@s.whatsapp.net` : null,
    lidJid: lidDigits ? `${lidDigits}@lid` : null,
    has: (d) => !!d && set.has(String(d))
  };
}

/**
 * Is `jid` one of our own identities?
 * Accepts a phone-number JID, a LID JID, a bare number, or a `:device` form.
 */
function isOwnJid(jid, own) {
  if (!jid || !own) return false;
  const d = digits(jid);
  if (!d) return false;
  if (own.has(d)) return true;
  // LID -> phone number
  try {
    const asPn = lid.resolve(jid);
    if (asPn && own.has(digits(asPn))) return true;
  } catch (_) {}
  // phone number -> LID
  try {
    const asLid = lid.toLid ? lid.toLid(jid) : null;
    if (asLid && own.has(digits(asLid))) return true;
  } catch (_) {}
  return false;
}

/**
 * Resolve a JID to a phone-number JID **only when the mapping is known**.
 * Returns null instead of inventing a fake number for an unknown LID.
 */
function resolvePnStrict(jid) {
  if (!jid) return null;
  const raw = String(jid);
  if (isPnJid(raw)) {
    const d = normalizeNumber(digits(raw));
    return isPhoneNumber(d) ? `${d}@s.whatsapp.net` : null;
  }
  try {
    const mapped = lid.resolve(raw);
    if (mapped) {
      const d = normalizeNumber(digits(mapped));
      if (isPhoneNumber(d)) return `${d}@s.whatsapp.net`;
    }
  } catch (_) {}
  if (!isLidJid(raw)) {
    const d = normalizeNumber(digits(raw));
    if (isPhoneNumber(d)) return `${d}@s.whatsapp.net`;
  }
  return null;
}

/**
 * Best identity for a sender:
 *   - a real phone-number JID when we can prove it
 *   - otherwise the ORIGINAL jid untouched (a `@lid` is valid and routable)
 */
function senderJid(rawJid) {
  if (!rawJid) return null;
  const pn = resolvePnStrict(rawJid);
  if (pn) return pn;
  const raw = String(rawJid);
  if (raw.includes('@')) return raw;
  const d = normalizeNumber(digits(raw));
  return isPhoneNumber(d) ? `${d}@s.whatsapp.net` : raw;
}

module.exports = {
  digits,
  normalizeNumber,
  isLidJid,
  isPnJid,
  isPhoneNumber,
  ownIdentifiers,
  isOwnJid,
  resolvePnStrict,
  senderJid
};
