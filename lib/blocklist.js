const fs = require('fs');
const path = require('path');

// Persistent bot-level blocklist.
// WhatsApp's native block (sock.updateBlockStatus) only stops the *account*
// from receiving messages; it silently fails for LID-addressed contacts and
// does nothing for group participants. This module gives .block / .unblock a
// guaranteed effect: blocked senders are ignored before any handler runs.
const FILE = (() => {
  if (process.env.BLOCKLIST_FILE) return process.env.BLOCKLIST_FILE;
  const volumeDir = path.join(__dirname, '..', 'session');
  try {
    if (fs.existsSync(volumeDir) && fs.statSync(volumeDir).isDirectory()) {
      return path.join(volumeDir, 'blocklist.json');
    }
  } catch (_) {}
  return path.join(__dirname, '..', 'data', 'blocklist.json');
})();

const digits = (v) => String(v || '').replace(/[^0-9]/g, '');

// Normalise a phone number so that 03001234567, 923001234567, +92 300 1234567
// and 3001234567 all resolve to the same key. LIDs (15+ digits) are kept as-is.
function normalize(v) {
  let d = digits(v);
  if (!d) return '';
  if (d.length >= 15) return d;            // LID — leave untouched
  if (d.startsWith('0092')) d = d.slice(2); // 0092... -> 92...
  if (d.startsWith('0') && d.length === 11) d = '92' + d.slice(1);
  if (d.length === 10 && d.startsWith('3')) d = '92' + d;
  return d;
}

let blocked = new Set();
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) blocked = new Set(arr.map(normalize).filter(Boolean));
  } catch (_) { /* first run */ }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify([...blocked].sort(), null, 2));
    return true;
  } catch (e) {
    console.log('⚠️  Could not save blocklist:', e.message);
    return false;
  }
}

function isBlocked(jid) {
  load();
  const d = normalize(jid);
  if (!d) return false;
  return blocked.has(d);
}

function add(jid) {
  load();
  const d = normalize(jid);
  if (!d) return false;
  blocked.add(d);
  save();
  return true;
}

function remove(jid) {
  load();
  const d = normalize(jid);
  if (!d) return false;
  const had = blocked.delete(d);
  save();
  return had;
}

function list() {
  load();
  return [...blocked].sort();
}

module.exports = { isBlocked, add, remove, list, normalize, FILE };
