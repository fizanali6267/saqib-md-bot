const axios = require('axios');
const config = require('../config');
const { askGemini, askGeminiImage, isKeyConfigured } = require('../lib/gemini');

module.exports = {
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

          // Priority 2: free public generator (no key needed)
          const imageUrl = `https://api.giftedtech.my.id/api/ai/flux?apikey=gifted&prompt=${encodeURIComponent(query)}`;
          await sock.sendMessage(m.chat, {
            image: { url: imageUrl },
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
        await m.reply(`🔍 *Google Search for:* "${query}"\nhttps://www.google.com/search?q=${encodeURIComponent(query)}`);
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
        try {
          const res = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(query)}`);
          const data = res.data[0];
          const definition = data.meanings[0].definitions[0].definition;
          await m.reply(`📖 *Word:* ${data.word}\n\n📚 *Definition:*\n${definition}`);
        } catch (e) {
          await m.reply(`❌ "${query}"  dictionary definition was not found.`);
        }
        break;
      }
    }
  }
};
