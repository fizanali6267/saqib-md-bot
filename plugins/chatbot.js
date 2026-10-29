const axios = require('axios');
const config = require('../config');

// In-memory conversation context per user/chat (stores last 5 messages)
const chatMemory = new Map();

async function generateChatbotReply(userMessage, userName = 'Friend') {
  const systemPrompt = `You are "Saqib-MD", a super friendly, witty, smart, and human-like AI companion created by "Saqib Iqbal".
Instructions:
1. Talk like an authentic, caring Pakistani friend in Roman Urdu, Urdu, or English matching the user's vibe.
2. NEVER use robotic corporate lines like "Main aapki kya madad kar sakta hoon?" or "How may I assist you today?". Talk like a real best buddy.
3. Your creator and owner is Saqib Iqbal. If someone asks about Saqib or who made you, proudly explain that Saqib Iqbal is your developer and boss.
4. Keep replies natural, concise, warm, and interactive with light humor.
5. User's name is ${userName}.`;

  try {
    if (config.GEMINI_API_KEY) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.GEMINI_API_KEY}`;
      const res = await axios.post(url, {
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\nUser Message: "${userMessage}"` }] }
        ]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.GEMINI_API_KEY
        }
      });

      const reply = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (reply) return reply.trim();
    }

    // High-speed fallback
    const fallback = await axios.get(`https://api.giftedtech.my.id/api/ai/gpt4?apikey=gifted&q=${encodeURIComponent(userMessage)}`).catch(() => null);
    if (fallback?.data?.result) return fallback.data.result;

    return `Han mere bhai, kya haal chaal hain? Saqib bhai ne mujhe aapke sath gup shup ke liye active kiya hua hai! Bolo kya chal raha hai?`;
  } catch (err) {
    return `Suno dost, network mein thori thakan aa gayi hai, par main yahan hoon! Kaho kya baat hai?`;
  }
}

module.exports = {
  name: 'chatbot',
  commands: ['chatbot', 'botchat'],
  generateChatbotReply,
  execute: async (sock, m, { command, args, prefix }) => {
    // Only owner can toggle bot global chat behavior
    const isOwner = m.fromMe || m.sender.includes(config.OWNER_NUMBER);
    if (!isOwner) return m.reply(config.MESSAGES.OWNER_ONLY);

    const target = args[0]?.toLowerCase();
    const state = args[1]?.toLowerCase();

    if (target === 'pm' || target === 'dm') {
      if (state === 'on') {
        config.CHATBOT_PM = true;
        await m.reply(`🤖 *CHATBOT INBOX (PM) MODE: ON!*\nAb Private DM mein Saqib-MD doston ke sath bilkul human dost ki tarah auto guftagu karega.`);
      } else if (state === 'off') {
        config.CHATBOT_PM = false;
        await m.reply(`🤖 *CHATBOT INBOX (PM) MODE: OFF!*\nPrivate DM mein auto-reply band kar diya gaya hai.`);
      } else {
        await m.reply(`Usage: *${prefix}chatbot pm on* ya *${prefix}chatbot pm off*`);
      }
    } else if (target === 'group' || target === 'gc') {
      if (state === 'on') {
        config.CHATBOT_GROUP = true;
        await m.reply(`🤖 *CHATBOT GROUP MODE: ON!*\nAb groups mein aane wale non-command messages par Saqib-MD smart friendly answers dega.`);
      } else if (state === 'off') {
        config.CHATBOT_GROUP = false;
        await m.reply(`🤖 *CHATBOT GROUP MODE: OFF!*\nGroups mein auto-chat band kar di gayi hai (sirf commands par kaam karega).`);
      } else {
        await m.reply(`Usage: *${prefix}chatbot group on* ya *${prefix}chatbot group off*`);
      }
    } else {
      await m.reply(`🤖 *── SAQIB-MD FRIENDLY CHATBOT SETTINGS ──* 🤖\n\n` +
        `• *Private DM Chatbot:* ${config.CHATBOT_PM ? 'ON ✅' : 'OFF ❌'}\n` +
        `• *Group Chatbot:* ${config.CHATBOT_GROUP ? 'ON ✅' : 'OFF ❌'}\n` +
        `• *AI Brain:* Google Gemini 1.5 Flash (Ultra Human Tone)\n` +
        `• *Developer Knowledge:* Saqib Iqbal\n\n` +
        `📌 *Controls:*\n` +
        `◦ *${prefix}chatbot pm on / off* (Inbox mein auto baat cheet)\n` +
        `◦ *${prefix}chatbot group on / off* (Groups mein auto baat cheet)`);
    }
  }
};
