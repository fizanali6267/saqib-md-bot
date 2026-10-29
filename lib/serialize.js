const { getContentType, jidDecode, downloadMediaMessage } = require('@whiskeysockets/baileys');
const lid = require('./lid');

function serialize(sock, m) {
  if (!m) return m;

  if (m.key) {
    m.id = m.key.id;
    m.isBaileys = m.id.startsWith('BAE5') || m.id.length === 16;
    m.chat = m.key.remoteJid;
    m.fromMe = m.key.fromMe;
    // Keep the ORIGINAL addressing (may be a @lid) for delete / revoke calls,
    // while m.chat is normalised to a phone-number JID for sending.
    m.rawChat = m.key.remoteJid;
    m.rawKey = { ...m.key };

    // ---- LID (Linked ID) fix ----------------------------------------------
    // WhatsApp now addresses many chats as `<id>@lid` instead of the phone
    // number. Replying to a LID JID makes the recipient's phone unable to
    // decrypt the reply, which shows up as
    //   "Waiting for this message. This may take a while."
    // Baileys exposes the phone-number JID as `remoteJidAlt`; always prefer it.
    if (m.chat && m.chat.endsWith('@lid') && m.key.remoteJidAlt && !m.key.remoteJidAlt.endsWith('@lid')) {
      m.chat = m.key.remoteJidAlt;
    }

    // Our own LID→phone map (built from contacts / group participants).
    if (m.chat && m.chat.endsWith('@lid')) {
      const pn = lid.resolve(m.chat);
      if (pn) m.chat = pn;
    }

    // Self-chat ("note to self") case: the chat arrives as the account's own
    // LID. Baileys 6.7.x has no LID->PN resolver, so a reply addressed to the
    // LID never decrypts on the phone ("Waiting for this message"). The bot
    // knows its own phone-number JID, so use that instead.
    if (m.chat && m.chat.endsWith('@lid') && m.fromMe && sock.user?.id) {
      const ownPn = sock.user.id.split(':')[0].split('@')[0] + '@s.whatsapp.net';
      if (ownPn) m.chat = ownPn;
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
    let senderJid = (m.fromMe && sock.user?.id) || m.participant || m.key.participant || m.chat || '';
    if (senderJid && senderJid.endsWith('@lid') && m.key.participantAlt && !m.key.participantAlt.endsWith('@lid')) {
      senderJid = m.key.participantAlt;
    }
    m.sender = (jidDecode(senderJid)?.user || senderJid.split('@')[0]) + '@s.whatsapp.net';
  }

  if (m.message) {
    // Issue 8 Fix: Recursively unwrap ephemeralMessage and documentWithCaptionMessage
    while (m.message?.ephemeralMessage || m.message?.documentWithCaptionMessage) {
      if (m.message.ephemeralMessage) {
        m.message = m.message.ephemeralMessage.message;
      } else if (m.message.documentWithCaptionMessage) {
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

    m.mentionedJid = (m.msg && m.msg.contextInfo) ? m.msg.contextInfo.mentionedJid || [] : [];

    // Direct download helper on current message
    m.download = () => downloadMediaMessage(
      { key: m.key, message: m.message },
      'buffer',
      {}
    );

    // Quoted message handling
    if (m.msg && m.msg.contextInfo && m.msg.contextInfo.quotedMessage) {
      m.quoted = {};
      m.quoted.message = m.msg.contextInfo.quotedMessage;

      // Unwrap ephemeral in quoted message as well
      while (m.quoted.message?.ephemeralMessage || m.quoted.message?.documentWithCaptionMessage) {
        if (m.quoted.message.ephemeralMessage) {
          m.quoted.message = m.quoted.message.ephemeralMessage.message;
        } else if (m.quoted.message.documentWithCaptionMessage) {
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
      m.quoted.sender = (jidDecode(quotedSenderJid)?.user || quotedSenderJid.split('@')[0]) + '@s.whatsapp.net';
      m.quoted.fromMe = m.quoted.sender === (sock.user && (jidDecode(sock.user.id)?.user + '@s.whatsapp.net'));
      m.quoted.text = m.quoted.message.conversation || 
                      (m.quoted.msg && m.quoted.msg.caption) || 
                      (m.quoted.msg && m.quoted.msg.text) || '';
      m.quoted.download = () => downloadMediaMessage(
        { key: { remoteJid: m.chat, id: m.quoted.id, participant: m.quoted.sender }, message: m.quoted.message },
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

module.exports = { serialize };
