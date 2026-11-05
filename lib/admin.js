'use strict';
/**
 * lib/admin.js — group participant / admin detection that survives LID groups.
 *
 * WhatsApp now runs many groups in "lid" addressing mode: `participants[]`
 * entries carry `<15-digit>@lid` ids while `sock.user.id` is a phone number.
 * A naive `participants.find(p => p.id === botId)` therefore returns undefined
 * and every admin command wrongly says "make me admin".
 *
 * This helper matches a participant against ANY of the identifiers we have:
 *   p.id, p.jid, p.lid, p.phoneNumber, p.pn, p.whatsappId
 * plus a digit-normalised comparison through the LID map.
 */

let lid = null;
try {
  // eslint-disable-next-line global-require
  lid = require('./lid');
} catch (_) {
  lid = null;
}

const digits = (v) => String(v || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');

/** Expand one identifier into every equivalent form we can derive. */
function variants(jid) {
  const out = new Set();
  if (!jid) return out;
  const raw = String(jid).trim();
  if (!raw) return out;
  out.add(raw);
  const d = digits(raw);
  if (d) {
    out.add(d);
    if (d.length >= 8 && d.length <= 14) {
      out.add(`${d}@s.whatsapp.net`);
      out.add(`${d}@c.us`);
    }
  }
  if (lid) {
    try {
      const pn = lid.resolve(raw);
      if (pn) {
        out.add(pn);
        out.add(digits(pn));
      }
      const asLid = lid.toLid ? lid.toLid(raw) : null;
      if (asLid) out.add(asLid);
    } catch (_) {}
  }
  return out;
}

/** Every identifier a participant object exposes. */
function participantIds(p) {
  if (!p) return [];
  return [p.id, p.jid, p.lid, p.phoneNumber, p.pn, p.whatsappId, p.userJid].filter(Boolean);
}

/** True when participant `p` refers to `jid`. */
function matches(p, jid) {
  const want = variants(jid);
  if (!want.size) return false;
  for (const id of participantIds(p)) {
    for (const v of variants(id)) {
      if (want.has(v)) return true;
    }
  }
  return false;
}

/** Find the participant entry for `jid` (or null). */
function findParticipant(participants, jid) {
  if (!Array.isArray(participants) || !jid) return null;
  for (const p of participants) if (matches(p, jid)) return p;
  return null;
}

/** Is `jid` an admin (or superadmin) in this participant list? */
function isAdmin(participants, jid) {
  const p = findParticipant(participants, jid);
  return !!(p && p.admin);
}

/**
 * Convenience: compute both flags for the current message.
 * @returns {{ isBotAdmin: boolean, isSenderAdmin: boolean, botParticipant: object|null, senderParticipant: object|null }}
 */
function flags(participants, sock, m) {
  const botJid = sock?.user?.id || null;
  const botParticipant = findParticipant(participants, botJid);
  const senderJid = m?.sender || m?.key?.participant || null;
  const senderParticipant = findParticipant(participants, senderJid) || findParticipant(participants, m?.senderLid);
  const isBotAdmin = !!(botParticipant && botParticipant.admin);
  const isSenderAdmin = !!(senderParticipant && senderParticipant.admin) || !!(m && m.fromMe);
  return { isBotAdmin, isSenderAdmin, botParticipant, senderParticipant };
}

module.exports = { digits, variants, participantIds, matches, findParticipant, isAdmin, flags };
