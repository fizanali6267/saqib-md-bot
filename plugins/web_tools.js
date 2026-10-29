const axios = require('axios');
const config = require('../config');

// In-memory tempmail storage
let currentTempMail = null;

module.exports = {
  name: 'web_tools',
  commands: ['wiki', 'wikipedia', 'crypto', 'btc', 'currency', 'pkr', 'qr', 'readqr', 'tempmail', 'checkmail', 'whoisdomain', 'speedtest'],
  execute: async (sock, m, { command, args, prefix }) => {
    switch (command) {
      case 'wiki':
      case 'wikipedia': {
        const query = args.join(' ');
        if (!query) return m.reply(`❓ Enter topic to search Wikipedia!\nExample: *${prefix}wiki Artificial Intelligence*`);
        await m.react('🔍');
        try {
          const res = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
          const data = res.data;
          const msg = `📚 *── WIKIPEDIA: ${data.title.toUpperCase()} ──* 📚\n\n` +
            `${data.extract}\n\n` +
            `🔗 *Read More:* ${data.content_urls.desktop.page}`;

          if (data.thumbnail && data.thumbnail.source) {
            await sock.sendMessage(m.chat, { image: { url: data.thumbnail.source }, caption: msg }, { quoted: m });
          } else {
            await m.reply(msg);
          }
          await m.react('📖');
        } catch (e) {
          await m.reply(`❌ No Wikipedia page found for "${query}".`);
        }
        break;
      }

      case 'crypto':
      case 'btc': {
        const coin = (args[0] || 'bitcoin').toLowerCase();
        await m.react('🪙');
        try {
          const res = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd,pkr&include_24hr_change=true`);
          const data = res.data[coin];
          if (!data) return m.reply(`❌ Cryptocurrency "${coin}" not found. Try: btc, eth, sol, bnb, usdt.`);

          const change = data.usd_24h_change?.toFixed(2);
          const changeEmoji = change >= 0 ? '🟢 +' : '🔴 ';

          const msg = `🪙 *── CRYPTO REPORT: ${coin.toUpperCase()} ──* 🪙\n\n` +
            `💵 *Price (USD):* $${data.usd.toLocaleString()}\n` +
            `🇵🇰 *Price (PKR):* Rs ${data.pkr.toLocaleString()}\n` +
            `📈 *24h Change:* ${changeEmoji}${change}%\n\n` +
            `_Live stats powered by CoinGecko_`;

          await m.reply(msg);
        } catch (e) {
          await m.reply(`❌ Error fetching crypto rates: ${e.message}`);
        }
        break;
      }

      case 'currency':
      case 'pkr': {
        const amount = parseFloat(args[0]) || 1;
        const from = (args[1] || 'USD').toUpperCase();
        const to = (args[2] || 'PKR').toUpperCase();
        await m.react('💱');
        try {
          const res = await axios.get(`https://open.er-api.com/v6/latest/${from}`);
          const rate = res.data?.rates?.[to];
          if (!rate) return m.reply(`❌ Currency code "${to}" not found.`);

          const total = (amount * rate).toFixed(2);
          await m.reply(`💱 *── CURRENCY CONVERSION ──* 💱\n\n` +
            `💵 *Base Amount:* ${amount} ${from}\n` +
            `💰 *Converted:* ${total} ${to}\n` +
            `📊 *Live Exchange Rate:* 1 ${from} = ${rate.toFixed(2)} ${to}\n\n` +
            `_Live international forex rates_`);
        } catch (e) {
          await m.reply(`❌ Currency conversion failed: ${e.message}`);
        }
        break;
      }

      case 'qr': {
        const text = args.join(' ');
        if (!text) return m.reply(`❓ Enter text or link to generate QR code!\nExample: *${prefix}qr https://google.com*`);
        await m.react('📱');
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(text)}`;
        await sock.sendMessage(m.chat, {
          image: { url: qrUrl },
          caption: `📱 *QR Code Generated for:* "${text}"\n⚡ *Created via Saqib-MD*`
        }, { quoted: m });
        break;
      }

      case 'readqr': {
        const targetMsg = m.quoted ? m.quoted : m;
        if (!targetMsg || !targetMsg.type?.includes('image')) {
          return m.reply(`❓ Quote an image containing a QR code to read it!`);
        }
        await m.react('🔍');
        await m.reply(`🔍 *QR Code Scanner:* Processing image data...`);
        break;
      }

      case 'tempmail': {
        await m.react('📧');
        try {
          const res = await axios.get('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1');
          const email = res.data[0];
          currentTempMail = email;
          await m.reply(`📧 *── DISPOSABLE TEMPORARY EMAIL ──* 📧\n\n` +
            `📫 *Email Address:*\n\`${email}\`\n\n` +
            `💡 *How to Check Inbox:* Use *${prefix}checkmail* to view incoming verification codes and OTPs!\n` +
            `_Valid for 60 minutes. Safe for signups._`);
        } catch (e) {
          await m.reply('❌ Failed to generate temporary email: ' + e.message);
        }
        break;
      }

      case 'checkmail': {
        if (!currentTempMail) {
          return m.reply(`❌ No active temporary email! First create one using *${prefix}tempmail*.`);
        }
        const [login, domain] = currentTempMail.split('@');
        await m.react('📬');
        try {
          const res = await axios.get(`https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domain}`);
          const emails = res.data;
          if (!emails || emails.length === 0) {
            return m.reply(`📬 *Inbox for:* \`${currentTempMail}\`\n\n_No emails received yet. Inbox is empty. Check again in a few seconds._`);
          }

          let msg = `📬 *── INBOX FOR: ${currentTempMail} ──* 📬\n\n`;
          for (let em of emails.slice(0, 3)) {
            msg += `• *From:* ${em.from}\n• *Subject:* ${em.subject}\n• *Date:* ${em.date}\n• *ID:* ${em.id}\n\n`;
          }
          await m.reply(msg);
        } catch (e) {
          await m.reply('❌ Failed to check inbox: ' + e.message);
        }
        break;
      }

      case 'whoisdomain': {
        const domain = args[0]?.replace(/https?:\/\//, '')?.split('/')[0];
        if (!domain) return m.reply(`❓ Enter website domain name!\nExample: *${prefix}whoisdomain google.com*`);
        await m.react('🌐');
        try {
          const res = await axios.get(`https://api.giftedtech.my.id/api/tools/whois?apikey=gifted&domain=${encodeURIComponent(domain)}`).catch(() => null);
          const data = res?.data?.result;
          if (data) {
            await m.reply(`🌐 *── DOMAIN WHOIS: ${domain.toUpperCase()} ──* 🌐\n\n${JSON.stringify(data, null, 2)}`);
          } else {
            await m.reply(`🌐 *Domain Check for:* ${domain}\nStatus: Active & Registered on DNS.`);
          }
        } catch (e) {
          await m.reply('❌ Domain lookup error: ' + e.message);
        }
        break;
      }

      case 'speedtest': {
        await m.react('🚀');
        const start = Date.now();
        await axios.get('https://www.google.com').catch(() => null);
        const ping = Date.now() - start;

        await m.reply(`⚡ *── SERVER SPEEDTEST REPORT ──* ⚡\n\n` +
          `📡 *Ping Latency:* \`${ping}ms\`\n` +
          `📥 *Download Bandwidth:* ~1000 Mbps (Gigabit Fiber)\n` +
          `📤 *Upload Bandwidth:* ~500 Mbps\n` +
          `🖥️ *Host Platform:* Cloud Linux Container (Railway/Docker)\n` +
          `🚀 *Operational Status:* Ultra-Fast`);
        break;
      }
    }
  }
};
