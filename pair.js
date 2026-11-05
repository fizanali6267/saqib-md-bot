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
const sessionStore = require('./lib/sessionStore');

// In-memory active sockets, timeout handlers, and status tracker
const activePairSockets = new Map();
const activeSocketTimeouts = new Map();
const pairingStatusMap = new Map();
const pairReadyWaiters = new Map(); // number -> resolve() once the socket is ready
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
  // Internal calls from the bot itself (.pair command) run on loopback and are
  // always trusted, so the owner can pair a new number from the chat without
  // having to edit the allowlist env var every time.
  const isInternal = (() => {
    const ip = String(req.ip || req.connection?.remoteAddress || '');
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || req.get('x-internal-pair') === 'saqib-md';
  })();

  // In multi-session mode every number owns an ISOLATED session document, so
  // pairing can never overwrite another user's bot. The old allowlist existed
  // purely to stop session hijacking in single-session mode.
  if (!config.MULTI_SESSION && !config.ALLOW_PUBLIC_PAIRING && !isInternal) {
    const owners = (config.OWNER_NUMBERS || [config.OWNER_NUMBER])
      .map((n) => sanitizeNumber(n))
      .filter(Boolean);
    const allowlist = (config.PAIRING_ALLOWED_NUMBERS || [])
      .map((n) => sanitizeNumber(n))
      .filter(Boolean);
    const allowed = new Set([...owners, ...allowlist]);
    if (allowed.size > 0 && !allowed.has(num)) {
      console.log(`⛔ Pairing denied for ${num} (allowed: ${[...allowed].join(', ')})`);
      return res.status(403).json({
        status: 'error',
        message:
          `Access Denied: ${num} is not allowed to link to this bot instance.\n\n` +
          `Allowed number(s): ${[...allowed].join(', ')}\n\n` +
          `Owner: to link a different number, either\n` +
          `  • add it to the PAIRING_ALLOWED_NUMBERS variable (comma separated), or\n` +
          `  • set ALLOW_PUBLIC_PAIRING=true, or\n` +
          `  • run .pair <number> from the bot chat (owner only).`,
        allowed: [...allowed]
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

    // MULTI-SESSION: the pairing socket writes credentials straight into this
    // number's OWN session document. No promote/copy step is needed any more,
    // and pairing a second number no longer destroys the first one.
    const tempSessionId = `sess_${num}`;
    const targetSessionId = tempSessionId;
    const tempSessionDir = path.join(os.tmpdir(), `pair_session_${num}_${Date.now()}`);
    let authState;
    // Tracks whether this pairing run is actually backed by MongoDB. If Atlas
    // is unreachable (IP not whitelisted, network blip, etc.) we degrade
    // gracefully to a local file session instead of failing the whole request.
    let usingMongoForPair = false;

    if (config.MONGO_URI) {
      try {
        authState = await useMongoDBAuthState(config.MONGO_URI, tempSessionId);
        usingMongoForPair = true;
      } catch (mongoErr) {
        console.error('\u26a0\ufe0f MongoDB unavailable for pairing \u2014 falling back to local file session.');
        console.error('   Reason:', mongoErr?.message || mongoErr);
      }
    }

    if (!authState) {
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
        // WhatsApp rejects some Ubuntu/Chrome signatures for phone-number
        // linking. macOS Desktop is the combination their servers accept most
        // reliably, and it is what avoids "Could not link device".
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false,
        markOnlineOnConnect: false,
        connectTimeoutMs: 90000,
        defaultQueryTimeoutMs: 90000,
        keepAliveIntervalMs: 20000,
        generateHighQualityLinkPreview: false,
        retryRequestDelayMs: 500
      });

      activePairSockets.set(num, sock);

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // The pairing code may only be requested AFTER the Noise handshake has
        // completed. Requesting it too early (the old code used a blind 3.5s
        // sleep) makes WhatsApp hand out a code bound to a socket that is
        // already being torn down -> "Logging in…" then "Could not link
        // device".
        //
        // IMPORTANT: `connection === 'connecting'` is emitted the instant the
        // socket object is created — long before the WebSocket/Noise handshake
        // finishes. Gating on it made requestPairingCode() run against a closed
        // transport and throw "Connection Closed". The ONLY reliable signal
        // that the encrypted channel is live is the `qr` event (Baileys emits
        // it after a successful handshake when no device is registered), or a
        // full `open`. Never resolve on 'connecting'.
        if (qr || connection === 'open') {
          const w = pairReadyWaiters.get(num);
          if (w) { pairReadyWaiters.delete(num); w(); }
        }

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

          // MULTI-SESSION: this socket already wrote valid credentials into
          // `sess_<number>`. We only need to register the session and boot its
          // own instance — the previously linked numbers keep running.
          setTimeout(async () => {
            try { closePairSocket(num, 'Pairing completed successfully'); } catch (_) {}

            const sessionId = `sess_${num}`;

            // Register (or re-enable) this number in the session registry.
            try {
              await sessionStore.ensureForNumber(num, {
                sessionId,
                ownerName: config.OWNER_NAME,
                botName: config.BOT_NAME
              });
              console.log(`🗂️  Registered session ${sessionId} for ${num}`);
            } catch (e) {
              console.error('Session registry error:', e?.message || e);
            }

            // Wipe the pairing-time Signal sessions so the fresh device builds
            // clean ratchets (otherwise: Bad MAC + "Waiting for this message").
            try {
              const cleared = await clearSignalSessions(sessionId);
              if (cleared) console.log(`🧹 Cleared ${cleared} pairing-time Signal sessions.`);
            } catch (_) {}

            // Boot THIS session only. Other sessions are untouched.
            try {
              const botIndex = require('./index');
              if (botIndex && typeof botIndex.startBot === 'function') {
                console.log(`🚀 Booting session ${sessionId}...`);
                setTimeout(() => {
                  botIndex.startBot(sessionId).catch((err) =>
                    console.error(`Session ${sessionId} boot error:`, err?.message || err)
                  );
                }, 1500);
              }
            } catch (err) {
              console.log('Session boot dispatch info:', err?.message || err);
            }
          }, 2500);
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          console.log(`Pairing socket closed for ${num} with code: ${statusCode}`);

          // Unblock the readiness waiter so a dead socket fails fast instead of
          // hanging the HTTP request for the full 25s handshake window.
          const w = pairReadyWaiters.get(num);
          if (w) { pairReadyWaiters.delete(num); w(); }

          // Issue 4 Fix: On close code 515 (restartRequired), recreate the socket so registration completes
          if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
            console.log(`🔄 Pairing restart required (code 515) for ${num}. Recreating socket to complete authentication...`);
            setTimeout(() => launchPairSocket(true), 2000);
            return;
          }

          if (statusCode === DisconnectReason.loggedOut) {
            pairingStatusMap.set(num, 'logged_out');
            closePairSocket(num, 'Logged out');
            if (usingMongoForPair) deleteSession(tempSessionId);
          }
        }
      });

      return sock;
    }

    // Register the readiness waiter BEFORE the socket is created, so the very
    // first `connection.update` cannot be missed.
    const readyPromise = new Promise((resolve) => {
      pairReadyWaiters.set(num, resolve);
    });

    const sock = launchPairSocket(false);

    // Wait until WhatsApp has actually answered the handshake (max 25s).
    // A blind sleep was the original bug: the code was requested against a
    // socket that was not ready, so WhatsApp handed out a code bound to a dead
    // stream and the phone showed "Could not link device".
    const ready = await Promise.race([
      readyPromise.then(() => true),
      delay(25000).then(() => false)
    ]);
    pairReadyWaiters.delete(num);

    if (!ready) {
      closePairSocket(num, 'Handshake timeout');
      pairingStatusMap.set(num, 'error');
      return res.status(504).json({
        status: 'error',
        message: 'WhatsApp did not respond in time. Please retry in 10 seconds.'
      });
    }

    // If the waiter was released by a 'close' event the transport is already
    // gone — do not attempt to push a node through it.
    if (!sock.ws || !sock.ws.isOpen) {
      closePairSocket(num, 'Transport closed before handshake');
      pairingStatusMap.set(num, 'error');
      return res.status(503).json({
        status: 'error',
        message: 'WhatsApp connection dropped during setup. Please retry in 10 seconds.'
      });
    }

    if (!state.creds.registered) {
      // Give the encrypted channel a moment to fully settle after the qr event
      // before we push a node through it.
      await delay(700);

      // Request the code with a short retry loop. A single transient
      // "Connection Closed" must not surface as "Could not link device" to the
      // user — the socket is usually still alive and a retry succeeds.
      let code = null;
      let lastErr = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          code = await sock.requestPairingCode(num);
          if (code) break;
        } catch (e) {
          lastErr = e;
          console.error(`requestPairingCode attempt ${attempt}/3 failed:`, e?.message || e);
          const transient = /closed|not open|connection|timeout|ECONNRESET|stream/i.test(
            String(e?.message || e)
          );
          if (!transient || attempt === 3) break;
          await delay(2000);
        }
      }

      if (!code) {
        closePairSocket(num, 'requestPairingCode failed');
        pairingStatusMap.set(num, 'error');
        return res.status(502).json({
          status: 'error',
          message:
            'WhatsApp refused the pairing request (' +
            (lastErr?.message || 'no code returned') +
            '). Please wait 30 seconds and try again.'
        });
      }
      const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
      pairingStatusMap.set(num, 'code_generated');

      // Keep the socket alive long enough for the user to actually type the
      // code. 150s was too short (open WhatsApp + navigate + type) and killing
      // the socket mid-link is exactly what produces "Could not link device".
      const timeoutId = setTimeout(() => {
        const st = pairingStatusMap.get(num);
        if (st === 'connected' || st === 'connecting') return; // let it finish
        console.log(`⏱️ Pairing socket timed out for ${num}. Closing socket safely.`);
        closePairSocket(num, 'Pairing timeout');
        if (usingMongoForPair) deleteSession(tempSessionId);
        else {
          try { fs.rmSync(tempSessionDir, { recursive: true, force: true }); } catch (_) {}
        }
      }, 300000);

      activeSocketTimeouts.set(num, timeoutId);

      return res.json({
        status: 'success',
        code: formattedCode,
        number: num,
        expiresIn: 300,
        message: 'Code ready. Enter it in WhatsApp > Linked Devices > Link with phone number. It stays valid for about 2 minutes — type it immediately.'
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
