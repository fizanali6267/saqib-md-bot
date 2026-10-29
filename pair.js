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
const { useMongoDBAuthState, promoteSession, deleteSession, clearSignalSessions, SessionModel } = require('./lib/mongoAuth');

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

  // Issue 7 Fix: Owner Session Hijack Protection.
  // Ye single-session bot hai: jo bhi number pair karega, wahi bot chalayega.
  // Pehle public portal par koi bhi banda owner ki primary session overwrite
  // kar sakta tha. Ab sirf OWNER_NUMBERS + PAIRING_ALLOWED_NUMBERS pair kar
  // sakte hain, jab tak ALLOW_PUBLIC_PAIRING=true set na ho.
  if (!config.ALLOW_PUBLIC_PAIRING) {
    const owners = (config.OWNER_NUMBERS || [config.OWNER_NUMBER])
      .map((n) => sanitizeNumber(n))
      .filter(Boolean);
    const allowlist = (config.PAIRING_ALLOWED_NUMBERS || [])
      .map((n) => sanitizeNumber(n))
      .filter(Boolean);
    const allowed = new Set([...owners, ...allowlist]);
    if (allowed.size > 0 && !allowed.has(num)) {
      return res.status(403).json({
        status: 'error',
        message: 'Access Denied: Only the configured Bot Owner can link to this bot instance. Unauthorized session overwriting is blocked.'
      });
    }
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
          console.log(`\u2705 [PAIRING SUCCESS] WhatsApp Linked Successfully for: ${num}`);

          // Send welcome message while this socket is still alive
          try {
            await sock.sendMessage(sock.user.id, {
              text: `\u26a1 *\u2500\u2500\u2500\u300c SAQIB-MD LINKED SUCCESSFULLY \u300d\u2500\u2500\u2500* \u26a1\n\n` +
                    `\ud83d\udc51 *Developer:* ${config.OWNER_NAME}\n` +
                    `\ud83e\udd16 *Bot Name:* ${config.BOT_NAME}\n` +
                    `\u2699\ufe0f *Prefix:* ${config.PREFIX}\n` +
                    `\ud83c\udf10 *Status:* Active & 24/7 Online\n\n` +
                    `\ud83d\udcac Type *${config.PREFIX}menu* for the complete command list.\n\n` +
                    `_High performance automation engineered by Saqib Iqbal._`
            });
          } catch (e) {
            console.error('Welcome message error:', e?.message || e);
          }

          // CRITICAL FIX: close the pairing socket FIRST so two sockets never
          // share the same Signal session (that caused "Decrypted message with closed session")
          setTimeout(async () => {
            try { closePairSocket(num, 'Pairing completed successfully'); } catch (_) {}

            // Promote validated credentials into the primary bot session
            try {
              if (config.MONGO_URI) {
                const targetId = config.SESSION_ID || 'saqib_md_session';
                await promoteSession(tempSessionId, targetId);
                // CRITICAL: wipe Signal sessions created by the pairing socket.
                // Warna naya device un desynced ratchets ko reuse karta hai aur
                // har message par "Bad MAC" + "Waiting for this message" aata hai.
                const cleared = await clearSignalSessions(targetId);
                if (cleared) console.log(`\ud83e\uddf9 Cleared ${cleared} pairing-time Signal sessions (they will rebuild fresh).`);
              } else {
                const mainSessionDir = path.join(__dirname, 'session');
                if (!fs.existsSync(mainSessionDir)) fs.mkdirSync(mainSessionDir, { recursive: true });
                // wipe stale main session before promoting a fresh one
                for (const old of fs.readdirSync(mainSessionDir)) {
                  try { fs.rmSync(path.join(mainSessionDir, old), { recursive: true, force: true }); } catch (_) {}
                }
                const files = fs.readdirSync(tempSessionDir);
                for (let f of files) {
                  // Skip pairing-time Signal sessions so they rebuild cleanly.
                  if (/^session-.*\.json$/.test(f)) continue;
                  fs.copyFileSync(path.join(tempSessionDir, f), path.join(mainSessionDir, f));
                }
              }
              console.log('\ud83d\udcbe Session promoted to main bot storage.');
            } catch (e) {
              console.error('Session promote error:', e?.message || e);
            }

            if (!config.MONGO_URI) {
              try { fs.rmSync(tempSessionDir, { recursive: true, force: true }); } catch (_) {}
            }

            // Boot the main bot AFTER the pairing socket is fully closed
            try {
              const botIndex = require('./index');
              if (botIndex && typeof botIndex.reloadBot === 'function') {
                console.log('\ud83d\udd04 Booting main bot with new session...');
                setTimeout(() => botIndex.reloadBot(), 1500);
              }
            } catch (err) {
              console.log('Main bot reload dispatch info:', err?.message || err);
            }
          }, 2500);
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
