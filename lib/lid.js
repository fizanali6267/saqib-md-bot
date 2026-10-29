/**
 * LID (Linked ID) <-> Phone Number resolver
 * -------------------------------------------------------------------------
 * WhatsApp increasingly addresses chats as `<numericId>@lid` instead of
 * `<phone>@s.whatsapp.net`. Sending a reply to a LID makes the recipient's
 * phone unable to decrypt it, which is exactly the
 *   "Waiting for this message. This may take a while."
 * symptom.
 *
 * Baileys 6.7.x has no built-in `getPNForLID()`, so we build our own map from
 * every place WhatsApp leaks the pair:
 *   - contacts.upsert / contacts.update   (id + lid)
 *   - messaging-history.set               (contacts)
 *   - groups.upsert / group-participants  (participant id + lid/phoneNumber)
 *   - onWhatsApp() probing as a last resort
 *
 * The map is cached in RAM and persisted to data/lidmap.json so it survives
 * restarts.
 */

const fs = require('fs');
const path = require('path');

const MAP_FILE = path.join(__dirname, '..', 'data', 'lidmap.json');
const MAX_ENTRIES = 5000;

const lidToPn = new Map(); // '215753789857825' -> '923067846267'
const pnToLid = new Map(); // '923067846267'    -> '215753789857825'

const norm = (j) => String(j || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
const isLid = (j) => typeof j === 'string' && j.endsWith('@lid');

let dirty = false;

const addPair = (lidJid, pnJid) => {
  const lid = norm(lidJid);
  const pn = norm(pnJid);
  if (!lid || !pn || lid === pn) return false;
  if (lidToPn.get(lid) === pn) return false;
  lidToPn.set(lid, pn);
  pnToLid.set(pn, lid);
  if (lidToPn.size > MAX_ENTRIES) {
    const oldest = lidToPn.keys().next().value;
    const oldPn = lidToPn.get(oldest);
    lidToPn.delete(oldest);
    if (oldPn) pnToLid.delete(oldPn);
  }
  dirty = true;
  return true;
};

// Accepts any contact-like object Baileys may hand us.
const learnFromContact = (c) => {
  if (!c) return;
  const id = c.id || c.jid;
  const lid = c.lid || c.lidJid;
  const pn = c.phoneNumber || c.pn || c.pnJid;
  if (id && lid) addPair(lid, id);
  if (id && pn) addPair(id, pn);
  if (lid && pn) addPair(lid, pn);
};

const learnFromParticipants = (participants) => {
  if (!Array.isArray(participants)) return;
  for (const p of participants) learnFromContact(p);
};

/** Returns the phone-number JID for a LID, or null if unknown. */
const resolve = (jid) => {
  if (!jid) return null;
  if (!isLid(jid)) return jid;
  const pn = lidToPn.get(norm(jid));
  return pn ? `${pn}@s.whatsapp.net` : null;
};

/** Reverse lookup, occasionally useful for group admin checks. */
const toLid = (jid) => {
  if (!jid) return null;
  if (isLid(jid)) return jid;
  const lid = pnToLid.get(norm(jid));
  return lid ? `${lid}@lid` : null;
};

/** Last-resort network probe. Returns a PN JID or null. */
const probe = async (sock, lidJid) => {
  const known = resolve(lidJid);
  if (known) return known;
  try {
    const res = await sock.onWhatsApp(lidJid);
    const hit = Array.isArray(res) ? res.find((r) => r && r.exists !== false) : null;
    if (hit?.jid && !isLid(hit.jid)) {
      addPair(lidJid, hit.jid);
      return hit.jid;
    }
  } catch (_) {}
  return null;
};

/** Wire the resolver into a live socket. Safe to call once per connection. */
const bind = (sock) => {
  const onContacts = (list) => {
    if (Array.isArray(list)) list.forEach(learnFromContact);
    else if (list && typeof list === 'object') Object.values(list).forEach(learnFromContact);
  };

  try { sock.ev.on('contacts.upsert', onContacts); } catch (_) {}
  try { sock.ev.on('contacts.update', onContacts); } catch (_) {}
  try { sock.ev.on('contacts.set', (x) => onContacts(x?.contacts)); } catch (_) {}
  try {
    sock.ev.on('messaging-history.set', (x) => onContacts(x?.contacts));
  } catch (_) {}
  try {
    sock.ev.on('groups.upsert', (groups) => {
      for (const g of groups || []) learnFromParticipants(g?.participants);
    });
  } catch (_) {}
  try {
    sock.ev.on('groups.update', (groups) => {
      for (const g of groups || []) learnFromParticipants(g?.participants);
    });
  } catch (_) {}
  try {
    sock.ev.on('group-participants.update', (u) => learnFromParticipants(u?.participants));
  } catch (_) {}

  // Periodic persist (only when something actually changed)
  const timer = setInterval(() => { if (dirty) save(); }, 60 * 1000);
  if (timer.unref) timer.unref();
};

const load = () => {
  try {
    const raw = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
    for (const [lid, pn] of Object.entries(raw || {})) addPair(lid, pn);
    dirty = false;
    if (lidToPn.size) console.log(`🔗 Loaded ${lidToPn.size} LID→phone mappings`);
  } catch (_) {}
};

const save = () => {
  try {
    fs.mkdirSync(path.dirname(MAP_FILE), { recursive: true });
    const out = {};
    for (const [lid, pn] of lidToPn) out[lid] = pn;
    fs.writeFileSync(MAP_FILE, JSON.stringify(out));
    dirty = false;
  } catch (_) {}
};

load();

module.exports = { addPair, learnFromContact, learnFromParticipants, resolve, toLid, probe, bind, save, isLid, size: () => lidToPn.size };
