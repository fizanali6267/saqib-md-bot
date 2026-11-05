/**
 * DEVELOPER & UTILITY handlers (34 commands).
 * Pure Node implementations — no external binaries required except python3/node.
 */

const crypto = require('crypto');
const net = require('net');
const dns = require('dns').promises;
const tls = require('tls');
const U = require('../util');

function run(cmd, args, input, timeout = 10000) {
  return new Promise((resolve) => {
    const child = U.cp.execFile(cmd, args, { timeout, maxBuffer: 1024 * 1024 * 4 }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || ''), error: err && err.message });
    });
    if (input) {
      child.stdin.end(input);
    }
  });
}

function tcpProbe(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (open) => { try { socket.destroy(); } catch (_) {} resolve(open); };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

function ipToInt(ip) {
  return ip.split('.').reduce((a, o) => ((a << 8) + Number(o)) >>> 0, 0);
}
function intToIp(n) {
  return [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
}

function simpleMarkdownToHtml(md) {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^###### (.*)$/gm, '<h6>$1</h6>')
    .replace(/^##### (.*)$/gm, '<h5>$1</h5>')
    .replace(/^#### (.*)$/gm, '<h4>$1</h4>')
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/^\- (.*)$/gm, '<li>$1</li>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^/, '<p>').replace(/$/, '</p>');
}

function htmlToMarkdown(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<(strong|b)[^>]*>(.*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)[^>]*>(.*?)<\/\1>/gi, '*$2*')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const handlers = {
  async htmlrun(ctx) {
    const code = U.textOf(ctx) || (ctx.m.quoted && ctx.m.quoted.text) || '';
    if (!code) return U.need(ctx, 'htmlrun <html code>');
    const html = /<html/i.test(code) ? code : `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui;padding:24px}</style></head><body>${code}</body></html>`;
    await ctx.sock.sendMessage(ctx.m.chat, {
      document: Buffer.from(html),
      fileName: 'preview.html',
      mimetype: 'text/html',
      caption: '🌐 *HTML preview file* — download aur browser mein kholein.'
    }, { quoted: ctx.m });
  },

  async python(ctx) {
    const code = U.textOf(ctx) || (ctx.m.quoted && ctx.m.quoted.text) || '';
    if (!code) return U.need(ctx, 'python <code>');
    await ctx.m.react('🐍').catch(() => null);
    const out = await run('python3', ['-c', code], null, 12000);
    const body = out.ok ? out.stdout : `${out.stderr || out.error}`;
    await ctx.m.reply(`🐍 *Python output*\n\n\`\`\`\n${(body || '(no output)').slice(0, 3500)}\n\`\`\``);
  },

  async javascript(ctx) {
    const code = U.textOf(ctx) || (ctx.m.quoted && ctx.m.quoted.text) || '';
    if (!code) return U.need(ctx, 'javascript <code>');
    await ctx.m.react('🟨').catch(() => null);
    const out = await run('node', ['-e', code], null, 12000);
    const body = out.ok ? out.stdout : `${out.stderr || out.error}`;
    await ctx.m.reply(`🟨 *JavaScript output*\n\n\`\`\`\n${(body || '(no output)').slice(0, 3500)}\n\`\`\``);
  },

  async jsonvalidate(ctx) {
    const raw = U.textOf(ctx) || (ctx.m.quoted && ctx.m.quoted.text) || '';
    if (!raw) return U.need(ctx, 'jsonvalidate <json>');
    try {
      const parsed = JSON.parse(raw);
      await ctx.m.reply(`✅ *Valid JSON*\n\n\`\`\`json\n${JSON.stringify(parsed, null, 2).slice(0, 3500)}\n\`\`\``);
    } catch (e) {
      await ctx.m.reply(`❌ *Invalid JSON*\n\n${e.message}`);
    }
  },

  async base64enc(ctx) {
    const t = await U.need(ctx, 'base64enc <text>');
    if (!t) return;
    await ctx.m.reply(`🔐 *Base64*\n\n\`${Buffer.from(t).toString('base64')}\``);
  },

  async base64dec(ctx) {
    const t = await U.need(ctx, 'base64dec <base64>');
    if (!t) return;
    try {
      const out = Buffer.from(t, 'base64').toString('utf8');
      await ctx.m.reply(`🔓 *Decoded*\n\n${out}`);
    } catch (e) {
      await ctx.m.reply(`❌ Invalid Base64: ${e.message}`);
    }
  },

  async sha256(ctx) {
    const t = await U.need(ctx, 'sha256 <text>');
    if (!t) return;
    await ctx.m.reply(`🔒 *SHA-256*\n\n\`${crypto.createHash('sha256').update(t).digest('hex')}\``);
  },

  async md5(ctx) {
    const t = await U.need(ctx, 'md5 <text>');
    if (!t) return;
    await ctx.m.reply(`🔒 *MD5*\n\n\`${crypto.createHash('md5').update(t).digest('hex')}\``);
  },

  async gitclone(ctx) {
    const q = await U.need(ctx, 'gitclone <owner/repo>');
    if (!q) return;
    const repo = q.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\s/g, '');
    try {
      const d = await U.getJson(`https://api.github.com/repos/${repo}`);
      await ctx.m.reply(U.box('🐙 GITHUB REPO', [
        `📦 *${d.full_name}*`,
        `📝 ${d.description || 'No description'}`,
        `⭐ Stars: ${d.stargazers_count}  🍴 Forks: ${d.forks_count}`,
        `👀 Watchers: ${d.watchers_count}  🐞 Issues: ${d.open_issues_count}`,
        `💻 Language: ${d.language || '—'}`,
        `📄 License: ${(d.license && d.license.name) || '—'}`,
        `🔗 ${d.html_url}`,
        `📥 Clone: git clone ${d.clone_url}`
      ]));
    } catch (e) {
      await ctx.m.reply(`❌ Repo not found: ${repo}`);
    }
  },

  async npmsearch(ctx) {
    const q = await U.need(ctx, 'npmsearch <package>');
    if (!q) return;
    try {
      const d = await U.getJson(`https://registry.npmjs.org/${encodeURIComponent(q.trim())}`);
      const latest = d['dist-tags'] && d['dist-tags'].latest;
      await ctx.m.reply(U.box('📦 NPM PACKAGE', [
        `📦 *${d.name}*`,
        `📝 ${(d.description || '').slice(0, 300)}`,
        `🏷️ Latest: ${latest}`,
        `📄 License: ${d.license || '—'}`,
        `🔗 https://www.npmjs.com/package/${d.name}`,
        `📥 npm i ${d.name}`
      ]));
    } catch (e) {
      await ctx.m.reply(`❌ NPM package not found: ${q}`);
    }
  },

  async pypisearch(ctx) {
    const q = await U.need(ctx, 'pypisearch <package>');
    if (!q) return;
    try {
      const d = await U.getJson(`https://pypi.org/pypi/${encodeURIComponent(q.trim())}/json`);
      const info = d.info;
      await ctx.m.reply(U.box('🐍 PYPI PACKAGE', [
        `📦 *${info.name}* ${info.version}`,
        `📝 ${(info.summary || '').slice(0, 300)}`,
        `👤 Author: ${info.author || '—'}`,
        `📄 License: ${info.license || '—'}`,
        `🔗 ${info.project_url || info.home_page || 'https://pypi.org/project/' + info.name}`,
        `📥 pip install ${info.name}`
      ]));
    } catch (e) {
      await ctx.m.reply(`❌ PyPI package not found: ${q}`);
    }
  },

  async curl(ctx) {
    const q = await U.need(ctx, 'curl <url>');
    if (!q) return;
    const url = /^https?:\/\//i.test(q) ? q : `https://${q}`;
    try {
      const res = await U.axios.get(url, {
        timeout: 15000, responseType: 'text', transformResponse: [(d) => d],
        headers: { 'User-Agent': 'Mozilla/5.0 (SAQIB-MD)' }, validateStatus: () => true
      });
      const body = String(res.data || '').slice(0, 1200);
      await ctx.m.reply(`🌐 *HTTP ${res.status}*\n🔗 ${url}\n\n\`\`\`\n${body || '(empty)'}\n\`\`\``);
    } catch (e) {
      await ctx.m.reply(`❌ Request failed: ${e.message}`);
    }
  },

  async pinghost(ctx) {
    const host = await U.need(ctx, 'pinghost <host>');
    if (!host) return;
    const target = host.replace(/^https?:\/\//, '').split('/')[0];
    await ctx.m.react('📡').catch(() => null);
    const times = [];
    for (let i = 0; i < 4; i += 1) {
      const t0 = Date.now();
      const open = await tcpProbe(target, 443, 2500);
      if (open) times.push(Date.now() - t0);
    }
    if (!times.length) return ctx.m.reply(`❌ *${target}* unreachable on port 443.`);
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    await ctx.m.reply(`📡 *Ping ${target}*\n\n✅ 4/4 reachable\n⏱️ Min ${Math.min(...times)}ms · Avg ${avg}ms · Max ${Math.max(...times)}ms`);
  },

  async dnslookup(ctx) {
    const host = await U.need(ctx, 'dnslookup <domain>');
    if (!host) return;
    const domain = host.replace(/^https?:\/\//, '').split('/')[0];
    const types = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME'];
    const lines = [`🌐 *DNS: ${domain}*`, ''];
    for (const t of types) {
      try {
        const rec = await dns.resolve(domain, t);
        const val = Array.isArray(rec) ? rec.map((r) => (typeof r === 'object' ? (r.exchange || r.value || JSON.stringify(r)) : r)).join(', ') : rec;
        if (val) lines.push(`*${t}:* ${String(val).slice(0, 200)}`);
      } catch (_) {}
    }
    await ctx.m.reply(lines.length > 2 ? lines.join('\n') : `❌ No DNS records found for ${domain}`);
  },

  async sslcheck(ctx) {
    const host = await U.need(ctx, 'sslcheck <domain>');
    if (!host) return;
    const domain = host.replace(/^https?:\/\//, '').split('/')[0];
    await new Promise((resolve) => {
      const socket = tls.connect({ host: domain, port: 443, servername: domain, timeout: 10000 }, () => {
        const cert = socket.getPeerCertificate();
        const days = Math.round((new Date(cert.valid_to) - Date.now()) / 86400000);
        ctx.m.reply(U.box('🔐 SSL CERTIFICATE', [
          `🌐 Host: ${domain}`,
          `🏢 Issuer: ${cert.issuer && cert.issuer.O ? cert.issuer.O : '—'}`,
          `📛 CN: ${cert.subject && cert.subject.CN ? cert.subject.CN : '—'}`,
          `📅 Valid: ${cert.valid_from}`,
          `⌛ Expires: ${cert.valid_to}`,
          `${days > 30 ? '✅' : '⚠️'} Days left: ${days}`
        ])).catch(() => null);
        socket.end();
        resolve();
      });
      socket.on('error', (e) => { ctx.m.reply(`❌ SSL check failed: ${e.message}`).catch(() => null); resolve(); });
      socket.on('timeout', () => { ctx.m.reply('❌ Connection timed out.').catch(() => null); socket.destroy(); resolve(); });
    });
  },

  async subnet(ctx) {
    const q = await U.need(ctx, 'subnet <ip/cidr>  e.g. 192.168.1.10/24');
    if (!q) return;
    const m = q.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/);
    if (!m) return ctx.m.reply('❌ Format: 192.168.1.10/24');
    const ip = m[1];
    const cidr = Number(m[2]);
    if (cidr > 32) return ctx.m.reply('❌ CIDR must be 0-32');
    const mask = cidr === 0 ? 0 : (0xffffffff << (32 - cidr)) >>> 0;
    const ipInt = ipToInt(ip);
    const network = (ipInt & mask) >>> 0;
    const broadcast = (network | (~mask >>> 0)) >>> 0;
    const hosts = cidr >= 31 ? 0 : Math.pow(2, 32 - cidr) - 2;
    await ctx.m.reply(U.box('🌐 SUBNET CALCULATOR', [
      `IP: ${ip}/${cidr}`,
      `Subnet mask: ${intToIp(mask)}`,
      `Network: ${intToIp(network)}`,
      `Broadcast: ${intToIp(broadcast)}`,
      `First host: ${cidr >= 31 ? '—' : intToIp(network + 1)}`,
      `Last host: ${cidr >= 31 ? '—' : intToIp(broadcast - 1)}`,
      `Usable hosts: ${hosts.toLocaleString()}`
    ]));
  },

  async maclookup(ctx) {
    const q = await U.need(ctx, 'maclookup <mac address>');
    if (!q) return;
    try {
      const d = await U.getJson(`https://api.macvendors.com/${encodeURIComponent(q.trim())}`, { timeout: 8000 });
      await ctx.m.reply(`🔎 *MAC Vendor*\n\n\`${q.trim()}\` → ${typeof d === 'string' ? d : JSON.stringify(d)}`);
    } catch (e) {
      await ctx.m.reply('❌ Vendor not found for this MAC address.');
    }
  },

  async httpheader(ctx) {
    const q = await U.need(ctx, 'httpheader <url>');
    if (!q) return;
    const url = /^https?:\/\//i.test(q) ? q : `https://${q}`;
    try {
      const res = await U.axios.head(url, { timeout: 15000, validateStatus: () => true, headers: { 'User-Agent': 'Mozilla/5.0 (SAQIB-MD)' } });
      const lines = Object.entries(res.headers).map(([k, v]) => `• *${k}:* ${String(v).slice(0, 160)}`);
      await ctx.m.reply(`🌐 *HTTP ${res.status} headers*\n🔗 ${url}\n\n${lines.join('\n')}`);
    } catch (e) {
      await ctx.m.reply(`❌ Failed: ${e.message}`);
    }
  },

  async portscan(ctx) {
    const host = await U.need(ctx, 'portscan <host>');
    if (!host) return;
    const target = host.replace(/^https?:\/\//, '').split('/')[0];
    await ctx.m.react('🔍').catch(() => null);
    const ports = [21, 22, 23, 25, 53, 80, 110, 143, 443, 465, 587, 993, 995, 3306, 5432, 6379, 8080, 8443, 27017];
    const open = [];
    await Promise.all(ports.map(async (p) => { if (await tcpProbe(target, p, 2000)) open.push(p); }));
    open.sort((a, b) => a - b);
    await ctx.m.reply(`🔍 *Port scan: ${target}*\n\n${open.length ? `✅ Open: ${open.join(', ')}` : '❌ No common ports open.'}\n\n_Scanned ${ports.length} common ports._`);
  },

  async myip(ctx) {
    try {
      const d = await U.getJson('https://ipinfo.io/json', { timeout: 10000 });
      await ctx.m.reply(U.box('🌍 MY IP', [
        `IP: ${d.ip}`,
        `City: ${d.city || '—'}, ${d.region || ''}`,
        `Country: ${d.country || '—'}`,
        `ISP: ${d.org || '—'}`,
        `Timezone: ${d.timezone || '—'}`,
        `Location: ${d.loc || '—'}`
      ]));
    } catch (e) {
      await ctx.m.reply(`❌ Failed: ${e.message}`);
    }
  },

  async htmlsource(ctx) {
    const q = await U.need(ctx, 'htmlsource <url>');
    if (!q) return;
    const url = /^https?:\/\//i.test(q) ? q : `https://${q}`;
    try {
      const html = await U.getText(url);
      await ctx.m.reply(`📄 *Source of ${url}*\n\n\`\`\`html\n${html.slice(0, 3000)}\n\`\`\``);
    } catch (e) {
      await ctx.m.reply(`❌ Failed: ${e.message}`);
    }
  },

  async colorpicker(ctx) {
    const q = await U.need(ctx, 'colorpicker <hex|rgb|name>');
    if (!q) return;
    let hex = q.trim();
    if (/^#?[0-9a-f]{3}$/i.test(hex)) hex = '#' + hex.replace('#', '').split('').map((c) => c + c).join('');
    if (/^#?[0-9a-f]{6}$/i.test(hex)) {
      hex = '#' + hex.replace('#', '').toLowerCase();
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const max = Math.max(r, g, b) / 255;
      const min = Math.min(r, g, b) / 255;
      const l = (max + min) / 2;
      const s = max === min ? 0 : (l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min));
      let h = 0;
      if (max !== min) {
        const d = max - min;
        if (max === r / 255) h = ((g - b) / 255 / d + (g < b ? 6 : 0));
        else if (max === g / 255) h = (b - r) / 255 / d + 2;
        else h = (r - g) / 255 / d + 4;
        h *= 60;
      }
      return ctx.m.reply(U.box('🎨 COLOR', [
        `HEX: ${hex.toUpperCase()}`,
        `RGB: rgb(${r}, ${g}, ${b})`,
        `HSL: hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`,
        `Preview: https://dummyimage.com/300x120/${hex.slice(1)}/ffffff&text=${encodeURIComponent(hex.toUpperCase())}`
      ]));
    }
    await U.aiReply(ctx, q, 'Convert this colour name/description into HEX, RGB and HSL values. Return a short table.');
  },

  async regexreplace(ctx) {
    const raw = U.textOf(ctx);
    const parts = raw.split('|').map((s) => s.trim());
    if (parts.length < 3) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}regexreplace <pattern> | <replacement> | <text>`);
    try {
      const re = new RegExp(parts[0], 'g');
      const out = parts.slice(2).join(' | ').replace(re, parts[1]);
      await ctx.m.reply(`🔁 *Result*\n\n${out}`);
    } catch (e) {
      await ctx.m.reply(`❌ Invalid regex: ${e.message}`);
    }
  },

  async cronexplain(ctx) {
    const q = await U.need(ctx, 'cronexplain <cron expression>');
    if (!q) return;
    await U.aiReply(ctx, q, 'Explain this cron expression in plain English, list the next 5 run times, and give a human-readable schedule summary.');
  },

  async unixstamp(ctx) {
    const now = Math.floor(Date.now() / 1000);
    await ctx.m.reply(`⏱️ *Unix timestamp*\n\n\`${now}\`\n📅 ${new Date().toUTCString()}`);
  },

  async epochdec(ctx) {
    const q = await U.need(ctx, 'epochdec <epoch seconds|ms>');
    if (!q) return;
    const n = Number(q.trim());
    if (!Number.isFinite(n)) return ctx.m.reply('❌ Provide a numeric epoch value.');
    const ms = String(q).length > 11 ? n : n * 1000;
    const d = new Date(ms);
    await ctx.m.reply(`🕰️ *Epoch ${n}*\n\n📅 UTC: ${d.toUTCString()}\n📅 Local: ${d.toString()}\n📅 ISO: ${d.toISOString()}`);
  },

  async markdown2html(ctx) {
    const q = U.textOf(ctx) || (ctx.m.quoted && ctx.m.quoted.text) || '';
    if (!q) return U.need(ctx, 'markdown2html <markdown>');
    await ctx.m.reply(`🌐 *HTML*\n\n\`\`\`html\n${simpleMarkdownToHtml(q).slice(0, 3500)}\n\`\`\``);
  },

  async html2markdown(ctx) {
    const q = U.textOf(ctx) || (ctx.m.quoted && ctx.m.quoted.text) || '';
    if (!q) return U.need(ctx, 'html2markdown <html>');
    await ctx.m.reply(`📝 *Markdown*\n\n${htmlToMarkdown(q).slice(0, 3500)}`);
  },

  async diffchecker(ctx) {
    const raw = U.textOf(ctx);
    const parts = raw.split('|').map((s) => s.trim());
    if (parts.length < 2) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}diffchecker <text A> | <text B>`);
    const a = parts[0].split(/\s+/);
    const b = parts.slice(1).join(' | ').split(/\s+/);
    const max = Math.max(a.length, b.length);
    const lines = [];
    for (let i = 0; i < max; i += 1) {
      if (a[i] === b[i]) lines.push(`  ${a[i] || ''}`);
      else {
        if (a[i] !== undefined) lines.push(`- ${a[i]}`);
        if (b[i] !== undefined) lines.push(`+ ${b[i]}`);
      }
    }
    await ctx.m.reply(`🔍 *Diff*\n\n\`\`\`diff\n${lines.slice(0, 120).join('\n')}\n\`\`\``);
  },

  async jwtdecode(ctx) {
    const q = await U.need(ctx, 'jwtdecode <token>');
    if (!q) return;
    const parts = q.trim().split('.');
    if (parts.length < 2) return ctx.m.reply('❌ Not a valid JWT (expected 3 dot-separated parts).');
    const dec = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    try {
      const header = JSON.parse(dec(parts[0]));
      const payload = JSON.parse(dec(parts[1]));
      const exp = payload.exp ? new Date(payload.exp * 1000).toUTCString() : '—';
      await ctx.m.reply(`🔓 *JWT Decoded*\n\n*Header*\n\`\`\`json\n${JSON.stringify(header, null, 2)}\n\`\`\`\n*Payload*\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n⏰ Expires: ${exp}`);
    } catch (e) {
      await ctx.m.reply(`❌ Decode failed: ${e.message}`);
    }
  },

  async asciiart(ctx) {
    const q = await U.need(ctx, 'asciiart <text>');
    if (!q) return;
    await U.aiReply(ctx, q, 'Render this text as large ASCII art using only printable ASCII characters. Put it in a code block. Keep it under 20 lines.');
  },

  async urlencode(ctx) {
    const t = await U.need(ctx, 'urlencode <text>');
    if (!t) return;
    await ctx.m.reply(`🔗 *Encoded*\n\n\`${encodeURIComponent(t)}\``);
  },

  async urldecode(ctx) {
    const t = await U.need(ctx, 'urldecode <text>');
    if (!t) return;
    try { await ctx.m.reply(`🔗 *Decoded*\n\n${decodeURIComponent(t)}`); }
    catch (e) { await ctx.m.reply(`❌ Invalid encoding: ${e.message}`); }
  },

  async useragent(ctx) {
    const q = U.textOf(ctx);
    if (!q) {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
      return ctx.m.reply(`🖥️ *Sample User-Agent*\n\n\`${ua}\`\n\n_Usage: ${ctx.prefix}useragent <ua string> to parse one._`);
    }
    const os = /Windows NT ([\d.]+)/.exec(q) ? `Windows NT ${/Windows NT ([\d.]+)/.exec(q)[1]}` : /Mac OS X/.test(q) ? 'macOS' : /Android/.test(q) ? 'Android' : /iPhone|iPad/.test(q) ? 'iOS' : /Linux/.test(q) ? 'Linux' : 'Unknown';
    const browser = /Edg\/([\d.]+)/.exec(q) ? `Edge ${/Edg\/([\d.]+)/.exec(q)[1]}` : /Chrome\/([\d.]+)/.exec(q) ? `Chrome ${/Chrome\/([\d.]+)/.exec(q)[1]}` : /Firefox\/([\d.]+)/.exec(q) ? `Firefox ${/Firefox\/([\d.]+)/.exec(q)[1]}` : /Safari\/([\d.]+)/.exec(q) ? 'Safari' : 'Unknown';
    await ctx.m.reply(U.box('🖥️ USER AGENT', [`OS: ${os}`, `Browser: ${browser}`, `Mobile: ${/Mobile|Android|iPhone/.test(q) ? 'Yes' : 'No'}`, `Bot: ${/bot|crawler|spider/i.test(q) ? 'Yes' : 'No'}`]));
  }
};

module.exports = { handlers };
