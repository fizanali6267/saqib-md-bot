/**
 * Mention / display-name helper
 * -------------------------------------------------------------------------
 * WhatsApp increasingly addresses people by LID (`<15-digit>@lid`) instead of
 * their phone number. Printing that raw LID in a message looks like a fake
 * number to the user, e.g. "@215753789857825".
 *
 * This module returns the best human-readable identity available:
 *   1. The real phone number, if we can resolve the LID
 *   2. The contact's push name (saved name), if known
 *   3. A neutral label ("User") as a last resort
 *
 * It also builds the `mentions` array so WhatsApp renders a real tag.
 */

const lid = require('./lid');

const digits = (j) => String(j || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');

/**
 * A LID is a long numeric id (usually 15 digits) that is NOT a valid phone
 * number. Real phone numbers with country codes are 10-13 digits and never
 * start with a 0.
 */
function looksLikeLid(jid) {
  const d = digits(jid);
  if (!d) return false;
  if (String(jid || '').endsWith('@lid')) return true;
  if (d.length >= 15) return true;
  return false;
}

/**
 * Resolve a JID to a phone-number JID.
 * Returns null when the number genuinely cannot be recovered.
 */
function toPhoneJid(jid) {
  if (!jid) return null;
  if (String(jid).endsWith('@s.whatsapp.net')) return jid;
  const resolved = lid.resolve(jid);
  if (resolved) return resolved;
  if (!looksLikeLid(jid)) {
    const d = digits(jid);
    if (d.length >= 8 && d.length <= 14) return `${d}@s.whatsapp.net`;
  }
  return null;
}

/**
 * Best display label for a JID.
 * `name` is optional (push name / saved contact name).
 */
function displayName(jid, name) {
  const phone = toPhoneJid(jid);
  if (phone) return digits(phone);
  if (name && String(name).trim()) return String(name).trim();
  return 'User';
}

/**
 * Build the text token used inside a message body.
 * If we have a phone number we emit "@923001234567" (real tag).
 * Otherwise we emit the person's name, which reads naturally and never
 * exposes a meaningless LID.
 */
function mentionToken(jid, name) {
  const phone = toPhoneJid(jid);
  if (phone) return '@' + digits(phone);
  return '@' + displayName(jid, name);
}

/**
 * Build a `mentions` array containing only JIDs WhatsApp can actually tag.
 * LIDs are dropped unless nothing else is available, because tagging a LID
 * renders as a broken mention on most clients.
 */
function mentionsFor(...jids) {
  const out = [];
  for (const jid of jids) {
    if (!jid) continue;
    const phone = toPhoneJid(jid);
    const value = phone || (String(jid).includes('@') ? jid : null);
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

module.exports = {
  digits,
  looksLikeLid,
  toPhoneJid,
  displayName,
  mentionToken,
  mentionsFor
};
