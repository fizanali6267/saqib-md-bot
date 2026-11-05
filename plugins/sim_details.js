const axios = require('axios');
const config = require('../config');

// ================= API CONFIG =================
const API_URL = 'https://nexgen-tech-sim-api-v-01.vercel.app/api/search?number=';
// ==============================================

const LINE = '━━━━━━━━━━━━━━━━━━━━━';

const clean = (v) => {
  if (v === undefined || v === null) return 'N/A';
  const s = String(v).trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'n/a') return 'N/A';
  return s;
};

// Build one record block — same layout as the site's "Copy" output,
// with ROMAN replaced by SAQIB.
function formatRecord(rec, idx) {
  const num = clean(rec.number);
  const name = clean(rec.name);
  const cnic = clean(rec.cnic);
  const address = clean(rec.address);
  const network = clean(rec.network);

  let block = '';
  if (idx !== undefined) block += `📋 *RECORD #${idx + 1}*\n`;
  block += `${LINE}\n`;
  block += `⚡ *SAQIB SIM DATABASE*\n`;
  block += `${LINE}\n`;
  block += `📱 *Number*  : ${num}\n`;
  block += `🆔 *CNIC*    : ${cnic}\n`;
  block += `👤 *Name*    : ${name}\n`;
  if (network !== 'N/A') block += `📶 *Network* : ${network}\n`;
  block += `📍 *Address* : ${address}\n`;
  block += `${LINE}`;
  return block;
}

module.exports = {
  name: 'sim_details',
  commands: ['simdetails', 'sim', 'simdata', 'siminfo', 'simdb', 'cnicinfo'],
  execute: async (sock, m, { command, args, prefix }) => {
    let query = (args.join(' ') || '').trim();

    // Allow replying to a message that contains the number/CNIC
    if (!query && m.quoted) {
      const qt = (m.quoted.text || m.quoted.body || '').toString();
      const match = qt.match(/\d{11,13}/);
      if (match) query = match[0];
    }

    if (!query) {
      return m.reply(
        `❓ *SIM Details Lookup*\n\n` +
        `Usage: *${prefix}simdetails 03XXXXXXXXX*\n` +
        `   or: *${prefix}simdetails 35202XXXXXXXXX* (13-digit CNIC)\n\n` +
        `Example: *${prefix}simdetails 03001234567*`
      );
    }

    // Strip non-digits (spaces, dashes, +92 etc.)
    const digits = query.replace(/[^0-9]/g, '');

    if (digits.length !== 11 && digits.length !== 13) {
      return m.reply(
        `❌ *Invalid input.*\n\n` +
        `Please enter a valid *11-digit mobile number* (03XXXXXXXXX) ` +
        `or *13-digit CNIC* (without dashes).`
      );
    }

    // Auto-format local 0-prefixed number to 92 format (same as the site)
    let apiQuery = digits;
    if (digits.startsWith('0')) {
      apiQuery = '92' + digits.substring(1);
    }

    try { await m.react('🔍'); } catch (_) {}
    await m.reply('⏳ *Fetching SIM data, please wait...*');

    try {
      const res = await axios.get(API_URL + encodeURIComponent(apiQuery), {
        timeout: 30000,
        headers: { 'User-Agent': 'Mozilla/5.0 (SAQIB-MD)' }
      });

      const json = res.data || {};
      const result = json.result || {};
      const simData = Array.isArray(result.sim_data) ? result.sim_data : [];
      const truecallerData = Array.isArray(result.truecaller_data) ? result.truecaller_data : [];

      if (json.status !== 'success') {
        throw new Error(json.message || 'Invalid response from server');
      }

      if (simData.length === 0) {
        // No SIM record — but Truecaller may still have a name.
        if (truecallerData.length > 0) {
          const tc = truecallerData[0];
          const msg =
            `${LINE}\n⚡ *SAQIB SIM DATABASE*\n${LINE}\n` +
            `📱 *Number*  : ${clean(tc.number || apiQuery)}\n` +
            `👤 *Name*    : ${clean(tc.name)}\n` +
            `🆔 *CNIC*    : N/A\n` +
            `📍 *Address* : N/A\n${LINE}\n\n` +
            `ℹ️ _Only Truecaller name found, no SIM record available._`;
          await m.reply(msg);
          try { await m.react('✅'); } catch (_) {}
          return;
        }

        await m.reply(
          `🔎 *No Data Found*\n\n` +
          `No record found for *${digits}*.\n` +
          `Try a different number or CNIC.`
        );
        try { await m.react('❌'); } catch (_) {}
        return;
      }

      // Merge Truecaller name where SIM name is missing (same as the site)
      simData.forEach((rec) => {
        const tc = truecallerData.find(
          (t) => String(t.number).replace(/[^0-9]/g, '') === String(rec.number).replace(/[^0-9]/g, '')
        );
        if (tc && tc.name && (!rec.name || rec.name === 'N/A' || String(rec.name).trim() === '')) {
          rec.name = tc.name;
        }
      });

      const header =
        `${LINE}\n` +
        `   ⚡ *SAQIB SIM DATABASES* ⚡\n` +
        `${LINE}\n` +
        `🔍 *Search:* ${digits}\n` +
        `📊 *Records Found:* ${simData.length}\n` +
        `${LINE}\n\n`;

      const body = simData.map((rec, i) => formatRecord(rec, i)).join('\n\n');

      const ownerNum = config.OWNER_NUMBER || '923106762478';
      const footer =
        `\n\n${LINE}\n` +
        `👑 *Owner:* ${config.OWNER_NAME || 'Saqib Iqbal'}\n` +
        `📞 *Contact:* wa.me/${ownerNum}\n` +
        `${LINE}\n` +
        `✅ _Via SAQIB SIM DATABASES_`;

      let full = header + body + footer;

      // WhatsApp text limit ~65536; split safely if huge
      if (full.length > 60000) {
        const chunks = [];
        let current = header;
        for (const rec of simData) {
          const block = formatRecord(rec, simData.indexOf(rec)) + '\n\n';
          if ((current + block).length > 55000) {
            chunks.push(current);
            current = '';
          }
          current += block;
        }
        if (current) chunks.push(current);
        chunks[chunks.length - 1] += footer;

        for (const chunk of chunks) {
          await m.reply(chunk);
        }
      } else {
        await m.reply(full);
      }

      try { await m.react('✅'); } catch (_) {}
    } catch (e) {
      console.error('simdetails error:', e?.message || e);
      try { await m.react('❌'); } catch (_) {}
      await m.reply(
        `⚠️ *Server is busy or API limit reached.*\n` +
        `Please try again in a moment.`
      );
    }
  }
};
