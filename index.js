const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const NodeCache = require('node-cache');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
  // Official Baileys helpers for the "Waiting for this message" fix
  makeCacheableSignalKeyStore,
  makeInMemoryStore,
  proto
} = require('@whiskeysockets/baileys');

// Issue 3 Fix: Log-noise filter.
// Baileys 6.7.x ships a stray console.log in its Signal layer that dumps whole
// SessionEntry objects (including private keys) to stdout. On a 100-line log
// buffer that noise wipes out real startup/error lines, so we drop those calls.
const __NOISE_PATTERNS = [
  'Removing old closed session', // libsignal/src/session_record.js:301 (console.info)
  'Closing open session',
  'Closing session:',
  'Session already closed'
];
const __isNoise = (args) => {
  try {
    return typeof args[0] === 'string' && __NOISE_PATTERNS.some((p) => args[0].includes(p));
  } catch (_) {
    return false;
  }
};
for (const __level of ['log', 'info', 'debug']) {
  const __orig = console[__level].bind(console);
  console[__level] = (...args) => {
    if (__isNoise(args)) return;
    __orig(...args);
  };
}

// ---- Self-healing: corrupted Signal session recovery -----------------------
// libsignal prints "Failed to decrypt message with any known session..." followed
// by a "Bad MAC" error and a stack trace whose first frame names the offending
// JID (e.g. "at async 215753789857825.0 [as awaitable]"). A Bad MAC means the
// stored ratchet no longer matches the sender's, so every single message from
// that contact fails forever ("Waiting for this message. This may take a while.").
//
// Instead of requiring a manual wipe + restart, we detect it here, delete that
// ONE session key from RAM + MongoDB, and let WhatsApp rebuild it from a fresh
// prekey bundle. The bot heals itself within one message.
let __badMacWindow = 0;
const __healQueue = new Set();
const __healSignalSession = (jid) => {
  if (!jid || __healQueue.has(jid)) return;
  __healQueue.add(jid);
  try {
    const sid = config.SESSION_ID || 'saqib_md_session';
    if (!config.MONGO_URI) return;
    // Evict through the live key store first: makeCacheableSignalKeyStore keeps
    // its own copy, so deleting only from MongoDB would let the corrupt ratchet
    // be served again forever.
    const evict = async () => {
      let ok = false;
      try {
        if (currentKeysStore && typeof currentKeysStore.set === 'function') {
          await currentKeysStore.set({ session: { [jid]: null } });
          ok = true;
        }
      } catch (_) {}
      if (!ok) {
        const { dropSignalSession } = require('./lib/mongoAuth');
        ok = await dropSignalSession(sid, jid).catch(() => false);
      }
      if (ok) console.log(`\ud83e\ude79 Self-heal: dropped corrupt Signal session for ${jid} (will rebuild).`);
    };
    evict().catch(() => null).finally(() => setTimeout(() => __healQueue.delete(jid), 10000));
  } catch (_) {
    __healQueue.delete(jid);
  }
};

const __origError = console.error.bind(console);
console.error = (...args) => {
  const s = typeof args[0] === 'string' ? args[0] : '';
  // Start of a Bad MAC block -> swallow it and open a short suppression window.
  if (s.includes('Failed to decrypt message with any known session') || s.includes('Bad MAC')) {
    __badMacWindow = 8;
    return;
  }
  if (__badMacWindow > 0) {
    __badMacWindow--;
    const m = s.match(/at async (\d+(?:\.\d+)?) \[as awaitable\]/);
    if (m) __healSignalSession(m[1]);
    return; // suppress the stack frames of the Bad MAC block
  }
  __origError(...args);
};

// Issue 7 Fix: Global unhandled rejection and uncaught exception handlers prevent process crash
process.on('unhandledRejection', (err) => {
  console.error('⚠️ [CRASH GUARD] Unhandled Rejection detected:', err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ [CRASH GUARD] Uncaught Exception detected:', err?.message || err);
});

const config = require('./config');
const { serialize } = require('./lib/serialize');
const lid = require('./lib/lid');
const { useMongoDBAuthState } = require('./lib/mongoAuth');
const { useFastAuthState } = require('./lib/fastAuthState');
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

// Live diagnostics: proves the socket can actually deliver to a given JID.
// Usage: /selftest?jid=92300...  (defaults to the owner's own number)
app.get('/selftest', async (req, res) => {
  try {
    if (!currentSock) return res.status(503).json({ ok: false, error: 'socket not connected' });
    const num = String(req.query.jid || config.OWNER_NUMBER || '').replace(/[^0-9]/g, '');
    if (!num) return res.status(400).json({ ok: false, error: 'no jid' });
    const jid = `${num}@s.whatsapp.net`;
    const t0 = Date.now();
    const sent = await currentSock.sendMessage(jid, {
      text: `🧪 *SELF-TEST*\nBot is able to deliver to this chat.\n${new Date().toISOString()}`
    });
    res.json({
      ok: true,
      jid,
      ms: Date.now() - t0,
      id: sent?.key?.id,
      remoteJid: sent?.key?.remoteJid,
      lidMap: lid.size()
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
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

// In-memory message store for Anti-Delete AND for answering WhatsApp retry
// requests (getMessage). Bounded so it can never leak memory on a busy bot.
const messageStore = new Map();
const MESSAGE_STORE_LIMIT = 5000;

// Issue 1 Fix: WhatsApp retry handshake cache. Without this, a failed decrypt
// retry loops forever and the recipient sees "Waiting for this message".
const msgRetryCounterCache = new NodeCache({ stdTTL: 0, checkperiod: 0 });

// Single helper so every insert (incoming + outgoing) evicts the same way.
function cacheMessage(id, entry) {
  if (!id) return;
  messageStore.set(id, entry);
  while (messageStore.size > MESSAGE_STORE_LIMIT) {
    const oldest = messageStore.keys().next().value;
    if (oldest === undefined) break;
    messageStore.delete(oldest);
  }
}
let onlinePresenceInterval = null;
let autoBioInterval = null;
let currentSock = null;
let currentKeysStore = null; // live Signal key store (for self-heal eviction)
// Ids of messages the bot itself sent — used to stop "Message Yourself" loops.
const botSentMessageIds = new Set();

// ---- Connection manager guards (prevents duplicate sockets sharing one session) ----
let isStarting = false;          // true while a socket is being created
let reconnectTimer = null;       // pending auto-reconnect timer
let suppressReconnectUntil = 0;  // ignore close events until this timestamp (manual reload)

// ---- Single-instance lock -------------------------------------------------
// Two processes connecting with the same WhatsApp creds make the server kill
// the session with 401 loggedOut. Platform restarts can briefly overlap, so we
// refuse to start a second instance while a live one holds the lock.
const LOCK_FILE = path.join(__dirname, 'data', 'instance.lock');
const acquireInstanceLock = () => {
  try {
    fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
    if (fs.existsSync(LOCK_FILE)) {
      const raw = fs.readFileSync(LOCK_FILE, 'utf8').trim();
      const pid = parseInt(raw, 10);
      if (pid && pid !== process.pid) {
        let alive = false;
        try { process.kill(pid, 0); alive = true; } catch (_) { alive = false; }
        if (alive) {
          console.log(`⛔ Another instance is already running (pid ${pid}). Exiting to protect the WhatsApp session.`);
          process.exit(0);
        }
      }
    }
    fs.writeFileSync(LOCK_FILE, String(process.pid));
    const release = () => {
      try {
        if (fs.readFileSync(LOCK_FILE, 'utf8').trim() === String(process.pid)) fs.unlinkSync(LOCK_FILE);
      } catch (_) {}
    };
    process.on('exit', release);
    process.on('SIGINT', () => { release(); process.exit(0); });
    process.on('SIGTERM', () => { release(); process.exit(0); });
    return true;
  } catch (e) {
    console.log('⚠️  Instance lock unavailable:', e.message);
    return true;
  }
};
acquireInstanceLock();

async function startBot() {
  // Guard: never build two sockets at the same time.
  if (isStarting) {
    console.log('⏳ startBot() already in progress — skipping duplicate call.');
    return currentSock;
  }
  isStarting = true;
  // Watchdog: if socket creation hangs/throws, release the guard after 25s.
  const guardTimer = setTimeout(() => { isStarting = false; }, 25000);
  if (guardTimer.unref) guardTimer.unref();

  console.log(`🚀 Starting ${config.BOT_NAME}...`);

  let authState;
  const sessionDir = path.join(__dirname, 'session');

  if (config.MONGO_URI) {
    // Resilience: agar Atlas down ho / IP whitelist na ho / credentials ghalat
    // hon, bot ko marne ke bajaye disk session par fall back kar jate hain.
    // Warna ek DB issue poore bot ko offline kar deta hai.
    try {
      authState = await useMongoDBAuthState(config.MONGO_URI, config.SESSION_ID || 'saqib_md_session');
      console.log('🗄️  Session backend: MongoDB Atlas');
    } catch (mongoErr) {
      console.error('⚠️  MongoDB unavailable — falling back to local file session.');
      console.error('   Reason:', mongoErr?.message || mongoErr);
      console.error('   Fix: Atlas → Network Access → allow 0.0.0.0/0 (or your host IP).');
      authState = null;
    }
  }

  if (!authState) {
    // FAST in-memory auth state: no synchronous disk I/O per Signal key
    authState = useFastAuthState(sessionDir);
  }

  const { state, saveCreds } = authState;
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

  // Official Baileys fix: wrap the Signal key store in a cacheable layer so the
  // ratchet keys are available instantly. Without it WhatsApp asks for keys
  // that are still in flight and the chat stalls on "Waiting for this message".
  const cachedKeys = (typeof makeCacheableSignalKeyStore === 'function')
    ? makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    : state.keys;
  currentKeysStore = cachedKeys;

  // Official in-memory store: lets getMessage() re-serve any message Baileys
  // has seen, which is what the recipient's phone asks for on a retry.
  const store = (typeof makeInMemoryStore === 'function')
    ? makeInMemoryStore({ logger: pino({ level: 'silent' }) })
    : null;

  // Group metadata cache: avoids a network round-trip on every group message
  const groupMetadataCache = new Map();
  const cachedGroupMetadata = async (jid) => {
    const hit = groupMetadataCache.get(jid);
    if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.data;
    try {
      const data = await currentSock.groupMetadata(jid);
      groupMetadataCache.set(jid, { data, at: Date.now() });
      return data;
    } catch (_) {
      return hit?.data;
    }
  };

  const sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: cachedKeys },
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    // ---- performance / latency tuning ----
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    generateHighQualityLinkPreview: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 20000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    retryRequestDelayMs: 250,
    maxMsgRetryCount: 3,
    // Issue 1 Fix: keeps the retry counter in RAM so Baileys can complete the
    // decrypt retry handshake instead of stalling on "Waiting for this message".
    msgRetryCounterCache,
    cachedGroupMetadata,
    // Helps WhatsApp decrypt retried messages instead of showing
    // "Waiting for this message. This may take a while."
    getMessage: async (key) => {
      // Step A: our own bounded cache first — zero await, fastest path
      const cached = messageStore.get(key.id);
      if (cached?.msg?.message) return cached.msg.message;
      if (cached?.message) return cached.message;
      // Step B: official in-memory store lookup
      try {
        if (store) {
          const stored = await store.loadMessage(key.remoteJid, key.id);
          if (stored?.message) return stored.message;
        }
      } catch (_) {}
      // Step C: CRITICAL — never return undefined. Returning an empty proto
      // message lets the Signal ratchet step complete so the recipient's phone
      // stops showing "Waiting for this message" forever.
      return proto?.Message ? proto.Message.fromObject({}) : undefined;
    }
  });

  // Bind the official store to the socket's event stream (message tracking)
  try { if (store) store.bind(sock.ev); } catch (_) {}

  // Learn LID -> phone-number pairs from contacts, history and group members.
  try { lid.bind(sock); } catch (_) {}

  currentSock = sock;
  clearTimeout(guardTimer);
  isStarting = false; // socket built — release the creation guard

  // Issue 1 Fix: cache every OUTGOING message too. Previously only incoming
  // messages were stored, so when a recipient's phone asked the bot to
  // re-send one of the bot's own replies, getMessage() returned undefined and
  // the chat stuck on "Waiting for this message".
  //
  // LOOP PROTECTION: every id we send ourselves is remembered, because
  // "Message Yourself" delivers our own outgoing messages back to us as
  // `type: 'append'`. Without this set the bot would answer its own replies
  // forever.
  const originalSendMessage = sock.sendMessage.bind(sock);
  sock.sendMessage = async (jid, content, options = {}) => {
    const sent = await originalSendMessage(jid, content, options);
    try {
      if (sent?.key?.id) {
        botSentMessageIds.add(sent.key.id);
        if (botSentMessageIds.size > 5000) {
          botSentMessageIds.delete(botSentMessageIds.values().next().value);
        }
      }
      if (sent?.key?.id && sent?.message) {
        cacheMessage(sent.key.id, {
          sender: sock.user?.id || 'me',
          chat: jid,
          msg: sent,
          time: Date.now()
        });
      }
    } catch (_) {}
    return sent;
  };

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      if (onlinePresenceInterval) clearInterval(onlinePresenceInterval);
      if (autoBioInterval) clearInterval(autoBioInterval);
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      // Manual reload in progress: ignore this close event entirely.
      if (Date.now() < suppressReconnectUntil) {
        console.log('🔇 Suppressed reconnect (manual reload in progress).');
        return;
      }

      console.log(`Connection closed with code: ${statusCode}. Reconnecting: ${shouldReconnect}`);

      // Make sure the dead socket is fully torn down before reconnecting.
      try { sock.end(undefined); } catch (_) {}

      if (shouldReconnect) {
        if (reconnectTimer) return; // already scheduled — do not stack reconnects
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          startBot().catch(err => console.error('Bot launch error:', err));
        }, 3000);
      } else {
        console.log('❌ Device logged out. Please link your phone again.');
      }
    } else if (connection === 'open') {
      console.log(`✨ ${config.BOT_NAME} connected and ready to serve!`);

      // Remember our own LID <-> phone pair (needed for self-chat replies).
      try {
        if (sock.user?.id) {
          if (sock.user.lid) lid.addPair(sock.user.lid, sock.user.id);
          else if (sock.user.id.endsWith('@lid')) lid.addPair(sock.user.id, sock.user.id.split(':')[0]);
        }
        console.log(`🔗 LID map: ${lid.size()} pairs known`);
      } catch (_) {}

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
    // CRITICAL FIX: "Message Yourself" (apne inbox) ke messages WhatsApp
    // `type: 'append'` ke saath bhejta hai, groups/DM `type: 'notify'`.
    // Pehle sirf 'notify' allow tha, is liye self-chat mein koi command
    // chal hi nahi rahi thi.
    if (type !== 'notify' && type !== 'append') return;

    for (let rawMsg of messages) {
      if (!rawMsg.message) continue;

      // Loop protection: ignore anything the bot itself just sent.
      if (rawMsg.key?.id && botSentMessageIds.has(rawMsg.key.id)) continue;

      // 'append' also carries offline/stale messages after a reconnect. Only
      // act on recent ones so old commands are never re-executed.
      if (type === 'append') {
        const ts = Number(rawMsg.messageTimestamp || 0) * 1000;
        if (ts && Date.now() - ts > 120000) continue;
      }

      const __t0 = Date.now();
      const m = serialize(sock, rawMsg);

      // Safety net for the LID addressing issue: if the chat is still a LID
      // (no remoteJidAlt was provided), resolve it to the phone-number JID.
      // Replying to a LID is what makes the phone show
      // "Waiting for this message. This may take a while."
      if (m.chat && m.chat.endsWith('@lid')) {
        try {
          const pn = lid.resolve(m.chat) || await lid.probe(sock, m.chat);
          if (pn) {
            m.chat = pn;
            console.log(`🔗 LID ${m.rawChat} -> ${pn}`);
          } else {
            console.log(`⚠️  Unknown LID ${m.chat} (reply may not decrypt)`);
          }
        } catch (_) {}
      }

      // Auto Read (Blue Tick vs Double Grey Tick)
      if (config.AUTO_READ && m.key && !m.fromMe) {
        sock.readMessages([m.key]).catch(() => null);
      }

      // Store message in cache for Anti-Delete + retry decryption (getMessage)
      if (m.id && m.chat) {
        cacheMessage(m.id, {
          sender: m.sender,
          chat: m.chat,
          msg: rawMsg,
          time: Date.now()
        });
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
          await sock.sendMessage(m.chat, { delete: (m.rawKey || m.key) });
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
            await sock.sendMessage(m.chat, { delete: (m.rawKey || m.key) });
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
      // FIRE-AND-FORGET: never await this, otherwise every command waits
      // for an extra WhatsApp API round-trip before executing.
      // AUTO-REACT: runs on EVERY message type — text, photo, video, sticker,
      // voice note. Previously gated on `m.body`, so media messages (empty
      // body) never got a reaction.
      if (config.AUTO_REACT) {
        try {
          let reactEmoji = null;
          if (config.AUTO_REACT_MODE === 'mirror') {
            const emojiMatch = (m.body || '').match(/(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
            if (emojiMatch) reactEmoji = emojiMatch[0];
          } else if (config.AUTO_REACT_MODE === 'sender' && !m.fromMe) {
            const emojis = ['⚡', '🔥', '✨', '👑', '💯', '❤️', '🌟'];
            reactEmoji = emojis[Math.floor(Math.random() * emojis.length)];
          } else if (config.AUTO_REACT_MODE === 'me' && m.fromMe) {
            const emojis = ['⚡', '👑', '💯', '🔥'];
            reactEmoji = emojis[Math.floor(Math.random() * emojis.length)];
          } else if (config.AUTO_REACT_MODE === 'all') {
            const emojis = ['⚡', '🔥', '✨', '👑', '💯', '❤️', '🌟'];
            reactEmoji = emojis[Math.floor(Math.random() * emojis.length)];
          }
          if (reactEmoji) {
            // do NOT await — let it run in the background
            m.react(reactEmoji).catch(() => null);
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
      // FIRE-AND-FORGET: never await the AI call here, otherwise a slow
      // Gemini response blocks every command that arrives right after it.
      if (!m.body.startsWith(config.PREFIX) && !m.fromMe) {
        const shouldChat = (!m.isGroup && config.CHATBOT_PM) || (m.isGroup && config.CHATBOT_GROUP);
        if (shouldChat && m.body.trim().length > 1) {
          generateChatbotReply(m.body, m.pushName || 'Dost')
            .then(botReply => { if (botReply) m.reply(botReply).catch(() => null); })
            .catch(e => console.error('Chatbot auto-reply error:', e?.message || e));
        }
      }

      // Command Execution Logic with 500+ Intuitive Self-Explanatory Aliases
      if (!m.body.startsWith(config.PREFIX)) continue;

      const args = m.body.slice(config.PREFIX.length).trim().split(/ +/);
      const rawCommand = args.shift().toLowerCase();
      const command = resolveAlias(rawCommand);

      // Lightweight command trace so slow/ignored commands are diagnosable
      console.log(`\u2328\ufe0f  CMD ${config.PREFIX}${command} | from ${m.sender} | chat ${m.chat} | parse ${Date.now() - __t0}ms`);

      let handled = false;
      for (const plugin of plugins) {
        if (plugin.commands.includes(command)) {
          handled = true;
          // FIRE-AND-FORGET: run the command without blocking the message loop,
          // so one slow command can never stall the next .menu / command.
          plugin.execute(sock, m, { command, args, prefix: config.PREFIX })
            .then(() => { try { config.persistSettings?.(); } catch (_) {} })
            .catch(async (err) => {
              console.error(`Error in command ${command}:`, err);
              try { await m.reply(config.MESSAGES.ERROR + `\n_${err.message}_`); } catch (_) {}
            });
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
  // Prevent the old socket's close event from triggering a second reconnect.
  suppressReconnectUntil = Date.now() + 8000;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (currentSock) {
    try {
      if (onlinePresenceInterval) clearInterval(onlinePresenceInterval);
      if (autoBioInterval) clearInterval(autoBioInterval);
      currentSock.end(new Error('Reloading with updated credentials'));
    } catch (_) {}
    currentSock = null;
  }
  // Small delay lets the old socket fully release the Signal session.
  await new Promise(r => setTimeout(r, 800));
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
