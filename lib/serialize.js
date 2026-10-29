const { getContentType, jidDecode, downloadMediaMessage } = require('@whiskeysockets/baileys');

function serialize(sock, m) {
  if (!m) return m;

  if (m.key) {
    m.id = m.key.id;
    m.isBaileys = m.id.startsWith('BAE5') || m.id.length === 16;
    m.chat = m.key.remoteJid;
    m.fromMe = m.key.fromMe;
    m.isGroup = m.chat.endsWith('@g.us');
    const senderJid = (m.fromMe && sock.user?.id) || m.participant || m.key.participant || m.chat || '';
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

  // Quick reply method
  m.reply = async (text, options = {}) => {
    return await sock.sendMessage(m.chat, { text, ...options }, { quoted: m });
  };

  // React to message method
  m.react = async (emoji) => {
    return await sock.sendMessage(m.chat, {
      react: {
        text: emoji,
        key: m.key
      }
    });
  };

  return m;
}

module.exports = { serialize };
