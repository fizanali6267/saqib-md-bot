const config = require('../config');
const { askGemini } = require('../lib/gemini');

// In-memory conversation context per user/chat (stores last 5 messages)
const chatMemory = new Map();

async function generateChatbotReply(userMessage, userName = 'Friend') {
  const systemPrompt = `You are "Saqib-MD", a super friendly, witty, smart, and human-like AI companion created by "Saqib Iqbal".
Instructions:
1. Always reply in clear, natural English that sounds like a real, caring friend. Never use robotic corporate lines.
2. NEVER use lines like "How may I assist you today?". Talk like a real best buddy.
3. Your creator and owner is Saqib Iqbal. If someone asks about Saqib or who made you, proudly explain that Saqib Iqbal is your developer and boss.
4. Keep replies natural, concise, warm, and interactive with light humor.
5. User's name is ${userName}.`;

  try {
    const reply = await askGemini(userMessage, { systemPrompt, timeoutMs: 20000 });
    if (reply) return reply.trim();
    return `Hey ${userName}! I'm here and ready to chat. What's on your mind?`;
  } catch (err) {
    return `Hey ${userName}, the network is a little tired right now, but I'm still here! What's up?`;
  }
}

module.exports = {
  name: 'chatbot',
  commands: ['chatbot', 'botchat'],
  generateChatbotReply,
  execute: async (sock, m, { command, args, prefix }) => {
    // Only owner can toggle bot global chat behavior
    const isOwner = config.checkIsOwner(m, sock);
    if (!isOwner) return m.reply(config.MESSAGES.OWNER_ONLY);

    const target = args[0]?.toLowerCase();
    const state = args[1]?.toLowerCase();

    if (target === 'pm' || target === 'dm') {
      if (state === 'on') {
        config.CHATBOT_PM = true;
        await m.reply(`🤖 *CHATBOT INBOX (PM) MODE: ON!*\nSaqib-MD will now auto-chat in private DMs just like a real human friend.`);
      } else if (state === 'off') {
        config.CHATBOT_PM = false;
        await m.reply(`🤖 *CHATBOT INBOX (PM) MODE: OFF!*\nAuto-reply in private DMs has been disabled.`);
      } else {
        await m.reply(`Usage: *${prefix}chatbot pm on* or *${prefix}chatbot pm off*`);
      }
    } else if (target === 'group' || target === 'gc') {
      if (state === 'on') {
        config.CHATBOT_GROUP = true;
        await m.reply(`🤖 *CHATBOT GROUP MODE: ON!*\nSaqib-MD will now reply to non-command messages in groups with smart, friendly answers.`);
      } else if (state === 'off') {
        config.CHATBOT_GROUP = false;
        await m.reply(`🤖 *CHATBOT GROUP MODE: OFF!*\nAuto-chat in groups has been disabled (commands only).`);
      } else {
        await m.reply(`Usage: *${prefix}chatbot group on* or *${prefix}chatbot group off*`);
      }
    } else {
      await m.reply(`🤖 *── SAQIB-MD FRIENDLY CHATBOT SETTINGS ──* 🤖\n\n` +
        `• *Private DM Chatbot:* ${config.CHATBOT_PM ? 'ON ✅' : 'OFF ❌'}\n` +
        `• *Group Chatbot:* ${config.CHATBOT_GROUP ? 'ON ✅' : 'OFF ❌'}\n` +
        `• *AI Brain:* Google Gemini (Ultra Human Tone)\n` +
        `• *Developer:* Saqib Iqbal\n\n` +
        `📌 *Controls:*\n` +
        `◦ *${prefix}chatbot pm on / off* (Auto-chat in inbox)\n` +
        `◦ *${prefix}chatbot group on / off* (Auto-chat in groups)`);
    }
  }
};
