/**
 * SYSTEM & SERVER MONITORING (19) + BOT SYSTEM & HEALTH (15).
 */

const os = require('os');
const fs = require('fs');
const U = require('../util');

function sh(cmd, timeout = 8000) {
  return new Promise((resolve) => {
    U.cp.exec(cmd, { timeout, maxBuffer: 1024 * 1024 * 4 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: String(stdout || ''), err: String(stderr || '') });
    });
  });
}

function bytes(n) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = Number(n) || 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(2)} ${units[i]}`;
}

function uptimeHuman(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

const handlers = {
  async cpu(ctx) {
    const cpus = os.cpus();
    const load = os.loadavg().map((x) => x.toFixed(2));
    const model = cpus[0] ? cpus[0].model : 'Unknown';
    const speed = cpus[0] ? cpus[0].speed : 0;
    await ctx.m.reply(U.box('🖥️ CPU', [
      `Model: ${model}`,
      `Cores: ${cpus.length}`,
      `Speed: ${speed} MHz`,
      `Load (1/5/15m): ${load.join(' / ')}`,
      `Architecture: ${os.arch()}`,
      `Platform: ${os.platform()}`
    ]));
  },

  async ram(ctx) {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const mem = process.memoryUsage();
    await ctx.m.reply(U.box('🧠 MEMORY', [
      `Host total: ${bytes(total)}`,
      `Host used: ${bytes(used)} (${((used / total) * 100).toFixed(1)}%)`,
      `Host free: ${bytes(free)}`,
      '',
      `Node heap used: ${bytes(mem.heapUsed)}`,
      `Node heap total: ${bytes(mem.heapTotal)}`,
      `RSS: ${bytes(mem.rss)}`,
      `External: ${bytes(mem.external)}`
    ]));
  },

  async disk(ctx) {
    const r = await sh('df -h / 2>/dev/null || df -h');
    if (!r.ok || !r.out) return ctx.m.reply('❌ Disk info unavailable.');
    await ctx.m.reply(`💾 *Disk usage*\n\n\`\`\`\n${r.out.slice(0, 2500)}\n\`\`\``);
  },

  async osinfo(ctx) {
    await ctx.m.reply(U.box('💻 OS INFO', [
      `Type: ${os.type()}`,
      `Platform: ${os.platform()}`,
      `Release: ${os.release()}`,
      `Arch: ${os.arch()}`,
      `Hostname: ${os.hostname()}`,
      `Uptime: ${uptimeHuman(os.uptime())}`,
      `Node: ${process.version}`,
      `PID: ${process.pid}`
    ]));
  },

  async process(ctx) {
    const r = await sh('ps aux --sort=-%cpu 2>/dev/null | head -16');
    if (!r.ok || !r.out) return ctx.m.reply('❌ Process list unavailable.');
    await ctx.m.reply(`⚙️ *Top processes*\n\n\`\`\`\n${r.out.slice(0, 2800)}\n\`\`\``);
  },

  async killpid(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    const pid = Number((U.textOf(ctx) || '').trim());
    if (!pid) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}killpid <pid>`);
    if (pid === process.pid) return ctx.m.reply('❌ Apne hi process ko kill nahi kar sakta.');
    const r = await sh(`kill -9 ${pid}`);
    await ctx.m.reply(r.ok ? `✅ Process ${pid} killed.` : `❌ Failed: ${r.err || 'unknown error'}`);
  },

  async docker(ctx) {
    const r = await sh('docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Image}}" 2>&1 | head -15');
    await ctx.m.reply(r.ok ? `🐳 *Docker containers*\n\n\`\`\`\n${r.out.slice(0, 2500)}\n\`\`\`` : '⚠️ Docker CLI is not available inside this container.');
  },

  async pm2(ctx) {
    const r = await sh('pm2 list 2>&1 | head -20');
    await ctx.m.reply(r.ok ? `⚙️ *PM2*\n\n\`\`\`\n${r.out.slice(0, 2500)}\n\`\`\`` : '⚠️ PM2 is not installed in this container.');
  },

  async service(ctx) {
    const name = U.textOf(ctx).trim();
    if (!name) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}service <name>`);
    const r = await sh(`systemctl status ${name} 2>&1 | head -12`);
    await ctx.m.reply(`⚙️ *${name}*\n\n\`\`\`\n${(r.out || r.err || 'no output').slice(0, 2000)}\n\`\`\``);
  },

  async logs(ctx) {
    const candidates = ['/app/logs/bot.log', '/app/bot.log', 'logs/bot.log', 'bot.log'];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          const data = fs.readFileSync(p, 'utf8').split('\n').slice(-40).join('\n');
          return ctx.m.reply(`📜 *Last log lines*\n\n\`\`\`\n${data.slice(0, 3000)}\n\`\`\``);
        }
      } catch (_) {}
    }
    await ctx.m.reply('📜 No log file found. Railway dashboard → Deployments → Logs dekhein.');
  },

  async temp(ctx) {
    let t = null;
    try { t = Number(fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8').trim()) / 1000; } catch (_) {}
    const load = os.loadavg()[0];
    await ctx.m.reply(`🌡️ *Temperature*\n\n${t ? `CPU: ${t.toFixed(1)}°C` : 'Sensor not exposed by the container.'}\n📊 Load average: ${load.toFixed(2)}`);
  },

  async netstat(ctx) {
    const r = await sh('ss -tunap 2>/dev/null | head -25 || netstat -tunap 2>/dev/null | head -25');
    await ctx.m.reply(r.ok && r.out ? `🌐 *Network sockets*\n\n\`\`\`\n${r.out.slice(0, 2500)}\n\`\`\`` : '⚠️ netstat/ss not available.');
  },

  async bandwidth(ctx) {
    try {
      const raw = fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2);
      let rx = 0;
      let tx = 0;
      for (const line of raw) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 10) continue;
        rx += Number(parts[1]);
        tx += Number(parts[9]);
      }
      await ctx.m.reply(U.box('📶 BANDWIDTH (since boot)', [`⬇️ Received: ${bytes(rx)}`, `⬆️ Transmitted: ${bytes(tx)}`]));
    } catch (_) {
      await ctx.m.reply('❌ Network counters unavailable.');
    }
  },

  async env(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    const keys = Object.keys(process.env).sort();
    const masked = keys.map((k) => (/KEY|TOKEN|SECRET|PASS|URI|URL/i.test(k) ? `${k}=***` : `${k}=${String(process.env[k]).slice(0, 40)}`));
    await ctx.m.reply(`🔐 *Environment (${keys.length} vars)*\n\n\`\`\`\n${masked.join('\n').slice(0, 3000)}\n\`\`\``);
  },

  async redisinfo(ctx) {
    const r = await sh('redis-cli info 2>&1 | head -20');
    await ctx.m.reply(r.ok && !/command not found|not found/i.test(r.out + r.err) ? `🟥 *Redis*\n\n\`\`\`\n${r.out.slice(0, 2000)}\n\`\`\`` : '⚠️ Redis is not configured for this bot.');
  },

  async mysqlstat(ctx) {
    const r = await sh('mysqladmin status 2>&1 | head -5');
    await ctx.m.reply(r.ok ? `🐬 *MySQL*\n\n\`\`\`\n${r.out.slice(0, 1500)}\n\`\`\`` : '⚠️ MySQL client/server not available. This bot uses MongoDB.');
  },

  async nginxstat(ctx) {
    const r = await sh('nginx -v 2>&1');
    await ctx.m.reply(r.ok ? `🌐 *Nginx*\n\n\`\`\`\n${r.out}\n\`\`\`` : '⚠️ Nginx is not running in this container (Railway routes traffic directly).');
  },

  async sysbench(ctx) {
    await ctx.m.react('⏱️').catch(() => null);
    const t0 = Date.now();
    let n = 0;
    for (let i = 0; i < 3e6; i += 1) n += Math.sqrt(i);
    const ms = Date.now() - t0;
    await ctx.m.reply(`⚡ *Quick benchmark*\n\n3,000,000 sqrt ops in *${ms} ms*\n≈ ${Math.round(3e6 / (ms / 1000)).toLocaleString()} ops/sec\n\n_Result: ${n > 0 ? 'OK' : 'FAIL'}_`);
  },

  async reboot(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    await ctx.m.reply('♻️ *Rebooting bot process...*');
    setTimeout(() => process.exit(0), 1200);
  },

  /* ---------------- BOT SYSTEM & HEALTH ---------------- */

  async version(ctx) {
    const pkg = require('../../../package.json');
    await ctx.m.reply(U.box('🏷️ VERSION', [
      `Bot: ${U.config.BOT_NAME}`,
      `Package: v${pkg.version || '1.0.0'}`,
      `Node: ${process.version}`,
      `Commit: ${process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT || 'local'}`,
      `Started: ${new Date(Date.now() - process.uptime() * 1000).toUTCString()}`
    ]));
  },

  async checkupdate(ctx) {
    try {
      const d = await U.getJson('https://api.github.com/repos/fizanali6267/saqib-md-bot/commits?per_page=1');
      const latest = d[0];
      const current = process.env.RAILWAY_GIT_COMMIT_SHA || '';
      await ctx.m.reply(U.box('🔄 UPDATE CHECK', [
        `Latest commit: ${latest.sha.slice(0, 7)}`,
        `Message: ${latest.commit.message.split('\n')[0].slice(0, 80)}`,
        `Date: ${latest.commit.author.date}`,
        current ? `Running: ${current.slice(0, 7)}` : 'Running: local build',
        current === latest.sha ? '✅ Up to date' : '⬆️ Update available — redeploy on Railway'
      ]));
    } catch (e) {
      await ctx.m.reply(`❌ Update check failed: ${e.message}`);
    }
  },

  async dbstats(ctx) {
    try {
      const mongoose = require('mongoose');
      const conn = mongoose.connection;
      const state = ['disconnected', 'connected', 'connecting', 'disconnecting'][conn.readyState] || 'unknown';
      const cols = conn.db ? await conn.db.listCollections().toArray() : [];
      await ctx.m.reply(U.box('🗄️ DATABASE', [
        `State: ${state}`,
        `Host: ${conn.host || '—'}`,
        `Database: ${conn.name || '—'}`,
        `Collections: ${cols.length}`,
        cols.slice(0, 10).map((c) => `• ${c.name}`).join('\n')
      ]));
    } catch (e) {
      await ctx.m.reply(`❌ DB stats failed: ${e.message}`);
    }
  },

  async cacheclear(ctx) {
    if (!(await U.ownerOnly(ctx))) return;
    let cleared = 0;
    for (const k of Object.keys(require.cache)) {
      if (k.includes('/plugins/') || k.includes('/lib/extra/')) { delete require.cache[k]; cleared += 1; }
    }
    await ctx.m.reply(`🧹 Cleared *${cleared}* cached modules. Commands reload on next message.`);
  },

  async errlog(ctx) {
    const errs = global.__SAQIB_ERRORS || [];
    if (!errs.length) return ctx.m.reply('✅ *No recent errors logged.*');
    const lines = errs.slice(-10).map((e) => `• [${new Date(e.time).toISOString().slice(11, 19)}] ${e.command}: ${String(e.message).slice(0, 120)}`);
    await ctx.m.reply(`🐞 *Recent errors*\n\n${lines.join('\n')}`);
  },

  async apistatus(ctx) {
    const checks = [
      ['Google', 'https://www.google.com/generate_204'],
      ['GitHub', 'https://api.github.com/zen'],
      ['CoinGecko', 'https://api.coingecko.com/api/v3/ping'],
      ['WhatsApp', 'https://web.whatsapp.com']
    ];
    const lines = [];
    for (const [name, url] of checks) {
      const t0 = Date.now();
      try {
        await U.axios.get(url, { timeout: 8000, validateStatus: () => true });
        lines.push(`✅ ${name}: ${Date.now() - t0}ms`);
      } catch (_) {
        lines.push(`❌ ${name}: down`);
      }
    }
    await ctx.m.reply(`📡 *API status*\n\n${lines.join('\n')}`);
  },

  async memorydump(ctx) {
    const m = process.memoryUsage();
    await ctx.m.reply(U.box('🧠 MEMORY DUMP', Object.entries(m).map(([k, v]) => `${k}: ${bytes(v)}`)));
  },

  async cpuprofile(ctx) {
    const t0 = process.hrtime.bigint();
    let x = 0;
    for (let i = 0; i < 1e6; i += 1) x += i;
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const cpu = process.cpuUsage();
    await ctx.m.reply(U.box('📊 CPU PROFILE', [
      `Loop 1e6: ${ms.toFixed(2)} ms`,
      `User CPU: ${(cpu.user / 1000).toFixed(1)} ms`,
      `System CPU: ${(cpu.system / 1000).toFixed(1)} ms`,
      `Cores: ${os.cpus().length}`,
      `Load: ${os.loadavg()[0].toFixed(2)}`
    ]));
  },

  async pingdb(ctx) {
    try {
      const mongoose = require('mongoose');
      const t0 = Date.now();
      await mongoose.connection.db.admin().ping();
      await ctx.m.reply(`🗄️ *MongoDB ping:* ${Date.now() - t0}ms ✅`);
    } catch (e) {
      await ctx.m.reply(`❌ DB ping failed: ${e.message}`);
    }
  },

  async healthcheck(ctx) {
    const mem = process.memoryUsage();
    const mongoose = require('mongoose');
    const dbUp = mongoose.connection.readyState === 1;
    await ctx.m.reply(U.box('🩺 HEALTH CHECK', [
      `Bot: ✅ running`,
      `Uptime: ${uptimeHuman(process.uptime())}`,
      `DB: ${dbUp ? '✅ connected' : '❌ disconnected'}`,
      `Heap: ${bytes(mem.heapUsed)} / ${bytes(mem.heapTotal)}`,
      `Load: ${os.loadavg()[0].toFixed(2)}`,
      `Node: ${process.version}`,
      `Errors logged: ${(global.__SAQIB_ERRORS || []).length}`
    ]));
  },

  async session(ctx) {
    const dirs = ['/app/session', 'session', './session'];
    const found = dirs.find((d) => { try { return fs.existsSync(d); } catch (_) { return false; } });
    let files = [];
    if (found) { try { files = fs.readdirSync(found); } catch (_) {} }
    await ctx.m.reply(U.box('🔑 SESSION', [
      `Directory: ${found || 'not found'}`,
      `Files: ${files.length}`,
      files.slice(0, 8).map((f) => `• ${f}`).join('\n') || '—'
    ]));
  },

  async cluster(ctx) {
    await ctx.m.reply(U.box('🧩 CLUSTER', [
      `PID: ${process.pid}`,
      `PPID: ${process.ppid}`,
      `Workers: 1 (single process)`,
      `Platform: ${os.platform()} ${os.arch()}`,
      `Railway: ${process.env.RAILWAY_ENVIRONMENT ? 'yes' : 'no'}`
    ]));
  },

  async nodeversion(ctx) {
    await ctx.m.reply(`🟩 *Node.js*\n\nVersion: ${process.version}\nV8: ${process.versions.v8}\nOpenSSL: ${process.versions.openssl}`);
  },

  async envcheck(ctx) {
    const required = ['MONGO_URI', 'GEMINI_API_KEY', 'OWNER_NUMBER'];
    const optional = ['WEATHER_API_KEY', 'SESSION_ID', 'PREFIX', 'BOT_NAME'];
    const lines = [];
    for (const k of required) lines.push(`${process.env[k] || U.config[k] ? '✅' : '❌'} ${k} (required)`);
    for (const k of optional) lines.push(`${process.env[k] || U.config[k] ? '✅' : '⚠️'} ${k} (optional)`);
    await ctx.m.reply(`🔧 *Environment check*\n\n${lines.join('\n')}`);
  }
};

module.exports = { handlers, bytes, uptimeHuman, sh };
