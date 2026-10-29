const express = require('express');
const router = express.Router();
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  DisconnectReason,
  Browsers,
  initAuthCreds
} = require('@whiskeysockets/baileys');
const config = require('./config');
const { useMongoDBAuthState, promoteSession, deleteSession, SessionModel } = require('./lib/mongoAuth');

// In-memory active sockets, timeout handlers, and status tracker
const activePairSockets = new Map();
const activeSocketTimeouts = new Map();
const pairingStatusMap = new Map();
const rateLimitLog = new Map(); // IP/Number -> timestamp[]

// Rate limiting middleware: max 2 requests/min per IP, max 1 request/45s per phone
function isRateLimited(key, maxLimit = 2, windowMs = 60000) {
  const now = Date.now();
  const history = (rateLimitLog.get(key) || []).filter(t => now - t < windowMs);
  if (history.length >= maxLimit) {
    return true;
  }
  history.push(now);
  rateLimitLog.set(key, history);
  return false;
}

// Safely close and cleanup socket to prevent memory leaks and zombie WebSockets
function closePairSocket(num, reason = 'Normal Closure') {
  if (activeSocketTimeouts.has(num)) {
    clearTimeout(activeSocketTimeouts.get(num));
    activeSocketTimeouts.delete(num);
  }

  if (activePairSockets.has(num)) {
    const s = activePairSockets.get(num);
    try {
      if (s.ws) s.ws.close();
      s.end(new Error(reason));
    } catch (_) {}
    activePairSockets.delete(num);
  }
}

// Strict Phone Number Sanitization & Pakistani Number Auto-Correction
function sanitizeNumber(raw) {
  if (!raw) return '';
  let num = String(raw).replace(/[^0-9]/g, '');
  if (num.startsWith('00')) num = num.slice(2);
  // Auto-correct 0300xxxxxxx -> 92300xxxxxxx
  if (num.startsWith('03') && num.length === 11) {
    num = '92' + num.slice(1);
  }
  // Auto-correct 920300xxxxxxx -> 92300xxxxxxx
  if (num.startsWith('9203') && num.length === 13) {
    num = '923' + num.slice(4);
  }
  return num;
}

router.get('/', async (req, res) => {
  let num = sanitizeNumber(req.query.number);
  if (!num) {
    return res.status(400).json({ status: 'error', message: 'Valid WhatsApp phone number is required.' });
  }

  if (num.length < 10 || num.length > 15) {
    return res.status(400).json({
      status: 'error',
      message: 'Invalid phone number length. Please include international country code (e.g. 92300xxxxxxx).'
    });
  }

  // Issue 3 Fix: Protect owner session from being overwritten by unauthorized users
  const configuredOwner = sanitizeNumber(config.OWNER_NUMBER);
  if (configuredOwner && num !== configuredOwner) {
    return res.status(403).json({
      status: 'error',
      message: 'Access Denied: Only the configured Bot Owner can link to this bot instance. Unauthorized session overwriting is blocked.'
    });
  }

  // If owner number is not yet explicitly set, ensure an already active session is not hijacked
  if (!configuredOwner) {
    try {
      if (config.MONGO_URI) {
        const existingSession = await SessionModel.findOne({ sessionId: config.SESSION_ID || 'saqib_md_session' });
        if (existingSession && existingSession.creds && existingSession.creds.registered) {
          return res.status(403).json({
            status: 'error',
            message: 'Main bot session is already active and linked. Unauthorized session overwriting is blocked.'
          });
        }
      } else {
        const localCreds = path.join(__dirname, 'session', 'creds.json');
        if (fs.existsSync(localCreds)) {
          return res.status(403).json({
            status: 'error',
            message: 'Main bot session is already active and linked. Unauthorized session overwriting is blocked.'
          });
        }
      }
    } catch (_) {}
  }

  // Abuse Protection & Rate Limiting
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  if (isRateLimited(`ip_${clientIp}`, 3, 60000) || isRateLimited(`num_${num}`, 1, 45000)) {
    return res.status(429).json({
      status: 'error',
      message: 'Rate limit exceeded. Please wait 45 seconds before requesting another pairing code.'
    });
  }

  if (activePairSockets.size >= 5) {
    return res.status(503).json({
      status: 'error',
      message: 'Pairing server is busy handling other pairing requests. Please retry in 1 minute.'
    });
  }

  try {
    // Terminate any previous socket for this number explicitly
    closePairSocket(num, 'New pairing request initiated');
    pairingStatusMap.set(num, 'initiating');

    const tempSessionId = `temp_pair_${num}_${Date.now()}`;
    const tempSessionDir = path.join(os.tmpdir(), `pair_session_${num}_${Date.now()}`);
    let authState;

    if (config.MONGO_URI) {
      authState = await useMongoDBAuthState(config.MONGO_URI, tempSessionId);
    } else {
      if (!fs.existsSync(tempSessionDir)) {
        fs.mkdirSync(tempSessionDir, { recursive: true });
      }
      authState = await useMultiFileAuthState(tempSessionDir);
    }

    const { state, saveCreds } = authState;

    if (!state.creds || !state.creds.registered) {
      if (!state.creds) {
        state.creds = initAuthCreds();
      } else {
        Object.assign(state.creds, initAuthCreds());
      }
    }

    // Function to launch pairing socket, supporting automatic reconnection on code 515 (restart required)
    function launchPairSocket(isRestart = false) {
      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false,
        connectTimeoutMs: 90000,
        defaultQueryTimeoutMs: 90000,
        keepAliveIntervalMs: 15000,
        generateHighQualityLinkPreview: false
      });

      activePairSockets.set(num, sock);

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
          pairingStatusMap.set(num, 'connected');
          console.log(`✅ [PAIRING SUCCESS] WhatsApp Linked Successfully for: ${num}`);

          try {
            // Promote validated credentials into primary bot session
            if (config.MONGO_URI) {
              await promoteSession(tempSessionId, config.SESSION_ID || 'saqib_md_session');
            } else {
              const mainSessionDir = path.join(__dirname, 'session');
              if (!fs.existsSync(mainSessionDir)) fs.mkdirSync(mainSessionDir, { recursive: true });
              const files = fs.readdirSync(tempSessionDir);
              for (let f of files) {
                fs.copyFileSync(path.join(tempSessionDir, f), path.join(mainSessionDir, f));
              }
            }

            // Send official confirmation message
            await sock.sendMessage(sock.user.id, {
              text: `⚡ *───「 SAQIB-MD LINKED SUCCESSFULLY 」───* ⚡\n\n` +
                    `👑 *Developer:* ${config.OWNER_NAME}\n` +
                    `🤖 *Bot Name:* ${config.BOT_NAME}\n` +
                    `⚙️ *Prefix:* ${config.PREFIX}\n` +
                    `🌐 *Status:* Active & 24/7 Online\n\n` +
                    `💬 Type *${config.PREFIX}menu* for the complete command list.\n` +
                    `📋 Type *${config.PREFIX}commanddetails* for detailed guide on every feature!\n\n` +
                    `_High performance automation engineered by Saqib Iqbal._`
            });

            // Issue 5 Fix: Automatically reload/boot main bot engine in index.js
            try {
              const botIndex = require('./index');
              if (botIndex && typeof botIndex.reloadBot === 'function') {
                console.log('🔄 Triggering automated main bot boot after pairing...');
                setTimeout(() => botIndex.reloadBot(), 2500);
              }
            } catch (err) {
              console.log('Main bot auto-reload dispatch info:', err.message);
            }

          } catch (e) {
            console.error('Welcome message dispatch / session promote error:', e);
          }

          // Gracefully close pairing socket after credentials flush
          setTimeout(() => {
            closePairSocket(num, 'Pairing completed successfully');
            if (!config.MONGO_URI) {
              try { fs.rmSync(tempSessionDir, { recursive: true, force: true }); } catch (_) {}
            }
          }, 6000);
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          console.log(`Pairing socket closed for ${num} with code: ${statusCode}`);

          // Issue 4 Fix: On close code 515 (restartRequired), recreate the socket so registration completes
          if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
            console.log(`🔄 Pairing restart required (code 515) for ${num}. Recreating socket to complete authentication...`);
            setTimeout(() => launchPairSocket(true), 2000);
            return;
          }

          if (statusCode === DisconnectReason.loggedOut) {
            pairingStatusMap.set(num, 'logged_out');
            closePairSocket(num, 'Logged out');
            if (config.MONGO_URI) deleteSession(tempSessionId);
          }
        }
      });

      return sock;
    }

    const sock = launchPairSocket(false);

    // Wait 3.5 seconds for Baileys WebSocket handshake to establish
    await delay(3500);

    if (!state.creds.registered) {
      const code = await sock.requestPairingCode(num);
      const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
      pairingStatusMap.set(num, 'code_generated');

      // Safely close socket and free memory after 150 seconds timeout
      const timeoutId = setTimeout(() => {
        console.log(`⏱️ Pairing socket timed out for ${num}. Closing socket safely.`);
        closePairSocket(num, 'Pairing timeout after 150 seconds');
        if (config.MONGO_URI) deleteSession(tempSessionId);
        else {
          try { fs.rmSync(tempSessionDir, { recursive: true, force: true }); } catch (_) {}
        }
      }, 150000);

      activeSocketTimeouts.set(num, timeoutId);

      return res.json({
        status: 'success',
        code: formattedCode,
        number: num,
        expiresIn: 150,
        message: 'Notification dispatched! Enter this 8-digit code in WhatsApp > Linked Devices > Link with phone number.'
      });
    } else {
      return res.json({
        status: 'success',
        message: 'Device already registered and linked! Restart the bot or use your commands.'
      });
    }

  } catch (err) {
    console.error('Pairing generation error:', err);
    closePairSocket(num, 'Pairing generation error');
    pairingStatusMap.set(num, 'error');
    return res.status(500).json({
      status: 'error',
      message: err.message || 'WhatsApp servers were busy. Please wait 10 seconds and retry.'
    });
  }
});

// Real-time Status Check endpoint for Web UI Polling
router.get('/status', (req, res) => {
  const num = req.query.number?.replace(/[^0-9]/g, '');
  const status = pairingStatusMap.get(num) || 'none';
  res.json({ status });
});

// Export router and production utilities for direct automated testing & external lifecycle control
router.sanitizeNumber = sanitizeNumber;
router.isRateLimited = isRateLimited;
router.closePairSocket = closePairSocket;
router.activePairSockets = activePairSockets;
router.activeSocketTimeouts = activeSocketTimeouts;
router.pairingStatusMap = pairingStatusMap;
router.rateLimitLog = rateLimitLog;

module.exports = router;
