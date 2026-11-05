/**
 * OFFICE & PRODUCTIVITY (25) + NETWORK / DOMAIN / WEB TOOLS (18).
 */

const dns = require('dns').promises;
const U = require('../util');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i += 1; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}

function toCsv(rows) {
  return rows.map((r) => r.map((c) => {
    const s = String(c == null ? '' : c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}

function wordStats(text) {
  const words = text.trim() ? text.trim().split(/\s+/) : [];
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim()).length;
  const paragraphs = text.split(/\n{2,}/).filter((s) => s.trim()).length;
  const chars = text.length;
  const readingMin = Math.max(1, Math.round(words.length / 200));
  return { words: words.length, chars, sentences, paragraphs, readingMin };
}

function hostOf(input) {
  return String(input || '').replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
}

async function fetchDoc(ctx) {
  const media = await U.getMedia(ctx);
  if (media) return media.buffer.toString('utf8');
  return U.textOf(ctx) || (ctx.m.quoted && ctx.m.quoted.text) || '';
}

const handlers = {
  /* ---------------- OFFICE ---------------- */

  async excel(ctx) {
    const media = await U.needMedia(ctx);
    if (!media) return;
    const text = media.buffer.toString('utf8');
    const rows = parseCsv(text);
    await ctx.m.reply(`📊 *Sheet preview* (${rows.length} rows)\n\n\`\`\`\n${rows.slice(0, 20).map((r) => r.join(' | ')).join('\n').slice(0, 2500)}\n\`\`\``);
  },

  async csvparse(ctx) {
    const text = await fetchDoc(ctx);
    if (!text) return U.need(ctx, 'csvparse <csv text>  (or reply to a .csv file)');
    const rows = parseCsv(text);
    const header = rows[0] || [];
    await ctx.m.reply(`📊 *CSV parsed*\n\nRows: ${rows.length}\nColumns: ${header.length}\n\n*Header:* ${header.join(', ')}\n\n\`\`\`\n${rows.slice(1, 8).map((r) => r.join(' | ')).join('\n').slice(0, 1800)}\n\`\`\``);
  },

  async markdown(ctx) {
    const text = await fetchDoc(ctx);
    if (!text) return U.need(ctx, 'markdown <text>');
    const md = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => (/^[-*#]/.test(p) ? p : `**${p}**`)).join('\n\n');
    await ctx.m.reply(`📝 *Formatted*\n\n${md.slice(0, 3500)}`);
  },

  async wordcount(ctx) {
    const text = await fetchDoc(ctx);
    if (!text) return U.need(ctx, 'wordcount <text>');
    const s = wordStats(text);
    await ctx.m.reply(U.box('📊 WORD COUNT', [
      `Words: ${s.words.toLocaleString()}`,
      `Characters: ${s.chars.toLocaleString()}`,
      `Sentences: ${s.sentences}`,
      `Paragraphs: ${s.paragraphs}`,
      `Reading time: ~${s.readingMin} min`
    ]));
  },

  async spellcheck(ctx) {
    const text = await fetchDoc(ctx);
    if (!text) return U.need(ctx, 'spellcheck <text>');
    await U.aiReply(ctx, text, 'Correct all spelling and grammar mistakes. Return the corrected text, then a bullet list of each fix.');
  },

  async summarizefile(ctx) {
    const text = await fetchDoc(ctx);
    if (!text) return U.need(ctx, 'summarizefile (reply to a document)');
    await U.aiReply(ctx, text.slice(0, 12000), 'Summarise this document: 5 key points, then a 2-sentence executive summary.');
  },

  async csvtojson(ctx) {
    const text = await fetchDoc(ctx);
    if (!text) return U.need(ctx, 'csvtojson <csv>');
    const rows = parseCsv(text);
    if (rows.length < 2) return ctx.m.reply('❌ Need a header row plus data.');
    const header = rows[0];
    const out = rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] == null ? '' : r[i]])));
    await ctx.m.reply(`🔄 *JSON*\n\n\`\`\`json\n${JSON.stringify(out.slice(0, 50), null, 2).slice(0, 3200)}\n\`\`\``);
  },

  async jsontocsv(ctx) {
    const text = await fetchDoc(ctx);
    if (!text) return U.need(ctx, 'jsontocsv <json array>');
    try {
      const data = JSON.parse(text);
      const arr = Array.isArray(data) ? data : [data];
      const header = [...new Set(arr.flatMap((o) => Object.keys(o || {})))];
      const rows = [header, ...arr.map((o) => header.map((h) => (o && o[h] != null ? o[h] : '')))];
      await ctx.m.reply(`🔄 *CSV*\n\n\`\`\`\n${toCsv(rows).slice(0, 3200)}\n\`\`\``);
    } catch (e) { await ctx.m.reply(`❌ Invalid JSON: ${e.message}`); }
  },

  async textdiff(ctx) {
    const raw = U.textOf(ctx);
    const parts = raw.split('|').map((s) => s.trim());
    if (parts.length < 2) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}textdiff <text A> | <text B>`);
    const a = parts[0].split(/\s+/);
    const b = parts.slice(1).join(' | ').split(/\s+/);
    const lines = [];
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i += 1) {
      if (a[i] === b[i]) lines.push(`  ${a[i] || ''}`);
      else { if (a[i] !== undefined) lines.push(`- ${a[i]}`); if (b[i] !== undefined) lines.push(`+ ${b[i]}`); }
    }
    await ctx.m.reply(`🔍 *Diff*\n\n\`\`\`diff\n${lines.slice(0, 120).join('\n')}\n\`\`\``);
  },

  async slugify(ctx) {
    const t = await U.need(ctx, 'slugify <text>');
    if (!t) return;
    const slug = t.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    await ctx.m.reply(`🔗 *Slug*\n\n\`${slug}\``);
  },

  async invoice(ctx) {
    const raw = U.textOf(ctx);
    if (!raw) return U.need(ctx, 'invoice <client> | <item> <qty> <price> ...');
    await U.aiReply(ctx, raw, 'Create a clean text invoice: header, invoice number, date, client, line items table, subtotal, tax 0%, total, payment terms. Use plain text that looks good on WhatsApp.');
  },

  async receipt(ctx) {
    const raw = U.textOf(ctx);
    if (!raw) return U.need(ctx, 'receipt <store> | <item> <price> ...');
    await U.aiReply(ctx, raw, 'Create a simple text receipt with store name, date, itemised lines, total and a thank-you footer.');
  },

  async agenda(ctx) {
    const raw = U.textOf(ctx);
    if (!raw) return U.need(ctx, 'agenda <meeting topic>');
    await U.aiReply(ctx, raw, 'Create a meeting agenda with time blocks, owner per item and desired outcome. Keep it under 12 lines.');
  },

  async minutes(ctx) {
    const raw = U.textOf(ctx) || (ctx.m.quoted && ctx.m.quoted.text) || '';
    if (!raw) return U.need(ctx, 'minutes <meeting notes>');
    await U.aiReply(ctx, raw, 'Turn these notes into formal meeting minutes: attendees, decisions, action items with owners and deadlines.');
  },

  async kanban(ctx) {
    const raw = U.textOf(ctx);
    if (!raw) return U.need(ctx, 'kanban <project>');
    await U.aiReply(ctx, raw, 'Create a Kanban board in Markdown with columns Backlog / To Do / In Progress / Review / Done and 3 realistic tasks per column.');
  },

  async gantt(ctx) {
    const raw = U.textOf(ctx);
    if (!raw) return U.need(ctx, 'gantt <project>');
    await U.aiReply(ctx, raw, 'Produce a Mermaid gantt chart for this project in a code block, then a short milestone list.');
  },

  async flowchart(ctx) {
    const raw = U.textOf(ctx);
    if (!raw) return U.need(ctx, 'flowchart <process>');
    await U.aiReply(ctx, raw, 'Produce a Mermaid flowchart (graph TD) for this process in a code block, then explain each step in one line.');
  },

  async presentation(ctx) {
    const raw = U.textOf(ctx);
    if (!raw) return U.need(ctx, 'presentation <topic>');
    await U.aiReply(ctx, raw, 'Create a 7-slide presentation outline: slide title + 3 bullets each + speaker notes. Plain text.');
  },

  async coverletter(ctx) {
    const raw = U.textOf(ctx);
    if (!raw) return U.need(ctx, 'coverletter <job title> | <your skills>');
    await U.aiReply(ctx, raw, 'Write a concise professional cover letter (max 250 words) tailored to this role. Include placeholders for company name.');
  },

  async resume(ctx) {
    const raw = U.textOf(ctx);
    if (!raw) return U.need(ctx, 'resume <name> | <role> | <skills> | <experience>');
    await U.aiReply(ctx, raw, 'Write an ATS-friendly resume in plain text: summary, skills, experience with bullet achievements, education.');
  },

  async businessplan(ctx) {
    const raw = U.textOf(ctx);
    if (!raw) return U.need(ctx, 'businessplan <idea>');
    await U.aiReply(ctx, raw, 'Draft a lean business plan: problem, solution, target market, revenue model, costs, competition, 90-day plan.');
  },

  async swot(ctx) {
    const raw = U.textOf(ctx);
    if (!raw) return U.need(ctx, 'swot <business or idea>');
    await U.aiReply(ctx, raw, 'Produce a SWOT analysis with 4 bullets per quadrant, then 3 strategic recommendations.');
  },

  async okr(ctx) {
    const raw = U.textOf(ctx);
    if (!raw) return U.need(ctx, 'okr <team or goal>');
    await U.aiReply(ctx, raw, 'Create 3 Objectives with 3 measurable Key Results each. Include a quarterly cadence.');
  },

  async kpi(ctx) {
    const raw = U.textOf(ctx);
    if (!raw) return U.need(ctx, 'kpi <business type>');
    await U.aiReply(ctx, raw, 'List the 8 most important KPIs for this business, with formula, target and review frequency.');
  },

  async timesheet(ctx) {
    const raw = U.textOf(ctx);
    if (!raw) return U.need(ctx, 'timesheet <task> <hours> | <task> <hours> ...');
    const items = raw.split('|').map((s) => s.trim()).filter(Boolean);
    let total = 0;
    const lines = items.map((it) => {
      const m = it.match(/(.+?)\s+([\d.]+)\s*h?$/i);
      const h = m ? Number(m[2]) : 0;
      total += h;
      return `• ${m ? m[1] : it}: ${h}h`;
    });
    await ctx.m.reply(`🕒 *Timesheet*\n\n${lines.join('\n')}\n\n💰 *Total: ${total}h*`);
  },

  /* ---------------- NETWORK / WEB ---------------- */

  async traceroute(ctx) {
    const host = await U.need(ctx, 'traceroute <host>');
    if (!host) return;
    const target = hostOf(host);
    const r = await new Promise((resolve) => {
      U.cp.exec(`traceroute -m 12 -w 1 ${target} 2>&1 || tracepath -m 12 ${target} 2>&1`, { timeout: 25000 }, (err, stdout) => resolve(stdout || (err && err.message) || ''));
    });
    if (/not found|command not found/i.test(r)) {
      return ctx.m.reply(`📡 *Traceroute ${target}*\n\nTraceroute binary is not installed in this container.\nUse \`${ctx.prefix}pinghost ${target}\` for reachability.`);
    }
    await ctx.m.reply(`📡 *Traceroute ${target}*\n\n\`\`\`\n${r.slice(0, 2500)}\n\`\`\``);
  },

  async dig(ctx) {
    const raw = U.textOf(ctx).split(/\s+/);
    const domain = raw[0];
    const type = (raw[1] || 'A').toUpperCase();
    if (!domain) return U.need(ctx, 'dig <domain> [A|AAAA|MX|TXT|NS|CNAME]');
    try {
      const rec = await dns.resolve(hostOf(domain), type);
      await ctx.m.reply(`🔎 *${type} ${domain}*\n\n\`\`\`\n${JSON.stringify(rec, null, 2).slice(0, 2500)}\n\`\`\``);
    } catch (e) { await ctx.m.reply(`❌ DNS query failed: ${e.message}`); }
  },

  async reverseip(ctx) {
    const ip = await U.need(ctx, 'reverseip <ip>');
    if (!ip) return;
    try {
      const names = await dns.reverse(ip.trim());
      await ctx.m.reply(`🔄 *Reverse DNS ${ip}*\n\n${names.map((n) => `• ${n}`).join('\n')}`);
    } catch (e) { await ctx.m.reply(`❌ No PTR record found for ${ip}`); }
  },

  async blacklist(ctx) {
    const host = await U.need(ctx, 'blacklist <domain or ip>');
    if (!host) return;
    const target = hostOf(host);
    const zones = ['zen.spamhaus.org', 'bl.spamcop.net', 'b.barracudacentral.org', 'dnsbl.sorbs.net'];
    const lines = [];
    for (const zone of zones) {
      try {
        const res = await dns.resolve4(`${target}.${zone}`);
        lines.push(`⚠️ Listed on ${zone} (${res.join(', ')})`);
      } catch (_) {
        lines.push(`✅ Clean on ${zone}`);
      }
    }
    await ctx.m.reply(`🛡️ *Blacklist check: ${target}*\n\n${lines.join('\n')}`);
  },

  async sitemap(ctx) {
    const host = await U.need(ctx, 'sitemap <domain>');
    if (!host) return;
    const base = /^https?:\/\//.test(host) ? host.replace(/\/$/, '') : `https://${hostOf(host)}`;
    try {
      const xml = await U.getText(`${base}/sitemap.xml`);
      const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
      await ctx.m.reply(`🗺️ *Sitemap* (${urls.length} URLs)\n\n${urls.slice(0, 20).map((u) => `• ${u}`).join('\n')}`);
    } catch (e) { await ctx.m.reply(`❌ No sitemap found at ${base}/sitemap.xml`); }
  },

  async robots(ctx) {
    const host = await U.need(ctx, 'robots <domain>');
    if (!host) return;
    const base = /^https?:\/\//.test(host) ? host.replace(/\/$/, '') : `https://${hostOf(host)}`;
    try {
      const txt = await U.getText(`${base}/robots.txt`);
      await ctx.m.reply(`🤖 *robots.txt*\n\n\`\`\`\n${txt.slice(0, 2500)}\n\`\`\``);
    } catch (e) { await ctx.m.reply(`❌ robots.txt not found.`); }
  },

  async headers(ctx) {
    const q = await U.need(ctx, 'headers <url>');
    if (!q) return;
    const url = /^https?:\/\//i.test(q) ? q : `https://${q}`;
    try {
      const res = await U.axios.get(url, { timeout: 15000, validateStatus: () => true, headers: { 'User-Agent': 'Mozilla/5.0 (SAQIB-MD)' } });
      const lines = Object.entries(res.headers).map(([k, v]) => `• *${k}:* ${String(v).slice(0, 150)}`);
      await ctx.m.reply(`🌐 *HTTP ${res.status}*\n🔗 ${url}\n\n${lines.join('\n')}`);
    } catch (e) { await ctx.m.reply(`❌ Failed: ${e.message}`); }
  },

  async securitytxt(ctx) {
    const host = await U.need(ctx, 'securitytxt <domain>');
    if (!host) return;
    const base = /^https?:\/\//.test(host) ? host.replace(/\/$/, '') : `https://${hostOf(host)}`;
    try {
      const txt = await U.getText(`${base}/.well-known/security.txt`);
      await ctx.m.reply(`🛡️ *security.txt*\n\n\`\`\`\n${txt.slice(0, 2500)}\n\`\`\``);
    } catch (e) { await ctx.m.reply('❌ No security.txt published.'); }
  },

  async threatcheck(ctx) {
    const q = await U.need(ctx, 'threatcheck <domain or ip>');
    if (!q) return;
    await U.aiReply(ctx, q, 'Assess the likely security reputation of this domain/IP: typical phishing indicators, how to verify safely, and recommended checks. Be explicit that this is advisory, not a live threat-feed lookup.');
  },

  async unshorten(ctx) {
    const q = await U.need(ctx, 'unshorten <short url>');
    if (!q) return;
    const url = /^https?:\/\//i.test(q) ? q : `https://${q}`;
    try {
      const res = await U.axios.get(url, { timeout: 15000, maxRedirects: 10, validateStatus: () => true, headers: { 'User-Agent': 'Mozilla/5.0' } });
      const final = res.request && res.request.res && res.request.res.responseUrl ? res.request.res.responseUrl : url;
      await ctx.m.reply(`🔗 *Unshortened*\n\n${url}\n⬇️\n*${final}*`);
    } catch (e) { await ctx.m.reply(`❌ Failed: ${e.message}`); }
  },

  async webarchive(ctx) {
    const q = await U.need(ctx, 'webarchive <url>');
    if (!q) return;
    try {
      const d = await U.getJson(`https://archive.org/wayback/available?url=${encodeURIComponent(q)}`);
      const snap = d.archived_snapshots && d.archived_snapshots.closest;
      if (!snap) return ctx.m.reply('❌ No archived snapshot found.');
      await ctx.m.reply(`🏛️ *Wayback snapshot*\n\n📅 ${snap.timestamp}\n🔗 ${snap.url}`);
    } catch (e) { await ctx.m.reply(`❌ Archive lookup failed: ${e.message}`); }
  },

  async responsive(ctx) {
    const q = await U.need(ctx, 'responsive <url>');
    if (!q) return;
    const url = /^https?:\/\//i.test(q) ? q : `https://${q}`;
    try {
      const html = await U.getText(url);
      const viewport = /<meta[^>]+name=["']viewport["'][^>]*>/i.test(html);
      const media = (html.match(/@media/g) || []).length;
      const flex = (html.match(/display:\s*flex/g) || []).length;
      await ctx.m.reply(U.box('📱 RESPONSIVE CHECK', [
        `Viewport meta: ${viewport ? '✅ present' : '❌ missing'}`,
        `@media rules: ${media}`,
        `flexbox uses: ${flex}`,
        `Page size: ${(html.length / 1024).toFixed(1)} KB`,
        `${viewport ? '✅ Likely mobile-friendly' : '⚠️ May not be mobile-friendly'}`
      ]));
    } catch (e) { await ctx.m.reply(`❌ Failed: ${e.message}`); }
  },

  async cssvalidate(ctx) {
    const q = U.textOf(ctx) || (ctx.m.quoted && ctx.m.quoted.text) || '';
    if (!q) return U.need(ctx, 'cssvalidate <css code>');
    const opens = (q.match(/{/g) || []).length;
    const closes = (q.match(/}/g) || []).length;
    await ctx.m.reply(`🎨 *CSS check*\n\n${opens === closes ? '✅ Braces balanced' : `❌ Brace mismatch: ${opens} { vs ${closes} }`}\nRules: ${opens}\nSize: ${q.length} chars`);
  },

  async jsvalidate(ctx) {
    const q = U.textOf(ctx) || (ctx.m.quoted && ctx.m.quoted.text) || '';
    if (!q) return U.need(ctx, 'jsvalidate <js code>');
    try {
      // eslint-disable-next-line no-new-func
      new Function(q);
      await ctx.m.reply('✅ *JavaScript syntax looks valid.*');
    } catch (e) { await ctx.m.reply(`❌ Syntax error: ${e.message}`); }
  },

  async techstack(ctx) {
    const q = await U.need(ctx, 'techstack <url>');
    if (!q) return;
    const url = /^https?:\/\//i.test(q) ? q : `https://${q}`;
    try {
      const res = await U.axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' }, validateStatus: () => true });
      const html = String(res.data || '');
      const h = res.headers;
      const found = [];
      if (h['x-powered-by']) found.push(`X-Powered-By: ${h['x-powered-by']}`);
      if (h.server) found.push(`Server: ${h.server}`);
      if (/wp-content|wordpress/i.test(html)) found.push('WordPress');
      if (/__NEXT_DATA__|_next\//.test(html)) found.push('Next.js');
      if (/react/i.test(html)) found.push('React');
      if (/vue/i.test(html)) found.push('Vue');
      if (/cdn\.shopify|shopify/i.test(html)) found.push('Shopify');
      if (/cloudflare/i.test(h.server || '')) found.push('Cloudflare');
      if (/bootstrap/i.test(html)) found.push('Bootstrap');
      if (/tailwind/i.test(html)) found.push('Tailwind CSS');
      if (/jquery/i.test(html)) found.push('jQuery');
      await ctx.m.reply(`🧱 *Tech stack: ${hostOf(url)}*\n\n${found.length ? found.map((f) => `• ${f}`).join('\n') : 'No obvious fingerprints detected.'}`);
    } catch (e) { await ctx.m.reply(`❌ Failed: ${e.message}`); }
  },

  async pageweight(ctx) {
    const q = await U.need(ctx, 'pageweight <url>');
    if (!q) return;
    const url = /^https?:\/\//.test(q) ? q : `https://${q}`;
    try {
      const t0 = Date.now();
      const res = await U.axios.get(url, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' }, validateStatus: () => true });
      const size = Number(res.headers['content-length']) || Buffer.byteLength(String(res.data || ''));
      await ctx.m.reply(U.box('⚖️ PAGE WEIGHT', [
        `URL: ${url}`,
        `Status: ${res.status}`,
        `Size: ${(size / 1024).toFixed(1)} KB`,
        `Load time: ${Date.now() - t0} ms`,
        `${size < 500 * 1024 ? '✅ Lightweight' : size < 2 * 1024 * 1024 ? '⚠️ Average' : '🐢 Heavy'}`
      ]));
    } catch (e) { await ctx.m.reply(`❌ Failed: ${e.message}`); }
  },

  async brokenlinks(ctx) {
    const q = await U.need(ctx, 'brokenlinks <url>');
    if (!q) return;
    const url = /^https?:\/\//.test(q) ? q : `https://${q}`;
    try {
      const html = await U.getText(url);
      const base = new URL(url);
      const links = [...new Set([...html.matchAll(/href=["']([^"'#]+)["']/g)].map((m) => {
        try { return new URL(m[1], base).href; } catch (_) { return null; }
      }).filter((x) => x && x.startsWith('http')))].slice(0, 12);
      const lines = [];
      for (const l of links) {
        try {
          const r = await U.axios.head(l, { timeout: 8000, validateStatus: () => true, headers: { 'User-Agent': 'Mozilla/5.0' } });
          lines.push(`${r.status < 400 ? '✅' : '❌'} ${r.status} ${l}`);
        } catch (_) { lines.push(`❌ ERR ${l}`); }
      }
      await ctx.m.reply(`🔗 *Link check (${links.length})*\n\n${lines.join('\n').slice(0, 3000)}`);
    } catch (e) { await ctx.m.reply(`❌ Failed: ${e.message}`); }
  },

  async redirects(ctx) {
    const q = await U.need(ctx, 'redirects <url>');
    if (!q) return;
    const url = /^https?:\/\//.test(q) ? q : `https://${q}`;
    try {
      const chain = [];
      let current = url;
      for (let i = 0; i < 8; i += 1) {
        const r = await U.axios.get(current, { timeout: 12000, maxRedirects: 0, validateStatus: () => true, headers: { 'User-Agent': 'Mozilla/5.0' } });
        chain.push(`${r.status} ${current}`);
        const loc = r.headers.location;
        if (!loc) break;
        current = new URL(loc, current).href;
      }
      await ctx.m.reply(`🔀 *Redirect chain*\n\n${chain.map((c, i) => `${i + 1}. ${c}`).join('\n')}`);
    } catch (e) { await ctx.m.reply(`❌ Failed: ${e.message}`); }
  }
};

module.exports = { handlers, parseCsv, toCsv, wordStats };
