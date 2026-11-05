const { getContentType, jidDecode, downloadMediaMessage } = require('@whiskeysockets/baileys');
const lid = require('./lid');
const identity = require('./identity');

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
 * NOTE: a 15+ digit value is a LID, never a phone number — we must not turn it
 * into `<15-digit>@s.whatsapp.net`, that JID does not exist.
 */
function resolvePn(jid) {
  return identity.resolvePnStrict(jid);
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
    // Keep the ORIGINAL addressing. A `@lid` is a perfectly routable JID and
    // Baileys translates it correctly on send (it swaps in `creds.me.lid` for
    // our own devices). Rewriting it into `<15-digit>@s.whatsapp.net` created a
    // JID that does not exist, which is what produced
    // "Waiting for this message. This may take a while."
    m.rawChat = m.key.remoteJid;
    m.rawKey = { ...m.key };
    m.chat = m.rawChat;
    m.fromMe = !!m.key.fromMe;

    const own = identity.ownIdentifiers(sock);
    m.selfPn = own.pnJid;
    m.selfLid = own.lidJid;

    // ---- Sender resolution (never invent a phone number) ------------------
    // In a group the sender is `participant`; in a DM it is the chat itself.
    const senderRaw = m.key.participant || m.rawChat;
    m.senderRaw = senderRaw;
    m.sender = identity.senderJid(senderRaw) || m.rawChat;
    m.senderNumber = identity.digits(m.sender);
    m.senderLid = isLid(senderRaw) ? senderRaw : (lid.toLid ? lid.toLid(senderRaw) : null);

    // ---- fromMe fix for LID-addressed groups ------------------------------
    // Baileys compares `participant` against `creds.me.id` (the phone number).
    // In a LID group the participant is our LID, so `fromMe` arrives as false
    // for messages the owner sent from their own phone -> private mode ignored
    // the owner, and public mode made the bot answer itself.
    if (!m.fromMe && identity.isOwnJid(senderRaw, own)) {
      m.fromMe = true;
      m.sender = own.pnJid || m.sender;
      m.senderNumber = own.pn;
    }

    m.isGroup = m.chat.endsWith('@g.us');
    m.addressingMode = isLid(m.chat) ? 'lid' : 'pn';
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
      // Resolve LID -> phone only when the mapping is actually known; otherwise
      // keep the original JID so mentions/tags still work.
      m.quoted.sender = identity.senderJid(quotedSenderJid) || quotedSenderJid;
      m.quoted.senderLid = isLid(quotedSenderJid) ? quotedSenderJid : null;
      m.quoted.fromMe = identity.isOwnJid(quotedSenderJid, identity.ownIdentifiers(sock));
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
    const own = identity.ownIdentifiers(sock);
    const isSelfChat = !m.isGroup && (m.fromMe || identity.isOwnJid(m.chat, own));
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
