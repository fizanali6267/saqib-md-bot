const config = require('../config');

const riddles = [
  { q: "What has keys, but no locks; space, but no room; you can enter, but never go in?", a: "A Keyboard" },
  { q: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?", a: "An Echo" },
  { q: "What is seen in the middle of March and April that can’t be seen at the beginning or end of either month?", a: "The letter 'R'" },
  { q: "You see a boat filled with people. It has not sunk, but when you look again you don’t see a single person on the boat. Why?", a: "All the people were married!" },
  { q: "The more of this there is, the less you see. What is it?", a: "Darkness" }
];

const truths = [
  "What is the most embarrassing thing currently in your browser search history?",
  "Have you ever lied to get out of hanging out with friends?",
  "What is the biggest secret you have kept from your family?",
  "Who was your first crush?",
  "What is the weirdest habit you have when you are alone?"
];

const dares = [
  "Send a voice note to this chat singing your favorite song for 10 seconds!",
  "Change your WhatsApp About/Bio to 'Saqib-MD is the greatest bot' for 1 hour!",
  "Send a funny selfie sticker to this group right now!",
  "Text your best friend and tell them you bought an elephant!",
  "Call someone and say nothing for 5 seconds, then hang up!"
];

const facts = [
  "Honey never spoils. Archaeologists have found pots of honey in ancient Egyptian tombs that are over 3,000 years old and still perfectly edible!",
  "Bananas are curved because they grow towards the sun against gravity, a process known as negative geotropism.",
  "Octopuses have three hearts and blue blood!",
  "A day on Venus is longer than a year on Venus.",
  "The heart of a blue whale is the size of a small car!"
];

const quotes = [
  "“The only way to do great work is to love what you do.” – Steve Jobs",
  "“Believe you can and you're halfway there.” – Theodore Roosevelt",
  "“Success is not final, failure is not fatal: it is the courage to continue that counts.” – Winston Churchill",
  "“Your time is limited, so don't waste it living someone else's life.” – Steve Jobs"
];

const roasts = [
  (u) => `@${u}, you're like a cloud. When you disappear, it's a beautiful day! ☀️`,
  (u) => `@${u}, I'd agree with you but then we'd both be wrong. 😂`,
  (u) => `@${u}, you have something on your chin... no, the 3rd one down! 💀`,
  (u) => `@${u}, mirrors can't talk, and lucky for you, they can't laugh either! 🪞`
];

module.exports = {
  name: 'games_fun',
  commands: ['truth', 'dare', 'paheli', 'riddle', 'quote', 'fact', 'coin', 'flip', 'dice', 'roll', 'ship', 'match', 'roast'],
  execute: async (sock, m, { command, args, prefix }) => {
    switch (command) {
      case 'truth': {
        await m.react('🤔');
        const q = truths[Math.floor(Math.random() * truths.length)];
        await m.reply(`🎭 *── TRUTH CHALLENGE ──* 🎭\n\n👉 *Question:* ${q}\n\n_Answer honestly in chat!_`);
        break;
      }

      case 'dare': {
        await m.react('🔥');
        const d = dares[Math.floor(Math.random() * dares.length)];
        await m.reply(`💥 *── DARE CHALLENGE ──* 💥\n\n👉 *Your Dare:* ${d}\n\n_No backing out allowed!_`);
        break;
      }

      case 'paheli':
      case 'riddle': {
        await m.react('🧩');
        const r = riddles[Math.floor(Math.random() * riddles.length)];
        const readMore = String.fromCharCode(8206).repeat(4001);
        await m.reply(`🧩 *── BRAIN RIDDLE / PAHELI ──* 🧩\n\n❓ *Question:*\n${r.q}\n${readMore}\n\n💡 *Answer:* || ${r.a} ||`);
        break;
      }

      case 'quote': {
        await m.react('✨');
        const q = quotes[Math.floor(Math.random() * quotes.length)];
        await m.reply(`📜 *── QUOTE OF THE DAY ──* 📜\n\n${q}`);
        break;
      }

      case 'fact': {
        await m.react('🧠');
        const f = facts[Math.floor(Math.random() * facts.length)];
        await m.reply(`💡 *── DID YOU KNOW? ──* 💡\n\n${f}`);
        break;
      }

      case 'coin':
      case 'flip': {
        await m.react('🪙');
        const result = Math.random() < 0.5 ? 'HEADS 👑' : 'TAILS 🦅';
        await m.reply(`🪙 *Coin Toss Result:*\n\n✨ *${result}*`);
        break;
      }

      case 'dice':
      case 'roll': {
        await m.react('🎲');
        const diceNum = Math.floor(Math.random() * 6) + 1;
        const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
        await m.reply(`🎲 *Dice Roll Result:*\n\n${diceEmojis[diceNum - 1]} You rolled a *${diceNum}*!`);
        break;
      }

      case 'ship':
      case 'match': {
        const mentions = m.mentionedJid;
        if (!mentions || mentions.length < 2) {
          return m.reply(`❓ Tag two people to calculate their love compatibility!\n*Example:* *${prefix}ship @user1 @user2*`);
        }
        await m.react('💖');
        const u1 = mentions[0].split('@')[0];
        const u2 = mentions[1].split('@')[0];
        const percent = Math.floor(Math.random() * 60) + 40; // 40% to 100%

        let bar = '💖'.repeat(Math.floor(percent / 10)) + '🖤'.repeat(10 - Math.floor(percent / 10));

        let comment = "Perfect Match Made in Heaven! 💍";
        if (percent < 60) comment = "Cute Friendship! Needs effort. ✨";
        else if (percent < 80) comment = "Great Chemistry & High Compatibility! 🥰";

        const msg = `💘 *── LOVE COMPATIBILITY SHIP ──* 💘\n\n` +
          `👩‍❤️‍👨 *@${u1}*  x  *@${u2}*\n\n` +
          `📊 *Love Meter:* ${percent}%\n` +
          `[${bar}]\n\n` +
          `💬 *Verdict:* ${comment}`;

        await sock.sendMessage(m.chat, { text: msg, mentions }, { quoted: m });
        break;
      }

      case 'roast': {
        const target = m.mentionedJid[0] || (m.quoted ? m.quoted.sender : null);
        if (!target) return m.reply(`❓ Mention someone to roast them!\nExample: *${prefix}roast @user*`);
        await m.react('🔥');
        const targetNum = target.split('@')[0];
        const roastGen = roasts[Math.floor(Math.random() * roasts.length)];
        await sock.sendMessage(m.chat, {
          text: `🔥 *── PLAYFUL ROAST ──* 🔥\n\n${roastGen(targetNum)}`,
          mentions: [target]
        }, { quoted: m });
        break;
      }
    }
  }
};
