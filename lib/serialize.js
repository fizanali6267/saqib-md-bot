const { getContentType, jidDecode, downloadMediaMessage } = require('@whiskeysockets/baileys');
const lid = require('./lid');

/**
 * LID (Linked ID) helpers
 * -------------------------------------------------------------------------
 * WhatsApp now addresses many chats/participants as `<15-digit>@lid` instead of
 * `<phone>@s.whatsapp.net`. Printing a raw LID looks like a fake phone number to
 * the user ("@215753789857825"), and replying to a LID makes the recipient's
 * phone unable to decrypt the reply ("Waiting for this message").
 *
 * Baileys 6.7.x exposes the phone-number identity of the *sender* directly on
 * the message key:
 *    key.senderPn / key.senderLid
 *    key.participantPn / key.participantLid
 * (There is NO `remoteJidAlt` / `participantAlt` in this version — an earlier
 *  build of this file checked those non-existent fields, which is why LIDs kept
 *  leaking into every command output.)
 */

const digits = (j) => String(j || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
const isLid = (j) => typeof j === 'string' && j.endsWith('@lid');
const isPn = (j) => typeof j === 'string' && j.endsWith('@s.whatsapp.net');
const toPn = (d) => (d ? `${d}@s.whatsapp.net` : null);

/** Learn LID↔PN pairs from a message key so future lookups are instant. */
function learnFromKey(key) {
  if (!key) return;
  try {
    if (key.senderLid && key.senderPn) lid.addPair(key.senderLid, key.senderPn);
    if (key.participantLid && key.participantPn) lid.addPair(key.participantLid, key.participantPn);
    // Cross-fill: a LID participant + a PN sender (or vice-versa) also pairs up.
    if (key.participantLid && key.senderPn) lid.addPair(key.participantLid, key.senderPn);
    if (key.senderLid && key.participantPn) lid.addPair(key.senderLid, key.participantPn);
  } catch (_) {}
}

/**
 * Best-effort conversion of any JID into a phone-number JID.
 * Returns null when the number genuinely cannot be recovered.
 */
function resolvePn(jid) {
  if (!jid) return null;
  if (isPn(jid)) return jid;
  if (!isLid(jid)) {
    const d = digits(jid);
    // A LID is usually 15+ digits; real numbers with country code are 8–14.
    if (d.length >= 8 && d.length <= 14) return toPn(d);
  }
  const resolved = lid.resolve(jid);
  if (resolved) {
    const d = digits(resolved);
    if (d.length >= 8 && d.length <= 14) return toPn(d);
  }
  return null;
}

/**
 * Pick the first candidate that resolves to a phone-number JID.
 * Falls back to the first candidate untouched so we never end up with null.
 */
function firstPn(candidates, fallback) {
  for (const c of candidates) {
    const pn = resolvePn(c);
    if (pn) return pn;
  }
  for (const c of candidates) if (c) return c;
  return fallback || null;
}

function serialize(sock, m) {
  if (!m) return m;

  if (m.key) {
    learnFromKey(m.key);

    m.id = m.key.id;
    m.isBaileys = m.id.startsWith('BAE5') || m.id.length === 16;
    m.chat = m.key.remoteJid;
    m.fromMe = m.key.fromMe;
    // Keep the ORIGINAL addressing (may be a @lid) for delete / revoke calls,
    // while m.chat is normalised to a phone-number JID for sending.
    m.rawChat = m.key.remoteJid;
    m.rawKey = { ...m.key };

    // ---- LID (Linked ID) fix ----------------------------------------------
    if (m.chat && isLid(m.chat)) {
      const peerCandidates = [];
      // In a DM the sender IS the peer (unless the message is from us).
      if (!m.fromMe) {
        peerCandidates.push(m.key.senderPn, m.key.participantPn, m.key.senderLid, m.key.participantLid);
      }
      peerCandidates.push(m.chat);
      let pn = null;
      for (const c of peerCandidates) {
        pn = resolvePn(c);
        if (pn) break;
      }
      if (pn) {
        m.chat = pn;
      } else if (m.fromMe && sock.user?.id) {
        // Self-chat ("note to self"): reply to our own phone-number JID.
        m.chat = toPn(digits(sock.user.id));
      }
    }

    m.isGroup = m.chat.endsWith('@g.us');

    // CRITICAL: make the message key point at the same JID we will send to.
    // 20+ plugins do `sock.sendMessage(m.chat, {...}, { quoted: m })`. If the
    // key still carried a @lid while m.chat was a phone-number JID, WhatsApp
    // silently dropped the quoted reply / reaction. The original key is kept
    // in m.rawKey for delete/revoke calls.
    if (m.chat && m.key.remoteJid !== m.chat) {
      m.key = { ...m.key, remoteJid: m.chat };
    }

    // ---- Sender resolution (never expose a LID as a "number") -------------
    const senderCandidates = [];
    if (m.fromMe && sock.user?.id) senderCandidates.push(sock.user.id);
    if (m.key.participantPn) senderCandidates.push(m.key.participantPn);
    if (m.key.senderPn) senderCandidates.push(m.key.senderPn);
    if (m.key.participant) senderCandidates.push(m.key.participant);
    if (m.key.senderLid) senderCandidates.push(m.key.senderLid);
    if (m.key.participantLid) senderCandidates.push(m.key.participantLid);
    senderCandidates.push(m.chat);

    const senderJid = firstPn(senderCandidates, m.chat);
    m.sender = toPn(digits(senderJid));
    m.senderLid = m.key.senderLid || m.key.participantLid || null;
    m.pushName = m.pushName || m.key.pushName || '';
  }

  if (m.message) {
    // Issue 8 Fix: Recursively unwrap ephemeralMessage and documentWithCaptionMessage
    while (m.message?.ephemeralMessage || m.message?.documentWithCaptionMessage) {
      if (m.message.ephemeralMessage) {
        m.message = m.message.ephemeralMessage.message;
      } else {
        m.message = m.message.documentWithCaptionMessage.message;
      }
    }

    // Issue 6 Fix: Detect viewOnceMessage, viewOnceMessageV2, and viewOnceMessageV2Extension
    const viewOnceTypes = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];
    m.isViewOnce = false;

    for (const vot of viewOnceTypes) {
      if (m.message?.[vot]) {
        m.isViewOnce = true;
        const inner = m.message[vot].message;
        if (inner) {
          const innerType = getContentType(inner);
          m.msg = inner[innerType];
          m.type = innerType; // Sets real type (e.g. 'imageMessage', 'videoMessage')
        }
        break;
      }
    }

    if (!m.type) {
      m.type = getContentType(m.message);
      m.msg = m.message[m.type];
    }

    m.body = m.message.conversation ||
             (m.msg && m.msg.caption) ||
             (m.msg && m.msg.text) ||
             (m.type === 'extendedTextMessage' && m.msg && m.msg.text) ||
             '';

    // ---- Mentions: map LIDs to real phone numbers -------------------------
    const rawMentions = (m.msg && m.msg.contextInfo) ? (m.msg.contextInfo.mentionedJid || []) : [];
    m.rawMentionedJid = rawMentions.slice();
    m.mentionedJid = rawMentions.map((j) => resolvePn(j) || j);

    // Direct download helper on current message.
    // For view-once messages Baileys' downloadMediaMessage can unwrap the
    // wrapper, but some clients deliver the inner node without a usable
    // mediaKey on the wrapper. Passing the already-unwrapped inner node
    // ({ imageMessage: {...} }) is the most reliable path.
    m.download = () => downloadMediaMessage(
      {
        key: m.key,
        message: m.isViewOnce && m.type && m.msg ? { [m.type]: m.msg } : m.message
      },
      'buffer',
      {}
    );

    // Quoted message handling
    if (m.msg && m.msg.contextInfo && m.msg.contextInfo.quotedMessage) {
      m.quoted = {};
      // Keep the ORIGINAL quoted payload (with viewOnce wrapper intact) so
      // downloadMediaMessage can unwrap it itself.
      m.quoted.rawMessage = m.msg.contextInfo.quotedMessage;
      m.quoted.message = m.msg.contextInfo.quotedMessage;

      // Unwrap ephemeral in quoted message as well
      while (m.quoted.message?.ephemeralMessage || m.quoted.message?.documentWithCaptionMessage) {
        if (m.quoted.message.ephemeralMessage) {
          m.quoted.message = m.quoted.message.ephemeralMessage.message;
        } else {
          m.quoted.message = m.quoted.message.documentWithCaptionMessage.message;
        }
      }

      // Check viewOnce in quoted message
      m.quoted.isViewOnce = false;
      for (const vot of viewOnceTypes) {
        if (m.quoted.message?.[vot]) {
          m.quoted.isViewOnce = true;
          const qInner = m.quoted.message[vot].message;
          if (qInner) {
            const qInnerType = getContentType(qInner);
            m.quoted.msg = qInner[qInnerType];
            m.quoted.type = qInnerType;
          }
          break;
        }
      }

      if (!m.quoted.type) {
        m.quoted.type = getContentType(m.quoted.message);
        m.quoted.msg = m.quoted.message[m.quoted.type];
      }

      m.quoted.id = m.msg.contextInfo.stanzaId;
      const quotedSenderJid = m.msg.contextInfo.participant || '';
      // Resolve LID → phone so captions never show a fake number.
      const quotedPn = resolvePn(quotedSenderJid);
      m.quoted.sender = toPn(digits(quotedPn || quotedSenderJid));
      m.quoted.senderLid = isLid(quotedSenderJid) ? quotedSenderJid : null;
      m.quoted.fromMe = m.quoted.sender === toPn(digits(sock.user && sock.user.id));
      m.quoted.text = m.quoted.message.conversation ||
                      (m.quoted.msg && m.quoted.msg.caption) ||
                      (m.quoted.msg && m.quoted.msg.text) || '';
      m.quoted.pushName = m.msg.contextInfo.pushName || '';
      m.quoted.download = () => downloadMediaMessage(
        {
          key: {
            remoteJid: m.chat,
            id: m.quoted.id,
            participant: quotedSenderJid || m.quoted.sender
          },
          // Unwrapped view-once payload is the most reliable for Baileys.
          message: m.quoted.isViewOnce && m.quoted.type && m.quoted.msg
            ? { [m.quoted.type]: m.quoted.msg }
            : m.quoted.rawMessage
        },
        'buffer',
        {}
      );
    }
  }

  // Outgoing key: the message key must point at the SAME jid we send to.
  // When m.chat was normalised from `<id>@lid` to a phone-number JID, the raw
  // key still carried the LID, so reactions and quoted replies were addressed
  // to one jid while referencing a key from another. WhatsApp silently dropped
  // them -> ".autoreact all" looked enabled but never reacted.
  m.outKey = () => ({ ...m.key, remoteJid: m.chat });

  // Quick reply method
  m.reply = async (text, options = {}) => {
    const { quoted: q, ...rest } = options;
    // "Message Yourself" / self-chat: quoting our own message makes the
    // WhatsApp mobile app fail to render the reply, so send it clean.
    const isSelfChat = !m.isGroup && (
      m.fromMe || m.chat === (sock.user?.id?.split(':')[0] + '@s.whatsapp.net')
    );
    const quoted = q || (isSelfChat ? undefined : { key: m.outKey(), message: m.message });
    return await sock.sendMessage(m.chat, { text, ...rest }, quoted ? { quoted } : {});
  };

  // React to message method
  m.react = async (emoji) => {
    // WhatsApp protocol rule: `participant` belongs to GROUP keys only. Sending
    // it in a DM / self-chat makes the server silently discard the reaction —
    // this is why ".autoreact all" looked enabled but never reacted.
    const reactionKey = {
      remoteJid: m.chat,
      fromMe: m.fromMe,
      id: m.id,
      participant: m.isGroup ? (m.key?.participant || m.sender) : undefined
    };
    if (!reactionKey.participant) delete reactionKey.participant;

    return await sock.sendMessage(m.chat, {
      react: {
        text: emoji,
        key: reactionKey
      }
    });
  };

  return m;
}

module.exports = { serialize, resolvePn, digits, isLid };
