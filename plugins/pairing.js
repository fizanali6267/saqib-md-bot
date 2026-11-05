const axios = require('axios');
const config = require('../config');

/**
 * .pair — get a WhatsApp pairing code straight from the chat.
 * -------------------------------------------------------------------------
 * The owner can link the bot to a new phone number without opening the web
 * portal: send `.pair 92300xxxxxxx` and the bot returns an 8-digit code plus
 * the pairing link. The heavy lifting is delegated to the existing /pair
 * endpoint so all the safety checks (owner allowlist, rate limiting, socket
 * cleanup) apply exactly as they do on the website.
 */

const PAIR_LINK = (config.PAIRING_LINK || 'https://saqibmd.up.railway.app').replace(/\/+$/, '');

function normalise(raw) {
  let n = String(raw || '').replace(/[^0-9]/g, '');
  if (n.startsWith('00')) n = n.slice(2);
  // 03001234567 -> 923001234567
  if (n.startsWith('03') && n.length === 11) n = '92' + n.slice(1);
  return n;
}

module.exports = {
  name: 'pairing',
  commands: ['pair', 'paircode', 'pairlink'],

  execute: async (sock, m, { command, args, prefix }) => {
    const isOwner = config.checkIsOwner(m, sock);

    // Only the owner may generate codes — otherwise anyone could hijack the
    // bot session by pairing their own number.
    if (!isOwner) {
      return m.reply('🔒 *Owner only.* This command can only be used by the bot owner.');
    }

    // .pairlink / .link / .connect with no argument -> just show the portal
    const wantsLinkOnly = ['pairlink', 'link', 'connect'].includes(command) || !args[0];

    if (wantsLinkOnly) {
      return m.reply(
        `🔗 *SAQIB-MD PAIRING PORTAL*\n\n` +
        `🌐 *Link:* ${PAIR_LINK}\n` +
        `📱 *Or use:* ${prefix}pair 92300xxxxxxx\n\n` +
        `_Open the link, enter the number, then type the 8-digit code in_\n` +
        `_WhatsApp → Linked Devices → Link with phone number._`
      );
    }

    const number = normalise(args[0]);

    if (!number || number.length < 10 || number.length > 15) {
      return m.reply(
        `❌ *Invalid number.*\n\n` +
        `Send the number with its country code, for example:\n` +
        `*${prefix}pair 923001234567*`
      );
    }

    await m.react('⏳').catch(() => null);

    try {
      const port = config.PORT || 3000;
      const res = await axios.get(`http://127.0.0.1:${port}/pair`, {
        params: { number },
        timeout: 60000,
        validateStatus: () => true
      });

      const data = res.data || {};

      if (res.status !== 200 || data.status !== 'success' || !data.code) {
        const reason = data.message || `Pairing server returned status ${res.status}.`;
        return m.reply(
          `⚠️ *Could not generate a pairing code.*\n\n` +
          `📄 *Reason:* ${reason}\n\n` +
          `🌐 You can still try the portal: ${PAIR_LINK}`
        );
      }

      await m.react('✅').catch(() => null);

      return m.reply(
        `⚡ *──「 PAIRING CODE GENERATED 」──* ⚡\n\n` +
        `📱 *Number:* ${data.number || number}\n` +
        `🔑 *Code:* *${data.code}*\n` +
        `⏳ *Valid for:* ${data.expiresIn || 150} seconds\n\n` +
        `📲 *How to link:*\n` +
        `1. Open WhatsApp on that phone\n` +
        `2. Settings → Linked Devices → Link a Device\n` +
        `3. Tap *Link with phone number instead*\n` +
        `4. Enter the code above\n\n` +
        `🌐 *Portal:* ${PAIR_LINK}\n\n` +
        `_The bot will restart automatically once the number is linked._`
      );
    } catch (e) {
      return m.reply(
        `⚠️ *Pairing request failed.*\n\n` +
        `The bot could not reach its own pairing service. Please try again in a minute.\n` +
        `🌐 Portal: ${PAIR_LINK}`
      );
    }
  }
};
