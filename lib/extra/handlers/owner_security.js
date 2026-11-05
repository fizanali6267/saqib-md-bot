/**
 * BOT OWNER CONTROLS (19) + PRIVACY/SECURITY (20) + AUTOMATION (6) + PRIVACY MESSAGE TOOLS (8).
 */

const crypto = require('crypto');
const U = require('../util');

const vaultStore = new Map();
const kvStore = new Map();

/* ---------------- crypto helpers ---------------- */

function aesKey() {
  const secret = String(U.config.SESSION_ID || 'saqib-md-default-secret');
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptText(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `SAQIB1:${Buffer.concat([iv, tag, enc]).toString('base64')}`;
}

function decryptText(payload) {
  const raw = payload.replace(/^SAQIB1:/, '');
  const buf = Buffer.from(raw, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(input) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of input.replace(/=+$/, '').toUpperCase()) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totp(secret, digits = 6, period = 30) {
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / period);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter % 0x100000000, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(code % Math.pow(10, digits)).padStart(digits, '0');
}

const COMMON_PASSWORDS = [
  '123456', 'password', '123456789', '12345678', '12345', 'qwerty', 'abc123', '111111',
  '1234567', 'iloveyou', 'admin', 'welcome', 'monkey', 'letmein', 'dragon', 'football',
  'master', 'sunshine', 'princess', 'password1', 'pakistan', 'saqib', 'hello', 'freedom'
];

function toggle(ctx, key, label) {
  const raw = (U.textOf(ctx) || '').toLowerCase();
  if (!['on', 'off', 'enable', 'disable'].includes(raw)) {
    const state = U.config[key] ? 'ON' : 'OFF';
    return ctx.m.reply(`⚙️ *${label}* is currently *${state}*\n\nUsage: ${ctx.prefix}${ctx.command} on | off`);
  }
  const on = raw === 'on' || raw === 'enable';
  U.config[key] = on;
  try { U.config.persistSettings && U.config.persistSettings(); } catch (_) {}
  return ctx.m.reply(`${on ? '✅' : '🛑'} *${label}* ${on ? 'ENABLED' : 'DISABLED'}.`);
}

const handlers = {
  /* ---------------- OWNER ---------------- */

  async eval(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    const code = U.textOf(ctx) || (ctx.m.quoted && ctx.m.quoted.text) || '';
    if (!code) return U.need(ctx, 'eval <javascript>');
    try {
      // eslint-disable-next-line no-eval
      let result = eval(code);
      if (result && typeof result.then === 'function') result = await result;
      const out = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      await ctx.m.reply(`✅ *Eval result*\n\n\`\`\`\n${String(out).slice(0, 3000)}\n\`\`\``);
    } catch (e) {
      await ctx.m.reply(`❌ ${e.message}`);
    }
  },

  async exec(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    const cmd = U.textOf(ctx) || (ctx.m.quoted && ctx.m.quoted.text) || '';
    if (!cmd) return U.need(ctx, 'exec <shell command>');
    U.cp.exec(cmd, { timeout: 20000, maxBuffer: 1024 * 1024 * 4 }, async (err, stdout, stderr) => {
      const body = `${stdout || ''}${stderr || ''}` || (err ? err.message : '(no output)');
      await ctx.m.reply(`💻 *Exec*\n\n\`\`\`\n${body.slice(0, 3000)}\n\`\`\``).catch(() => null);
    });
  },

  async loadplugin(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    const name = (U.textOf(ctx) || '').replace(/\.js$/, '').trim();
    if (!name) return U.need(ctx, 'loadplugin <file name>');
    try {
      const p = require.resolve(`../../plugins/${name}`);
      delete require.cache[p];
      const mod = require(p);
      await ctx.m.reply(`✅ Plugin *${mod.name || name}* loaded (${(mod.commands || []).length} commands).`);
    } catch (e) {
      await ctx.m.reply(`❌ Load failed: ${e.message}`);
    }
  },

  async unloadplugin(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    const name = (U.textOf(ctx) || '').replace(/\.js$/, '').trim();
    if (!name) return U.need(ctx, 'unloadplugin <file name>');
    const target = `/plugins/${name}.js`;
    let removed = 0;
    for (const k of Object.keys(require.cache)) {
      if (k.includes(target)) { delete require.cache[k]; removed += 1; }
    }
    await ctx.m.reply(removed ? `✅ Plugin *${name}* unloaded.` : `⚠️ Plugin *${name}* was not loaded.`);
  },

  async reload(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    let n = 0;
    for (const k of Object.keys(require.cache)) {
      if (k.includes('/plugins/')) { delete require.cache[k]; n += 1; }
    }
    await ctx.m.reply(`♻️ Reloaded *${n}* plugin modules.`);
  },

  async setprefix(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    const p = (U.textOf(ctx) || '').trim();
    if (!p || p.length > 3) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}setprefix <new prefix>`);
    U.config.PREFIX = p;
    try { U.config.persistSettings && U.config.persistSettings(); } catch (_) {}
    await ctx.m.reply(`✅ Prefix changed to *${p}*`);
  },

  async setbotname(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    const n = U.textOf(ctx);
    if (!n) return U.need(ctx, 'setbotname <name>');
    U.config.BOT_NAME = n.slice(0, 40);
    try { U.config.persistSettings && U.config.persistSettings(); } catch (_) {}
    await ctx.m.reply(`✅ Bot name set to *${U.config.BOT_NAME}*`);
  },

  async setbio(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    const b = U.textOf(ctx);
    if (!b) return U.need(ctx, 'setbio <text>');
    try {
      await ctx.sock.updateProfileStatus(b.slice(0, 139));
      await ctx.m.reply('✅ Bio updated.');
    } catch (e) {
      await ctx.m.reply(`❌ Bio update failed: ${e.message}`);
    }
  },

  async maintenance(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    const raw = (U.textOf(ctx) || '').toLowerCase();
    if (!['on', 'off'].includes(raw)) return ctx.m.reply(`⚙️ Maintenance: *${U.config.MAINTENANCE ? 'ON' : 'OFF'}*\nUsage: ${ctx.prefix}maintenance on|off`);
    U.config.MAINTENANCE = raw === 'on';
    try { U.config.persistSettings && U.config.persistSettings(); } catch (_) {}
    await ctx.m.reply(`🛠️ Maintenance mode ${raw === 'on' ? 'ENABLED' : 'DISABLED'}.`);
  },

  async leavegroup(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    const jid = U.textOf(ctx).trim() || (U.isGroup(ctx) ? ctx.m.chat : '');
    if (!jid) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}leavegroup <group jid>`);
    try {
      await ctx.sock.groupLeave(jid);
      await ctx.m.reply('✅ Left the group.');
    } catch (e) {
      await ctx.m.reply(`❌ Failed: ${e.message}`);
    }
  },

  async joinlink(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    const link = U.textOf(ctx);
    const m = /chat\.whatsapp\.com\/([A-Za-z0-9]+)/.exec(link || '');
    if (!m) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}joinlink https://chat.whatsapp.com/<code>`);
    try {
      await ctx.sock.groupAcceptInvite(m[1]);
      await ctx.m.reply('✅ Joined the group.');
    } catch (e) {
      await ctx.m.reply(`❌ Join failed: ${e.message}`);
    }
  },

  async blockuser(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    const target = ctx.m.mentionedJid[0] || (ctx.m.quoted && ctx.m.quoted.sender) || (U.textOf(ctx).replace(/[^0-9]/g, '') ? `${U.textOf(ctx).replace(/[^0-9]/g, '')}@s.whatsapp.net` : null);
    if (!target) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}blockuser <number|@mention>`);
    try { await ctx.sock.updateBlockStatus(target, 'block'); await ctx.m.reply(`🚫 Blocked ${target.split('@')[0]}`); }
    catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async unblockuser(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    const target = ctx.m.mentionedJid[0] || (ctx.m.quoted && ctx.m.quoted.sender) || (U.textOf(ctx).replace(/[^0-9]/g, '') ? `${U.textOf(ctx).replace(/[^0-9]/g, '')}@s.whatsapp.net` : null);
    if (!target) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}unblockuser <number|@mention>`);
    try { await ctx.sock.updateBlockStatus(target, 'unblock'); await ctx.m.reply(`✅ Unblocked ${target.split('@')[0]}`); }
    catch (e) { await ctx.m.reply(`❌ ${e.message}`); }
  },

  async stats(ctx) {
    const mem = process.memoryUsage();
    const mongoose = require('mongoose');
    await ctx.m.reply(U.box('📊 BOT STATS', [
      `Uptime: ${Math.floor(process.uptime() / 60)} minutes`,
      `Heap: ${(mem.heapUsed / 1048576).toFixed(1)} MB`,
      `DB: ${mongoose.connection.readyState === 1 ? 'connected' : 'offline'}`,
      `Plugins: ${U.fs.readdirSync(U.path.join(__dirname, '../../plugins')).filter((f) => f.endsWith('.js')).length}`,
      `Errors: ${(global.__SAQIB_ERRORS || []).length}`,
      `Node: ${process.version}`
    ]));
  },

  async setavatar(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    const media = await U.needMedia(ctx);
    if (!media) return;
    try {
      await ctx.sock.updateProfilePicture(ctx.sock.user.id, media.buffer);
      await ctx.m.reply('✅ Bot avatar updated.');
    } catch (e) {
      await ctx.m.reply(`❌ ${e.message}`);
    }
  },

  async backup(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    const data = {
      exportedAt: new Date().toISOString(),
      settings: {
        PREFIX: U.config.PREFIX,
        WORK_TYPE: U.config.WORK_TYPE,
        BOT_NAME: U.config.BOT_NAME,
        OWNER_NUMBER: U.config.OWNER_NUMBER
      },
      note: 'Secrets are intentionally excluded from this backup.'
    };
    await ctx.sock.sendMessage(ctx.m.chat, {
      document: Buffer.from(JSON.stringify(data, null, 2)),
      fileName: `saqib-md-backup-${Date.now()}.json`,
      mimetype: 'application/json',
      caption: '💾 *Backup created* (no secrets included).'
    }, { quoted: ctx.m });
  },

  async restore(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    const media = await U.needMedia(ctx);
    if (!media) return;
    try {
      const data = JSON.parse(media.buffer.toString('utf8'));
      if (data.settings) {
        Object.assign(U.config, data.settings);
        try { U.config.persistSettings && U.config.persistSettings(); } catch (_) {}
      }
      await ctx.m.reply('✅ Backup restored.');
    } catch (e) {
      await ctx.m.reply(`❌ Restore failed: ${e.message}`);
    }
  },

  async shutdown(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    await ctx.m.reply('🔌 *Shutting down...*');
    setTimeout(() => process.exit(0), 1000);
  },

  async update(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    await ctx.m.reply('🔄 *Update*\n\nRailway par naya commit push karein — bot automatically redeploy ho jayega.\nYa Railway dashboard → Deployments → Redeploy.');
  },

  /* ---------------- SECURITY / PRIVACY ---------------- */

  async encrypt(ctx) {
    const t = U.textOf(ctx);
    if (!t) return U.need(ctx, 'encrypt <text>');
    await ctx.m.reply(`🔐 *Encrypted (AES-256-GCM)*\n\n\`${encryptText(t)}\`\n\n_Isay decrypt karne ke liye ${ctx.prefix}decrypt use karein._`);
  },

  async decrypt(ctx) {
    const t = U.textOf(ctx);
    if (!t) return U.need(ctx, 'decrypt <payload>');
    try { await ctx.m.reply(`🔓 *Decrypted*\n\n${decryptText(t)}`); }
    catch (e) { await ctx.m.reply(`❌ Decryption failed — invalid payload or different session key.`); }
  },

  async passgen(ctx) {
    const len = Math.min(128, Math.max(6, Number(U.textOf(ctx)) || 16));
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
    let out = '';
    for (let i = 0; i < len; i += 1) out += chars[crypto.randomInt(chars.length)];
    await ctx.m.reply(`🔑 *Generated password (${len})*\n\n\`${out}\``);
  },

  async hashcrack(ctx) {
    const t = (U.textOf(ctx) || '').trim();
    if (!t) return U.need(ctx, 'hashcrack <hash>');
    const algos = t.length === 32 ? ['md5'] : t.length === 40 ? ['sha1'] : t.length === 64 ? ['sha256'] : ['md5', 'sha1', 'sha256'];
    for (const algo of algos) {
      for (const pw of COMMON_PASSWORDS) {
        if (crypto.createHash(algo).update(pw).digest('hex') === t.toLowerCase()) {
          return ctx.m.reply(`🔓 *Cracked!*\n\nHash: \`${t}\`\nAlgorithm: ${algo}\nPassword: *${pw}*`);
        }
      }
    }
    await ctx.m.reply('❌ Not found in the built-in common-password list.\n\n_Yeh sirf ek chhoti dictionary check hai — professional cracking nahi._');
  },

  async stegano(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    const msg = U.textOf(ctx);
    if (!msg) return ctx.m.reply(`⚠️ Usage: reply to an image with ${ctx.prefix}stegano <secret text>`);
    const out = Buffer.concat([media.buffer, Buffer.from(`\n<<SAQIBSTEGO:${Buffer.from(msg).toString('base64')}>>`)]);
    await ctx.sock.sendMessage(ctx.m.chat, { image: out, caption: '🕵️ Secret embedded. Use .desteg to extract.' }, { quoted: ctx.m });
  },

  async desteg(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    const s = media.buffer.toString('latin1');
    const m = /<<SAQIBSTEGO:([A-Za-z0-9+/=]+)>>/.exec(s);
    if (!m) return ctx.m.reply('❌ No hidden message found in this file.');
    await ctx.m.reply(`🕵️ *Hidden message*\n\n${Buffer.from(m[1], 'base64').toString('utf8')}`);
  },

  async '2fa'(ctx) {
    const secret = (U.textOf(ctx) || '').replace(/\s/g, '').toUpperCase();
    if (!secret) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}2fa <base32 secret>\n\nYeh aapke authenticator app ka secret hai.`);
    try {
      const code = totp(secret);
      const left = 30 - (Math.floor(Date.now() / 1000) % 30);
      await ctx.m.reply(`🔐 *2FA Code*\n\n\`${code}\`\n⏳ Valid for ${left}s`);
    } catch (e) {
      await ctx.m.reply(`❌ Invalid secret: ${e.message}`);
    }
  },

  async keyval(ctx) {
    const raw = U.textOf(ctx);
    const [op, key, ...rest] = raw.split(/\s+/);
    if (!op) return ctx.m.reply(`⚙️ Usage:\n${ctx.prefix}keyval set <key> <value>\n${ctx.prefix}keyval get <key>\n${ctx.prefix}keyval list\n${ctx.prefix}keyval del <key>`);
    if (op === 'set' && key) { kvStore.set(key, rest.join(' ')); return ctx.m.reply(`✅ Saved *${key}*.`); }
    if (op === 'get' && key) return ctx.m.reply(kvStore.has(key) ? `🔑 *${key}* = ${kvStore.get(key)}` : '❌ Key not found.');
    if (op === 'del' && key) { kvStore.delete(key); return ctx.m.reply(`🗑️ Deleted *${key}*.`); }
    if (op === 'list') return ctx.m.reply(kvStore.size ? `🔑 *Keys*\n\n${[...kvStore.keys()].map((k) => `• ${k}`).join('\n')}` : '📭 No keys stored.');
    await ctx.m.reply('❌ Unknown operation.');
  },

  async vulnerability(ctx) {
    const q = U.textOf(ctx) || (ctx.m.quoted && ctx.m.quoted.text) || '';
    if (!q) return U.need(ctx, 'vulnerability <code or url>');
    await U.aiReply(ctx, q, 'Perform a security review. List vulnerabilities by severity (Critical/High/Medium/Low) with CWE references and concrete fixes. Add a disclaimer that this is a static review, not a penetration test.');
  },

  async leakedpass(ctx) {
    const pw = U.textOf(ctx);
    if (!pw) return U.need(ctx, 'leakedpass <password>');
    try {
      const hash = crypto.createHash('sha1').update(pw).digest('hex').toUpperCase();
      const prefix = hash.slice(0, 5);
      const suffix = hash.slice(5);
      const body = await U.getText(`https://api.pwnedpasswords.com/range/${prefix}`, { headers: { 'Add-Padding': 'true' } });
      const hit = body.split('\n').map((l) => l.split(':')).find(([s]) => s && s.trim() === suffix);
      if (hit) return ctx.m.reply(`⚠️ *PASSWORD LEAKED*\n\nYeh password *${Number(hit[1])}* baar data breaches mein mila hai.\n\n🔴 Isay foran change karein!`);
      await ctx.m.reply('✅ *Good news* — yeh password known breach databases mein nahi mila.\n\n_(HIBP k-anonymity API — password kabhi transmit nahi hua.)_');
    } catch (e) {
      await ctx.m.reply(`❌ Breach check failed: ${e.message}`);
    }
  },

  async shred(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    await ctx.m.reply('🗑️ *Shred*\n\nContainer filesystem ephemeral hai — Railway redeploy par sab clear ho jata hai.\nAgar specific file delete karni hai to `.exec rm -f <path>` use karein.');
  },

  async tempalias(ctx) {
    try {
      const d = await U.getJson('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1');
      const email = Array.isArray(d) ? d[0] : d;
      await ctx.m.reply(`📧 *Temporary email*\n\n\`${email}\`\n\nInbox check: ${ctx.prefix}checkmail ${email}`);
    } catch (e) {
      await ctx.m.reply(`❌ Alias service unavailable: ${e.message}`);
    }
  },

  async selfdestruct(ctx) {
    const raw = U.textOf(ctx);
    const [secs, ...rest] = raw.split(/\s+/);
    const delay = Math.min(300, Math.max(3, Number(secs) || 10));
    const msg = rest.join(' ') || '💥 This message will self-destruct.';
    const sent = await ctx.sock.sendMessage(ctx.m.chat, { text: `💥 ${msg}\n\n_Deletes in ${delay}s_` });
    setTimeout(async () => {
      try { await ctx.sock.sendMessage(ctx.m.chat, { delete: sent.key }); } catch (_) {}
    }, delay * 1000);
  },

  async incognito(ctx) {
    const raw = (U.textOf(ctx) || '').toLowerCase();
    if (!['on', 'off'].includes(raw)) return ctx.m.reply(`🕶️ Incognito: *${U.config.INCOGNITO ? 'ON' : 'OFF'}*\nUsage: ${ctx.prefix}incognito on|off`);
    U.config.INCOGNITO = raw === 'on';
    await ctx.m.reply(`🕶️ Incognito mode ${raw === 'on' ? 'ON — read receipts suppressed where possible.' : 'OFF'}`);
  },

  async sanitize(ctx) {
    const t = U.textOf(ctx) || (ctx.m.quoted && ctx.m.quoted.text) || '';
    if (!t) return U.need(ctx, 'sanitize <text>');
    const out = t
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
      .replace(/\+?\d[\d\s\-()]{7,}\d/g, '[phone]')
      .replace(/https?:\/\/\S+/g, '[link]')
      .replace(/\b\d{4,}\b/g, '[number]');
    await ctx.m.reply(`🧼 *Sanitized*\n\n${out}`);
  },

  async rot13(ctx) {
    const t = await U.need(ctx, 'rot13 <text>');
    if (!t) return;
    await ctx.m.reply(`🔄 *ROT13*\n\n${t.replace(/[a-zA-Z]/g, (c) => String.fromCharCode((c <= 'Z' ? 90 : 122) >= c.charCodeAt(0) + 13 ? c.charCodeAt(0) + 13 : c.charCodeAt(0) - 13))}`);
  },

  async ipinfo(ctx) {
    const ip = (U.textOf(ctx) || '').trim();
    try {
      const d = await U.getJson(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { timeout: 12000 });
      if (d.error) return ctx.m.reply(`❌ ${d.reason || 'Lookup failed'}`);
      await ctx.m.reply(U.box(`🌍 ${d.ip}`, [
        `City: ${d.city || '—'}, ${d.region || ''}`,
        `Country: ${d.country_name || '—'} (${d.country_code || '—'})`,
        `ISP: ${d.org || '—'}`,
        `ASN: ${d.asn || '—'}`,
        `Timezone: ${d.timezone || '—'}`,
        `Lat/Lon: ${d.latitude}, ${d.longitude}`
      ]));
    } catch (e) {
      await ctx.m.reply(`❌ IP lookup failed: ${e.message}`);
    }
  },

  async vpncheck(ctx) {
    const ip = (U.textOf(ctx) || '').trim();
    try {
      const d = await U.getJson(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { timeout: 12000 });
      if (d.error) return ctx.m.reply(`❌ ${d.reason || 'Lookup failed'}`);
      const suspicious = /vpn|proxy|hosting|datacenter|cloud|server/i.test(d.org || '');
      await ctx.m.reply(U.box('🛡️ VPN / PROXY CHECK', [
        `IP: ${d.ip}`,
        `Org: ${d.org || '—'}`,
        `Country: ${d.country_name || '—'}`,
        `${suspicious ? '⚠️ Likely VPN/proxy/datacenter' : '✅ Looks like a residential ISP'}`
      ]));
    } catch (e) {
      await ctx.m.reply(`❌ Check failed: ${e.message}`);
    }
  },

  async privacypolicy(ctx) {
    await ctx.m.reply(
      `🔒 *PRIVACY POLICY — ${U.config.BOT_NAME}*\n\n` +
      `• Messages are processed in memory only to execute commands.\n` +
      `• Anti-delete / view-once features store media temporarily and expire automatically.\n` +
      `• No message content is sold or shared with third parties.\n` +
      `• AI commands send your prompt to Google Gemini for processing.\n` +
      `• Session credentials are stored in your own MongoDB / Railway volume.\n\n` +
      `_Owner: ${U.config.OWNER_NAME}_`
    );
  },

  async clearlogs(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    global.__SAQIB_ERRORS = [];
    await ctx.m.reply('🧹 Error log cleared.');
  },

  /* ---------------- AUTOMATION TOGGLES ---------------- */

  antivirtex: (ctx) => toggle(ctx, 'ANTI_VIRTEX', 'Anti-VirusTotal link scanner'),
  antiabusive: (ctx) => toggle(ctx, 'ANTI_ABUSIVE', 'Anti-Abusive language filter'),
  autosticker: (ctx) => toggle(ctx, 'AUTO_STICKER', 'Auto sticker maker'),
  autodownload: (ctx) => toggle(ctx, 'AUTO_DOWNLOAD', 'Auto media downloader'),
  antiforeign: (ctx) => toggle(ctx, 'ANTI_FOREIGN', 'Anti-Foreign number filter'),
  autobackup: (ctx) => toggle(ctx, 'AUTO_BACKUP', 'Auto backup'),

  /* ---------------- PRIVACY MESSAGE TOOLS ---------------- */

  async incognitomsg(ctx) {
    const t = U.textOf(ctx);
    if (!t) return U.need(ctx, 'incognitomsg <text>');
    await ctx.sock.sendMessage(ctx.m.chat, { text: t, contextInfo: { forwardingScore: 0, isForwarded: false } });
    try { await ctx.sock.sendMessage(ctx.m.chat, { delete: ctx.m.key }); } catch (_) {}
  },

  async anonymize(ctx) {
    const t = U.textOf(ctx) || (ctx.m.quoted && ctx.m.quoted.text) || '';
    if (!t) return U.need(ctx, 'anonymize <text>');
    const out = t.replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, '[name]').replace(/@\d+/g, '@[user]');
    await ctx.m.reply(`🕵️ *Anonymized*\n\n${out}`);
  },

  async spoiler(ctx) {
    const t = U.textOf(ctx);
    if (!t) return U.need(ctx, 'spoiler <text>');
    await ctx.m.reply(`||${t}||`);
  },

  async ghostread(ctx) {
    const raw = (U.textOf(ctx) || '').toLowerCase();
    if (!['on', 'off'].includes(raw)) return ctx.m.reply(`👻 Ghost read: *${U.config.AUTO_READ ? 'OFF' : 'ON'}*\nUsage: ${ctx.prefix}ghostread on|off`);
    U.config.AUTO_READ = raw === 'off';
    try { U.config.persistSettings && U.config.persistSettings(); } catch (_) {}
    await ctx.m.reply(`👻 Ghost read ${raw === 'on' ? 'ON — messages read without blue ticks.' : 'OFF'}`);
  },

  async nuke(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    await ctx.m.reply('☢️ *Nuke*\n\nSafety: bulk chat deletion WhatsApp API se possible nahi.\nUse `.purge <count>` in groups (admin) to clear recent bot messages.');
  },

  async pinprivate(ctx) {
    await ctx.m.reply('📌 WhatsApp private chats mein pin API available nahi. Aap manually chat long-press karke pin kar sakte hain.');
  },

  async vault(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    const raw = U.textOf(ctx);
    const [op, key, ...rest] = raw.split(/\s+/);
    if (!op) return ctx.m.reply(`🔐 *Vault*\n\n${ctx.prefix}vault set <key> <secret>\n${ctx.prefix}vault get <key>\n${ctx.prefix}vault list\n${ctx.prefix}vault del <key>`);
    if (op === 'set' && key) { vaultStore.set(key, encryptText(rest.join(' '))); return ctx.m.reply(`✅ Secret *${key}* stored encrypted.`); }
    if (op === 'get' && key) {
      if (!vaultStore.has(key)) return ctx.m.reply('❌ Not found.');
      try { return ctx.m.reply(`🔓 *${key}* = ${decryptText(vaultStore.get(key))}`); }
      catch (_) { return ctx.m.reply('❌ Decrypt failed.'); }
    }
    if (op === 'del' && key) { vaultStore.delete(key); return ctx.m.reply(`🗑️ Deleted *${key}*.`); }
    if (op === 'list') return ctx.m.reply(vaultStore.size ? `🔐 *Vault keys*\n\n${[...vaultStore.keys()].map((k) => `• ${k}`).join('\n')}` : '📭 Vault empty.');
    await ctx.m.reply('❌ Unknown operation.');
  },

  async logcleaner(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    global.__SAQIB_ERRORS = [];
    const dir = U.path.join(U.os.tmpdir(), 'saqib-md');
    let n = 0;
    try {
      for (const f of U.fs.readdirSync(dir)) {
        if (Date.now() - U.fs.statSync(U.path.join(dir, f)).mtimeMs > 3600000) { U.fs.unlinkSync(U.path.join(dir, f)); n += 1; }
      }
    } catch (_) {}
    await ctx.m.reply(`🧹 Cleaned *${n}* temp files and cleared error log.`);
  }
};

module.exports = { handlers, encryptText, decryptText, totp, vaultStore, kvStore };
