const axios = require('axios');
const config = require('../config');
const { askGemini } = require('../lib/gemini');

// SAQIB-MD: single central Gemini client (model fallback + retry handled inside).
async function askGeminiAssistant(systemPrompt, userText) {
  const answer = await askGemini(userText, {
    systemPrompt: `${systemPrompt}\n\nAlways answer in the same language the user wrote in (Roman Urdu / Urdu / English). Plain text only.`
  });

  if (answer) return answer;

  // Last-resort free endpoint (no key needed) so the command never dies.
  const fallback = await axios.get(
    `https://api.giftedtech.my.id/api/ai/gpt4?apikey=gifted&q=${encodeURIComponent(userText)}`,
    { timeout: 15000 }
  ).catch(() => null);

  return fallback?.data?.result || '⚠️ AI service is temporarily unavailable. Please try again in a moment.';
}

module.exports = {
  name: 'ai_writing',
  commands: ['summarize', 'rephrase', 'rewrite', 'grammar', 'fix', 'code', 'lyrics', 'recipe'],
  execute: async (sock, m, { command, args, prefix }) => {
    const inputText = args.join(' ') || (m.quoted ? m.quoted.text : '');

    switch (command) {
      case 'summarize': {
        if (!inputText) return m.reply(`❓ Quote a long message or provide text to summarize!\nExample: *${prefix}summarize [long article]*`);
        await m.react('📝');
        const prompt = "Summarize the following text clearly in concise bullet points with key takeaways in plain English/Urdu:";
        const res = await askGeminiAssistant(prompt, inputText);
        await m.reply(`📑 *── SUMMARY & KEY TAKEAWAYS ──* 📑\n\n${res}`);
        break;
      }

      case 'rephrase':
      case 'rewrite': {
        if (!inputText) return m.reply(`❓ Quote a message or provide text to rephrase professionally!\nExample: *${prefix}rephrase [your message]*`);
        await m.react('✍️');
        const prompt = "Rewrite and rephrase the following message into 3 different high-impact styles: (1) Professional Business, (2) Casual & Friendly, (3) Persuasive & Elegant:";
        const res = await askGeminiAssistant(prompt, inputText);
        await m.reply(`✍️ *── REPHRASED VARIATIONS ──* ✍️\n\n${res}`);
        break;
      }

      case 'grammar':
      case 'fix': {
        if (!inputText) return m.reply(`❓ Quote or provide sentence to correct grammar and spelling!`);
        await m.react('🔍');
        const prompt = "Check this text for grammar, punctuation, and spelling errors. Provide: (1) Corrected Version, (2) Brief list of fixes made:";
        const res = await askGeminiAssistant(prompt, inputText);
        await m.reply(`✅ *── GRAMMAR & SPELL CHECK ──* ✅\n\n${res}`);
        break;
      }

      case 'code': {
        if (!inputText) return m.reply(`❓ Specify programming language and what you want to code!\n*Example:* *${prefix}code Python create a REST API with Express or FastAPI*`);
        await m.react('💻');
        const prompt = "You are an expert senior software engineer. Write clean, modular, production-ready code with concise comments:";
        const res = await askGeminiAssistant(prompt, inputText);
        await m.reply(`💻 *── CODE SNIPPET (Saqib-MD) ──* 💻\n\n${res}`);
        break;
      }

      case 'lyrics': {
        const query = args.join(' ');
        if (!query) return m.reply(`❓ Enter song or naat title to fetch lyrics!\nExample: *${prefix}lyrics Dil Dil Pakistan*`);
        await m.react('🎵');
        try {
          const res = await axios.get(`https://api.giftedtech.my.id/api/search/lyrics?apikey=gifted&query=${encodeURIComponent(query)}`).catch(() => null);
          if (res?.data?.result?.lyrics) {
            await m.reply(`🎶 *── LYRICS: ${query.toUpperCase()} ──* 🎶\n\n${res.data.result.lyrics}`);
          } else {
            const prompt = `Provide the full authentic lyrics for the song/naat: "${query}":`;
            const aiLyrics = await askGeminiAssistant(prompt, query);
            await m.reply(`🎶 *── LYRICS: ${query.toUpperCase()} ──* 🎶\n\n${aiLyrics}`);
          }
        } catch (e) {
          await m.reply('❌ Failed to fetch lyrics: ' + e.message);
        }
        break;
      }

      case 'recipe': {
        const dish = args.join(' ');
        if (!dish) return m.reply(`❓ Enter dish name to get recipe!\nExample: *${prefix}recipe Chicken Biryani*`);
        await m.react('🍳');
        const prompt = `Provide an authentic step-by-step cooking recipe for: "${dish}". Include prep time, ingredients list, and clear numbered cooking steps:`;
        const recipe = await askGeminiAssistant(prompt, dish);
        await m.reply(`🍳 *── CHEF RECIPE: ${dish.toUpperCase()} ──* 🍳\n\n${recipe}`);
        break;
      }
    }
  }
};
