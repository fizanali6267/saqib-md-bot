const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

// Issue 7 Fix: Global unhandled rejection and uncaught exception handlers prevent process crash
process.on('unhandledRejection', (err) => {
  console.error('⚠️ [CRASH GUARD] Unhandled Rejection detected:', err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ [CRASH GUARD] Uncaught Exception detected:', err?.message || err);
});

const config = require('./config');
const { serialize } = require('./lib/serialize');
const { useMongoDBAuthState } = require('./lib/mongoAuth');
const { resolveAlias } = require('./lib/aliasMap');
const pairRouter = require('./pair');
const { generateChatbotReply } = require('./plugins/chatbot');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Pairing API endpoint
app.use('/pair', pairRouter);

// Health check endpoint for Railway & Vercel
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    bot: config.BOT_NAME,
    owner: config.OWNER_NAME,
    uptime: process.uptime()
  });
});

// Load all command plugins with explicit fallback to guarantee 100% discovery
const plugins = [];
const defaultPluginFiles = [
  'general.js', 'group.js', 'security.js', 'downloader.js', 'converter.js',
  'ai_tools.js', 'owner.js', 'chatbot.js', 'reactions.js', 'status_saver.js',
  'utilities.js', 'islamic.js', 'ai_writing.js', 'audio_fx.js', 'web_tools.js',
  'group_advanced.js', 'privacy_tools.js', 'games_fun.js', 'media_makers.js',
  'voice_changers.js', 'search_engines.js', 'social_downloaders.js'
];

let scannedFiles = [];
try {
  scannedFiles = fs.readdirSync(path.join(__dirname, 'plugins')).filter(file => file.endsWith('.js'));
} catch (_) {}

const allPluginFiles = Array.from(new Set([...scannedFiles, ...defaultPluginFiles]));

for (const file of allPluginFiles) {
  const filePath = path.join(__dirname, 'plugins', file);
  if (!fs.existsSync(filePath)) continue;
  try {
    const plugin = require(filePath);
    plugins.push(plugin);
    console.log(`🔌 Loaded Plugin: ${plugin.name} (${plugin.commands.length} commands)`);
  } catch (err) {
    console.error(`Failed to load plugin ${file}:`, err);
  }
}

// In-memory message store for Anti-Delete
const messageStore = new Map();
let onlinePresenceInterval = null;
let autoBioInterval = null;
let currentSock = null;

async function startBot() {
  console.log(`🚀 Starting ${config.BOT_NAME}...`);

  let authState;
  const sessionDir = path.join(__dirname, 'session');

  if (config.MONGO_URI) {
    authState = await useMongoDBAuthState(config.MONGO_URI, config.SESSION_ID || 'saqib_md_session');
  } else {
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    authState = await useMultiFileAuthState(sessionDir);
  }

  const { state, saveCreds } = authState;
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: false,
    generateHighQualityLinkPreview: true
  });

  currentSock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      if (onlinePresenceInterval) clearInterval(onlinePresenceInterval);
      if (autoBioInterval) clearInterval(autoBioInterval);
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`Connection closed with code: ${statusCode}. Reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) {
        // Issue 7 Fix: Catch reconnect error to prevent unhandled rejection crash
        setTimeout(() => startBot().catch(err => console.error('Bot launch error:', err)), 5000);
      } else {
        console.log('❌ Device logged out. Please link your phone again.');
      }
    } else if (connection === 'open') {
      console.log(`✨ ${config.BOT_NAME} connected and ready to serve!`);

      // Always Online Heartbeat Loop (Cleaned up on reconnect)
      if (onlinePresenceInterval) clearInterval(onlinePresenceInterval);
      onlinePresenceInterval = setInterval(async () => {
        if (config.ALWAYS_ONLINE) {
          try {
            await sock.sendPresenceUpdate('available');
          } catch (_) {}
        }
      }, 25000);

      // Issue 10 Fix: Auto-Bio periodic enforcement
      if (autoBioInterval) clearInterval(autoBioInterval);
      autoBioInterval = setInterval(async () => {
        if (config.AUTO_BIO && sock?.user) {
          try {
            const time = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Karachi', hour12: true });
            const date = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Karachi' });
            await sock.updateProfileStatus(`${config.BOT_NAME} 24/7 Active | ${time} | ${date}`);
          } catch (_) {}
        }
      }, 60000);
    }
  });

  // Anti-Call Handler
  sock.ev.on('call', async (callEvents) => {
    if (!config.ANTI_CALL) return;
    for (const call of callEvents) {
      if (call.status === 'offer') {
        await sock.rejectCall(call.id, call.from);
        await sock.sendMessage(call.from, {
          text: `⚠️ *Calls are not allowed on this number!* You have been blocked by ${config.BOT_NAME}.`
        });
        await sock.updateBlockStatus(call.from, 'block');
      }
    }
  });

  // Message Handler
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (let rawMsg of messages) {
      if (!rawMsg.message) continue;

      const m = serialize(sock, rawMsg);

      // Auto Read (Blue Tick vs Double Grey Tick)
      if (config.AUTO_READ && m.key && !m.fromMe) {
        sock.readMessages([m.key]).catch(() => null);
      }

      // Store message in cache for Anti-Delete
      if (m.id && m.chat) {
        messageStore.set(m.id, {
          sender: m.sender,
          chat: m.chat,
          msg: rawMsg,
          time: Date.now()
        });
        if (messageStore.size > 2000) {
          const firstKey = messageStore.keys().next().value;
          messageStore.delete(firstKey);
        }
      }

      // Auto Status Read & Auto Status React
      if (m.chat === 'status@broadcast') {
        if (config.AUTO_STATUS_READ) {
          await sock.readMessages([m.key]).catch(() => null);
        }
        // Issue 9 Fix: WhatsApp requires statusJidList for status reactions to be delivered
        if (config.AUTO_STATUS_REACT) {
          try {
            const participant = m.key.participant || m.sender;
            await sock.sendMessage('status@broadcast', {
              react: {
                text: config.STATUS_REACT_EMOJI || '❤️',
                key: m.key
              }
            }, {
              statusJidList: [participant]
            });
          } catch (_) {}
        }
        continue;
      }

      // Issue 6 Fix: Detect viewOnce, viewOnceMessageV2, and viewOnceMessageV2Extension with accurate image/video type detection
      if ((config.AUTO_VIEW_ONCE || config.ANTI_VIEW_ONCE) && (m.isViewOnce || m.type === 'viewOnceMessage' || m.msg?.viewOnce)) {
        try {
          const buffer = await m.download();
          const mediaType = (m.type?.includes('image') || m.msg?.mimetype?.includes('image')) ? 'image' : 'video';
          const ownerJid = config.getOwnerJid(sock);
          const senderNum = m.sender.split('@')[0].split(':')[0];

          if (ownerJid) {
            await sock.sendMessage(ownerJid, {
              [mediaType]: buffer,
              caption: `🔓 *── AUTO VIEW-ONCE RECOVERED ──* 🔓\n\n` +
                       `👤 *Sent by:* @${senderNum}\n` +
                       `💬 *Chat:* ${m.isGroup ? 'Group Chat' : 'Direct Message'}\n` +
                       `🕒 *Time:* ${new Date().toLocaleTimeString()}\n\n` +
                       `_Saved secretly to your inbox by Saqib-MD_`,
              mentions: [m.sender]
            });
          }
        } catch (err) {
          console.error('Auto view-once recovery failed:', err);
        }
      }

      // Automatic Status Media Saver to Inbox when you reply to ANY status
      if (m.fromMe && m.quoted && (m.msg?.contextInfo?.remoteJid === 'status@broadcast' || m.quoted.chat === 'status@broadcast')) {
        if (m.quoted.type?.includes('image') || m.quoted.type?.includes('video') || m.quoted.isViewOnce) {
          try {
            const buffer = await m.quoted.download();
            const mediaType = (m.quoted.type?.includes('image') || m.quoted.msg?.mimetype?.includes('image')) ? 'image' : 'video';
            const ownerJid = config.getOwnerJid(sock);
            const statusSenderNum = (m.quoted.sender || m.chat).split('@')[0].split(':')[0];

            if (ownerJid) {
              await sock.sendMessage(ownerJid, {
                [mediaType]: buffer,
                caption: `📥 *── AUTO STATUS SAVED TO INBOX ──* 📥\n\n` +
                         `👤 *Status Owner:* @${statusSenderNum}\n` +
                         `💬 *Your Reply Comment:* "${m.body || 'No caption'}"\n` +
                         `🕒 *Time:* ${new Date().toLocaleTimeString()}\n\n` +
                         `_Delivered automatically to your personal Inbox by Saqib-MD_`,
                mentions: [m.quoted.sender || m.chat]
              });
            }
          } catch (e) {
            console.error('Auto status save on reply failed:', e);
          }
        }
      }

      // Anti-Link Enforcement in Groups
      if (m.isGroup && config.ANTI_LINK && m.body.includes('chat.whatsapp.com/')) {
        const groupMeta = await sock.groupMetadata(m.chat).catch(() => null);
        const botId = (sock.user.id.split('@')[0].split(':')[0]) + '@s.whatsapp.net';
        const isBotAdmin = groupMeta?.participants.find(p => p.id === botId)?.admin;
        const isSenderAdmin = groupMeta?.participants.find(p => p.id === m.sender)?.admin || m.fromMe;

        if (!isSenderAdmin && isBotAdmin) {
          await sock.sendMessage(m.chat, { delete: m.key });
          await sock.groupParticipantsUpdate(m.chat, [m.sender], 'remove');
          await sock.sendMessage(m.chat, {
            text: `🚫 @${m.sender.split('@')[0]} was removed for sending WhatsApp group links!`,
            mentions: [m.sender]
          });
          continue;
        }
      }

      // Issue 10 Fix: Anti-Badword Enforcement in Groups
      const isSenderOwner = config.checkIsOwner(m, sock);
      if (m.isGroup && config.ANTI_BADWORD && !isSenderOwner) {
        const BAD_WORDS = ['bc', 'mc', 'gandu', 'chutiya', 'harami', 'bhenchod', 'madarchod', 'randi', 'lund', 'bhosdike'];
        const bodyLower = m.body.toLowerCase();
        if (BAD_WORDS.some(bw => new RegExp(`\\b${bw}\\b`, 'i').test(bodyLower))) {
          try {
            await sock.sendMessage(m.chat, { delete: m.key });
            await sock.sendMessage(m.chat, {
              text: `⚠️ @${m.sender.split('@')[0]}, foul/abusive language is strictly prohibited in this group!`,
              mentions: [m.sender]
            });
            continue;
          } catch (_) {}
        }
      }

      // Private Mode Silence Guard (Ignore non-owners completely if private)
      if (config.WORK_TYPE === 'private' && !isSenderOwner) {
        continue;
      }

      // Auto Reaction Logic (All / Sender / Me / Mirror)
      if (config.AUTO_REACT && m.body) {
        try {
          if (config.AUTO_REACT_MODE === 'mirror') {
            const emojiMatch = m.body.match(/(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
            if (emojiMatch) {
              await m.react(emojiMatch[0]);
            }
          } else if (config.AUTO_REACT_MODE === 'sender' && !m.fromMe) {
            const emojis = ['⚡', '🔥', '✨', '👑', '💯', '❤️', '🌟'];
            await m.react(emojis[Math.floor(Math.random() * emojis.length)]);
          } else if (config.AUTO_REACT_MODE === 'me' && m.fromMe) {
            const emojis = ['⚡', '👑', '💯', '🔥'];
            await m.react(emojis[Math.floor(Math.random() * emojis.length)]);
          } else if (config.AUTO_REACT_MODE === 'all') {
            const emojis = ['⚡', '🔥', '✨', '👑', '💯', '❤️', '🌟'];
            await m.react(emojis[Math.floor(Math.random() * emojis.length)]);
          }
        } catch (_) {}
      }

      // AI Sentiment Reaction (if enabled)
      if (config.AI_REACT && !m.fromMe && m.body) {
        const text = m.body.toLowerCase();
        let sentimentEmoji = null;
        if (/haha|lol|funny|joke|hasi|mazah/.test(text)) sentimentEmoji = '😂';
        else if (/love|pyar|jan|sweet|dil|heart/.test(text)) sentimentEmoji = '❤️';
        else if (/fire|op|great|zabardast|kamaal|super/.test(text)) sentimentEmoji = '🔥';
        else if (/sad|dukhi|crying|sorry|afsos/.test(text)) sentimentEmoji = '🥺';
        else if (/king|boss|bhai|saqib/.test(text)) sentimentEmoji = '👑';
        if (sentimentEmoji) m.react(sentimentEmoji).catch(() => null);
      }

      // Friendly AI Chatbot (if message is NOT a command)
      if (!m.body.startsWith(config.PREFIX) && !m.fromMe) {
        const shouldChat = (!m.isGroup && config.CHATBOT_PM) || (m.isGroup && config.CHATBOT_GROUP);
        if (shouldChat && m.body.trim().length > 1) {
          try {
            const botReply = await generateChatbotReply(m.body, m.pushName || 'Dost');
            if (botReply) {
              await m.reply(botReply);
              continue;
            }
          } catch (e) {
            console.error('Chatbot auto-reply error:', e);
          }
        }
      }

      // Command Execution Logic with 500+ Intuitive Self-Explanatory Aliases
      if (!m.body.startsWith(config.PREFIX)) continue;

      const args = m.body.slice(config.PREFIX.length).trim().split(/ +/);
      const rawCommand = args.shift().toLowerCase();
      const command = resolveAlias(rawCommand);

      let handled = false;
      for (const plugin of plugins) {
        if (plugin.commands.includes(command)) {
          handled = true;
          try {
            await plugin.execute(sock, m, { command, args, prefix: config.PREFIX });
          } catch (err) {
            console.error(`Error in command ${command}:`, err);
            await m.reply(config.MESSAGES.ERROR + `\n_${err.message}_`);
          }
          break;
        }
      }
    }
  });

  // Granular Anti-Delete Handler (Same Chat vs Inbox with Sender/Deleter tags)
  sock.ev.on('messages.update', async (updates) => {
    if (!config.ANTI_DELETE) return;

    for (const update of updates) {
      if (update.update.message === null) {
        const deletedMsgId = update.key.id;
        const cached = messageStore.get(deletedMsgId);

        if (cached) {
          const isGroup = cached.chat.endsWith('@g.us');
          const senderNum = cached.sender.split('@')[0].split(':')[0];
          const deleterJid = update.key.participant || cached.sender;
          const deleterNum = deleterJid.split('@')[0].split(':')[0];

          const ownerJid = config.getOwnerJid(sock);
          const targetChat = (config.ANTI_DELETE_MODE === 'inbox' && ownerJid) 
            ? ownerJid 
            : cached.chat;

          const dateSent = new Date(cached.time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
          const timeSent = new Date(cached.time).toLocaleTimeString();
          const timeDeleted = new Date().toLocaleTimeString();

          const mentions = [cached.sender];
          if (deleterJid && !mentions.includes(deleterJid)) mentions.push(deleterJid);

          const alertText = `🚨 *──「 ANTI-DELETE DETECTED 」──* 🚨\n\n` +
            `👤 *Sent by:* @${senderNum}\n` +
            `🗑️ *Deleted by:* @${deleterNum}\n` +
            `💬 *Chat:* ${isGroup ? 'Group Chat' : 'Private DM'}\n` +
            `📅 *Date:* ${dateSent}\n` +
            `🕒 *Sent at:* ${timeSent}\n` +
            `⏱️ *Deleted at:* ${timeDeleted}\n\n` +
            `_Original message recovered below:_ 👇`;

          await sock.sendMessage(targetChat, { text: alertText, mentions });
          if (cached.msg.message) {
            await sock.sendMessage(targetChat, { forward: cached.msg }, { quoted: cached.msg });
          }
        }
      }
    }
  });

  return sock;
}

// Issue 5 Fix: reloadBot function to reload main bot connection when new pairing completes
async function reloadBot() {
  console.log('🔄 Reloading main bot connection with new pairing credentials...');
  if (currentSock) {
    try {
      if (onlinePresenceInterval) clearInterval(onlinePresenceInterval);
      if (autoBioInterval) clearInterval(autoBioInterval);
      currentSock.end(new Error('Reloading with updated credentials'));
    } catch (_) {}
  }
  await startBot().catch(err => console.error('Bot reload error:', err));
}

// Start Web Server for Pairing Portal (Binding 0.0.0.0 for external network access)
app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`🌐 Saqib-MD Pairing Portal & Web Server running on port ${config.PORT}`);
  if (config.MONGO_URI || fs.existsSync(path.join(__dirname, 'session/creds.json'))) {
    startBot().catch(err => console.error('Bot launch error:', err));
  } else {
    console.log('ℹ️ No active session found. Open the web portal to generate a Pairing Code.');
  }
});

module.exports = { startBot, reloadBot, app };
