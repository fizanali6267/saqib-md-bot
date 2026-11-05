const axios = require('axios');
const config = require('../config');
const { askGemini, askGeminiImage, isKeyConfigured } = require('../lib/gemini');

// ---------------------------------------------------------------------------
// Web search. Google/DuckDuckGo/Brave/Mojeek all block datacenter IPs, and
// Bing's HTML endpoint returns "no results" for multi-word queries from this
// network. Yahoo Search (Bing-backed) works reliably, so it is primary and
// Bing is kept as a fallback.
// ---------------------------------------------------------------------------
function decodeYahooUrl(href) {
  try {
    const m = String(href || '').match(/\/RU=([^/]+)\//);
    if (m) return decodeURIComponent(m[1]);
  } catch (_) {}
  return href || '';
}

function decodeBingUrl(href) {
  try {
    if (!href) return '';
    if (!href.includes('bing.com/ck/a')) return href;
    const u = new URL(href);
    const raw = u.searchParams.get('u') || '';
    if (!raw.startsWith('a1')) return href;
    const b64 = raw.slice(2).replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    return /^https?:\/\//.test(decoded) ? decoded : href;
  } catch (_) {
    return href;
  }
}

const SEARCH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function yahooSearch(query, limit = 6) {
  const cheerio = require('cheerio');
  const res = await axios.get('https://search.yahoo.com/search', {
    params: { p: query },
    headers: { 'User-Agent': SEARCH_UA, 'Accept-Language': 'en-US,en;q=0.9' },
    timeout: 20000,
  });
  const $ = cheerio.load(res.data);
  const out = [];
  $('div.algo').each((_, el) => {
    if (out.length >= limit) return;
    const title = $(el).find('h3.title').first().text().replace(/\s+/g, ' ').trim();
    const url = decodeYahooUrl($(el).find('div.compTitle a').first().attr('href'));
    const snippet = $(el).find('.compText').first().text().replace(/\s+/g, ' ').trim();
    if (title && /^https?:\/\//.test(url)) out.push({ title, url, snippet });
  });
  return out;
}

async function bingSearch(query, limit = 6) {
  const cheerio = require('cheerio');
  const res = await axios.get('https://www.bing.com/search', {
    params: { q: query, count: 20, setlang: 'en' },
    headers: { 'User-Agent': SEARCH_UA, 'Accept-Language': 'en-US,en;q=0.9' },
    timeout: 20000,
  });
  const $ = cheerio.load(res.data);
  const out = [];
  $('li.b_algo').each((_, el) => {
    if (out.length >= limit) return;
    const a = $(el).find('h2 a').first();
    const title = a.text().trim();
    const url = decodeBingUrl(a.attr('href'));
    const snippet = $(el).find('.b_caption p, .b_algoSlug, p').first().text().trim();
    if (title && url) out.push({ title, url, snippet });
  });
  return out;
}

async function webSearch(query, limit = 6) {
  try {
    const r = await yahooSearch(query, limit);
    if (r.length) return r;
  } catch (_) {}
  return bingSearch(query, limit);
}

// ---------------------------------------------------------------------------
// Wiktionary REST API — free, no key, no Cloudflare challenge.
// ---------------------------------------------------------------------------
function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/"/g, '"')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function wiktionaryDefine(word) {
  const res = await axios.get(
    `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`,
    { headers: { 'User-Agent': 'SAQIB-MD-Bot/1.0 (WhatsApp bot)' }, timeout: 20000 }
  );
  const data = res.data || {};
  const entries = data.en || data[Object.keys(data)[0]];
  if (!Array.isArray(entries) || !entries.length) return null;

  const groups = [];
  for (const entry of entries) {
    const definitions = (entry.definitions || [])
      .map((d) => stripHtml(d.definition))
      .filter(Boolean);
    if (definitions.length) {
      groups.push({ partOfSpeech: entry.partOfSpeech, definitions });
    }
  }
  if (!groups.length) return null;
  return { word: word, phonetic: '', groups };
}

module.exports = {
  _internal: { yahooSearch, bingSearch, webSearch, wiktionaryDefine, stripHtml },
  name: 'ai_tools',
  commands: ['ai', 'gpt', 'gemini', 'imagine', 'weather', 'google', 'calc', 'shorturl', 'define'],
  execute: async (sock, m, { command, args, prefix }) => {
    const query = args.join(' ');

    switch (command) {
      case 'ai':
      case 'gpt':
      case 'gemini': {
        const prompt = query || (m.quoted ? m.quoted.text : '');
        if (!prompt) return m.reply(`❓ Please type your question!\nExample: *${prefix}ai What is the largest city in Pakistan?*`);

        await m.reply(config.MESSAGES.WAIT);

        try {
          // SAQIB-MD: poora bot sirf GEMINI par chalta hai (no OpenAI needed).
          // askGemini khud model-fallback (2.5 -> 2.0 -> 1.5) aur retry handle karta hai.
          const answer = await askGemini(prompt, {
            systemPrompt: 'You are SAQIB-MD, a helpful, friendly WhatsApp assistant created by Saqib Iqbal. Answer clearly and concisely. If the user writes in Roman Urdu or Urdu, reply in the same language. Use plain text only, no markdown headers.'
          });

          if (answer) {
            return await m.reply(`⚡ *Gemini AI (Saqib-MD):*\n\n${answer}`);
          }

          // Gemini key na ho ya saari models fail ho jayein -> free public endpoint
          const res = await axios.get(`https://api.giftedtech.my.id/api/ai/gpt4?apikey=gifted&q=${encodeURIComponent(prompt)}`, { timeout: 15000 })
            .catch(() => null);

          if (res && res.data && res.data.result) {
            await m.reply(`🤖 *Saqib-MD AI:*\n\n${res.data.result}`);
          } else if (!isKeyConfigured()) {
            await m.reply('⚠️ *AI key is not set.*\nThe bot owner needs to set the *GEMINI_API_KEY* environment variable.\nFree key: https://aistudio.google.com/apikey');
          } else {
            await m.reply('❌ The AI did not respond right now. Please try again in a moment.');
          }
        } catch (e) {
          if (e?.message === 'GEMINI_KEY_INVALID') {
            return await m.reply('🔑 *GEMINI_API_KEY is invalid.*\nOwner: create a new key at https://aistudio.google.com/apikey and update the environment variable.');
          }
          await m.reply('❌ AI response error: ' + (e.response?.data?.error?.message || e.message));
        }
        break;
      }

      case 'imagine': {
        if (!query) return m.reply(`❓ Write a description to generate an image!\nExample: *${prefix}imagine futuristic city in Pakistan with neon lights*`);
        await m.reply(config.MESSAGES.WAIT);

        try {
          // Priority 1: Gemini image model (Nano Banana) — same GEMINI_API_KEY.
          const inline = await askGeminiImage(query);
          if (inline) {
            await sock.sendMessage(m.chat, {
              image: inline,
              caption: `🎨 *AI Art Generated for:* "${query}"\n⚡ *Powered by Gemini · Saqib-MD*`
            }, { quoted: m });
            return;
          }

          // Priority 2: Pollinations.ai — free, keyless, reliable.
          const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(query)}?width=1024&height=1024&nologo=true&seed=${Date.now() % 100000}`;
          const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 120000 });
          const imgBuf = Buffer.from(imgRes.data);
          if (!imgBuf.length) throw new Error('empty image from generator');
          await sock.sendMessage(m.chat, {
            image: imgBuf,
            caption: `🎨 *AI Art Generated for:* "${query}"\n⚡ *Powered by Saqib-MD*`
          }, { quoted: m });
        } catch (e) {
          await m.reply('❌ Image generation failed: ' + e.message);
        }
        break;
      }

      case 'weather': {
        const city = query || 'Lahore';
        try {
          if (config.WEATHER_API_KEY) {
            const res = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${config.WEATHER_API_KEY}`);
            const data = res.data;
            return await m.reply(`🌤️ *── WEATHER REPORT: ${data.name}, ${data.sys.country} ──* 🌤️\n\n` +
              `🌡️ *Temperature:* ${data.main.temp}°C (Feels like ${data.main.feels_like}°C)\n` +
              `💧 *Humidity:* ${data.main.humidity}%\n` +
              `🌬️ *Wind:* ${data.wind.speed} m/s\n` +
              `☁️ *Sky:* ${data.weather[0].description.toUpperCase()}\n` +
              `⚡ *Speed:* Sub-Second OpenWeather API`);
          }

          let weatherUrl = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
          const res = await axios.get(weatherUrl);
          const current = res.data.current_condition[0];
          const area = res.data.nearest_area[0];

          await m.reply(`🌤️ *── WEATHER REPORT ──* 🌤️\n\n` +
            `📍 *City:* ${area.areaName[0].value}, ${area.country[0].value}\n` +
            `🌡️ *Temperature:* ${current.temp_C}°C (${current.temp_F}°F)\n` +
            `💧 *Humidity:* ${current.humidity}%\n` +
            `🌬️ *Wind:* ${current.windspeedKmph} km/h\n` +
            `☁️ *Condition:* ${current.weatherDesc[0].value}`);
        } catch (e) {
          await m.reply(`❌ "${city}"  weather data was not found. Please check the city spelling.`);
        }
        break;
      }

      case 'google': {
        if (!query) return m.reply(`❓ Enter a search query!\nExample: *${prefix}google ICC Champions Trophy*`);
        await m.react('🔍').catch(() => null);
        try {
          const results = await webSearch(query, 6);
          if (!results.length) throw new Error('no results');
          let out = `🔍 *── SEARCH RESULTS ──*\n📝 *Query:* ${query}\n\n`;
          results.forEach((r, i) => {
            out += `*${i + 1}. ${r.title}*\n${r.snippet ? r.snippet + '\n' : ''}🔗 ${r.url}\n\n`;
          });
          await m.reply(out.trim());
        } catch (e) {
          await m.reply(
            `❌ *Search failed:* ${e.message}\n\n🔗 Try directly:\nhttps://www.google.com/search?q=${encodeURIComponent(query)}`
          );
        }
        break;
      }

      case 'calc': {
        if (!query) return m.reply(`❓ Write the formula to calculate!\nExample: *${prefix}calc 500 * 12 + 250*`);
        try {
          const sanitized = query.replace(/[^0-9+\-*/(). ]/g, '');
          const result = Function(`'use strict'; return (${sanitized})`)();
          await m.reply(`🧮 *Result:* \`${result}\``);
        } catch (e) {
          await m.reply('❌ Invalid math expression!');
        }
        break;
      }

      case 'shorturl': {
        if (!query || !query.startsWith('http')) return m.reply(`❓ Enter a valid web URL!\nExample: *${prefix}shorturl https://example.com/long-page*`);
        try {
          const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(query)}`);
          await m.reply(`🔗 *Shortened URL:*\n${res.data}`);
        } catch (e) {
          await m.reply('❌ Link short karne mein error: ' + e.message);
        }
        break;
      }

      case 'define': {
        if (!query) return m.reply(`❓ Enter the word whose meaning you want to know!\nExample: *${prefix}define algorithm*`);
        const word = query.trim().split(/\s+/)[0];
        try {
          const def = await wiktionaryDefine(word);
          if (!def) throw new Error('not found');
          let out = `📖 *Word:* ${def.word}\n`;
          if (def.phonetic) out += `🔊 *Pronunciation:* ${def.phonetic}\n`;
          out += '\n';
          for (const group of def.groups.slice(0, 3)) {
            out += `📚 *${group.partOfSpeech || 'Definition'}*\n`;
            group.definitions.slice(0, 3).forEach((d, i) => {
              out += `${i + 1}. ${d}\n`;
            });
            out += '\n';
          }
          await m.reply(out.trim());
        } catch (e) {
          await m.reply(`❌ *"${word}"* — dictionary definition was not found.`);
        }
        break;
      }
    }
  }
};
