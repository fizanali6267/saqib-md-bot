const axios = require('axios');
const config = require('../config');

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
        if (!prompt) return m.reply(`❓ Sawal likhein!\nMaslan: *${prefix}ai Pakistan ka sab se bara shehar konsa hai?*`);

        await m.reply(config.MESSAGES.WAIT);

        try {
          // Priority 1: Official Google Gemini 1.5 Flash API (Supports both query param & x-goog-api-key header)
          if (config.GEMINI_API_KEY) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.GEMINI_API_KEY}`;
            const res = await axios.post(url, {
              contents: [{ parts: [{ text: prompt }] }]
            }, {
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': config.GEMINI_API_KEY
              }
            });

            if (res.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
              const answer = res.data.candidates[0].content.parts[0].text;
              return await m.reply(`⚡ *Gemini AI (Saqib-MD):*\n\n${answer}`);
            }
          }

          // Priority 2: OpenAI API (if set)
          if (config.OPENAI_API_KEY) {
            const res = await axios.post('https://api.openai.com/v1/chat/completions', {
              model: 'gpt-3.5-turbo',
              messages: [{ role: 'user', content: prompt }]
            }, {
              headers: { Authorization: `Bearer ${config.OPENAI_API_KEY}` }
            });
            return await m.reply(`🤖 *ChatGPT (Saqib-MD):*\n\n${res.data.choices[0].message.content}`);
          }

          // Priority 3: Built-in Free AI Endpoint (No Key Required)
          const res = await axios.get(`https://api.giftedtech.my.id/api/ai/gpt4?apikey=gifted&q=${encodeURIComponent(prompt)}`)
            .catch(() => null);

          if (res && res.data && res.data.result) {
            await m.reply(`🤖 *Saqib-MD AI:*\n\n${res.data.result}`);
          } else {
            const fallback = await axios.get(`https://api.duckduckgo.com/?q=${encodeURIComponent(prompt)}&format=json`).catch(() => null);
            const ans = fallback?.data?.AbstractText || `Aapka sawal tha: "${prompt}". AI service is online and ready!`;
            await m.reply(`🤖 *Saqib-MD AI:*\n\n${ans}`);
          }
        } catch (e) {
          try {
            const res = await axios.get(`https://api.giftedtech.my.id/api/ai/gpt4?apikey=gifted&q=${encodeURIComponent(prompt)}`);
            if (res?.data?.result) {
              return await m.reply(`🤖 *Saqib-MD AI:*\n\n${res.data.result}`);
            }
          } catch (_) {}
          await m.reply('❌ AI response error: ' + (e.response?.data?.error?.message || e.message));
        }
        break;
      }

      case 'imagine': {
        if (!query) return m.reply(`❓ Tasveer banane ke liye description likhein!\nMaslan: *${prefix}imagine futuristic city in Pakistan with neon lights*`);
        await m.reply(config.MESSAGES.WAIT);

        try {
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
          await m.reply(`❌ "${city}" ka weather data nahi mila. City spelling check karein.`);
        }
        break;
      }

      case 'google': {
        if (!query) return m.reply(`❓ Search query enter karein!\nMaslan: *${prefix}google ICC Champions Trophy*`);
        await m.reply(`🔍 *Google Search for:* "${query}"\nhttps://www.google.com/search?q=${encodeURIComponent(query)}`);
        break;
      }

      case 'calc': {
        if (!query) return m.reply(`❓ Hisab karne ke liye formula likhein!\nMaslan: *${prefix}calc 500 * 12 + 250*`);
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
        if (!query || !query.startsWith('http')) return m.reply(`❓ Valid web URL enter karein!\nMaslan: *${prefix}shorturl https://example.com/long-page*`);
        try {
          const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(query)}`);
          await m.reply(`🔗 *Shortened URL:*\n${res.data}`);
        } catch (e) {
          await m.reply('❌ Link short karne mein error: ' + e.message);
        }
        break;
      }

      case 'define': {
        if (!query) return m.reply(`❓ Lafz likhein jiska matlab jan-na hai!\nMaslan: *${prefix}define algorithm*`);
        try {
          const res = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(query)}`);
          const data = res.data[0];
          const definition = data.meanings[0].definitions[0].definition;
          await m.reply(`📖 *Word:* ${data.word}\n\n📚 *Definition:*\n${definition}`);
        } catch (e) {
          await m.reply(`❌ "${query}" ki dictionary definition nahi mila.`);
        }
        break;
      }
    }
  }
};
