const crypto = require("crypto");
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const config = require('../config');

// Resolve any user identifier (mention / quoted sender / raw number / LID) to a
// real phone-number JID that `sock.updateBlockStatus` can act on.
function resolveTargetJid(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  try {
    const { resolvePn } = require('../lib/serialize');
    const pn = resolvePn(s);
    if (pn) return pn;
  } catch (_) {}
  const d = s.replace(/[^0-9]/g, '');
  if (d.length >= 8 && d.length <= 14) return `${d}@s.whatsapp.net`;
  return null;
}

// Resolve a raw identifier into BOTH the phone-number JID and the WhatsApp LID.
// The LID is required: since WhatsApp's LID rollout the block IQ must carry
// `jid` (the LID) *and* `pn_jid` (the phone number), otherwise the server
// answers with a generic 500 "Internal Server Error" and nothing is blocked.
// See WhiskeySockets/Baileys issue #2200.
async function resolveIdentities(sock, raw) {
  const s = String(raw || '').trim();
  if (!s) return { pnJid: null, lidJid: null, exists: null };

  if (s.includes('@lid')) {
    const lid = s.split(':')[0].includes('@') ? s.split(':')[0] : s;
    return { pnJid: null, lidJid: lid.endsWith('@lid') ? lid : `${lid}@lid`, exists: null };
  }

  let digits = s.replace(/[^0-9]/g, '');
  if (digits.length > 15) digits = digits.slice(0, 15);
  if (!digits) return { pnJid: null, lidJid: null, exists: null };

  let pnJid = `${digits}@s.whatsapp.net`;
  let lidJid = null;
  let exists = null;
  try {
    if (typeof sock.onWhatsApp === 'function') {
      const wa = await sock.onWhatsApp(digits);
      if (Array.isArray(wa) && wa[0]) {
        if (wa[0].jid) {
          const pn = String(wa[0].jid).split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
          if (pn) pnJid = `${pn}@s.whatsapp.net`;
        }
        if (wa[0].lid) {
          const lid = String(wa[0].lid).split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
          if (lid) lidJid = `${lid}@lid`;
        }
        exists = wa[0].exists !== false;
      }
    }
  } catch (_) {}
  return { pnJid, lidJid, exists };
}

// Send the LID-aware blocklist IQ. This is the ONLY reliable way to block /
// unblock on an account that has been migrated to WhatsApp's LID addressing.
async function nativeBlockStatus(sock, { pnJid, lidJid }, action) {
  if (!sock || typeof sock.query !== 'function') throw new Error('socket query unavailable');
  if (action === 'block') {
    if (!pnJid) throw new Error('No phone-number JID for this contact');
    if (!lidJid) throw new Error('Could not resolve the WhatsApp LID for this contact');
    await sock.query({
      tag: 'iq',
      attrs: { xmlns: 'blocklist', to: 's.whatsapp.net', type: 'set' },
      content: [{ tag: 'item', attrs: { action: 'block', jid: lidJid, pn_jid: pnJid } }],
    });
  } else {
    const jid = lidJid || pnJid;
    if (!jid) throw new Error('No target JID');
    await sock.query({
      tag: 'iq',
      attrs: { xmlns: 'blocklist', to: 's.whatsapp.net', type: 'set' },
      content: [{ tag: 'item', attrs: { action: 'unblock', jid } }],
    });
  }
}

module.exports = {
  name: 'owner',
  commands: ['mode', 'public', 'private', 'setpp', 'setppbot', 'block', 'unblock', 'blocklist', 'broadcast', 'bc', 'join', 'leave', 'left'],
  execute: async (sock, m, { command, args, prefix }) => {
    // Owner Only Authorization check
    const isOwner = config.checkIsOwner(m, sock);
    if (!isOwner) return m.reply(config.MESSAGES.OWNER_ONLY);

    switch (command) {
      case 'mode': {
        const targetMode = args[0]?.toLowerCase();
        if (targetMode === 'public') {
          config.WORK_TYPE = 'public';
          await m.reply(`🌐 *Bot Mode set to PUBLIC!*\nAll users in groups and private chats can now access public commands.`);
        } else if (targetMode === 'private') {
          config.WORK_TYPE = 'private';
          await m.reply(`🔒 *Bot Mode set to PRIVATE!*\nSaqib-MD is now locked. Only you (the owner) can execute commands. The bot will completely ignore all other users.`);
        } else {
          await m.reply(`⚙️ *Current Mode:* *${config.WORK_TYPE.toUpperCase()}*\n\nUsage: *${prefix}mode public* or *${prefix}mode private*`);
        }
        break;
      }

      case 'public': {
        config.WORK_TYPE = 'public';
        config.persistSettings?.();
        await m.reply(`🌐 *Bot Mode switched to PUBLIC!*\nEveryone can now interact with Saqib-MD.`);
        break;
      }

      case 'private': {
        config.WORK_TYPE = 'private';
        config.persistSettings?.();
        await m.reply(`🔒 *Bot Mode switched to PRIVATE!*\nBot is now in stealth mode. Only the owner can issue commands.`);
        break;
      }

      case 'setpp':
      case 'setppbot': {
        const targetMsg = m.quoted ? m.quoted : m;
        if (!targetMsg || !targetMsg.type?.includes('image')) {
          return m.reply(`❓ Reply to any photo with *${prefix}setpp* to update your Profile Picture!\n\n` +
            `📌 *Available Sizing Options:*\n` +
            `• *${prefix}setpp* (or *${prefix}setpp full*) - Full size with luxury blurred borders (No Crop!)\n` +
            `• *${prefix}setpp square* - Standard 1:1 square crop\n` +
            `• *${prefix}setpp fit* - Fits horizontal/vertical with sleek black padding\n` +
            `• *${prefix}setpp normal* - Direct default upload`);
        }

        const mode = args[0]?.toLowerCase() || 'full';
        await m.react('⏳');

        try {
          const mediaBuffer = await targetMsg.download();
          const tmpId = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
          const tmpIn = path.join(os.tmpdir(), `pp_in_${tmpId}.jpg`);
          const tmpOut = path.join(os.tmpdir(), `pp_out_${tmpId}.jpg`);

          fs.writeFileSync(tmpIn, mediaBuffer);

          let filterComplex = '';
          if (mode === 'square') {
            filterComplex = '-vf "crop=w=min(iw\\,ih):h=min(iw\\,ih),scale=720:720"';
          } else if (mode === 'fit') {
            filterComplex = '-vf "scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(ow-iw)/2:(oh-ih)/2:black"';
          } else if (mode === 'normal') {
            filterComplex = '-vf "scale=720:720"';
          } else {
            // Default: Full No-Crop with aesthetic blurred background padding
            filterComplex = '-filter_complex "[0:v]scale=720:720,boxblur=25:5[bg];[0:v]scale=720:720:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2"';
          }

          exec(`ffmpeg -y -i "${tmpIn}" ${filterComplex} -frames:v 1 -q:v 2 "${tmpOut}"`, async (err) => {
            try {
              let finalBuffer;
              if (!err && fs.existsSync(tmpOut)) {
                finalBuffer = fs.readFileSync(tmpOut);
              } else {
                finalBuffer = mediaBuffer;
              }

              await sock.updateProfilePicture(sock.user.id, finalBuffer);

              // Clean up temporary files
              try { fs.unlinkSync(tmpIn); } catch (_) {}
              try { fs.unlinkSync(tmpOut); } catch (_) {}

              await m.reply(`🖼️ *Profile Picture Updated Successfully!*\n\n• *Mode Applied:* ${mode.toUpperCase()} (Full Size / No-Crop)\n• *Status:* Clean & High Definition`);
              await m.react('✅');
            } catch (updateErr) {
              await m.reply('❌ Error updating profile picture: ' + updateErr.message);
            }
          });

        } catch (e) {
          await m.reply('❌ Failed to process profile picture: ' + e.message);
        }
        break;
      }

      case 'block':
      case 'unblock':
      case 'blocklist': {
        const blocklist = require('../lib/blocklist');

        // ---- .blocklist : show everyone currently blocked -----------------
        if (command === 'blocklist') {
          const arr = blocklist.list();
          if (!arr.length) return m.reply('📭 *Blocklist is empty.*');
          const body = arr.map((n, i) => `${i + 1}. +${n}`).join('\n');
          return m.reply(`🚫 *BLOCKED CONTACTS (${arr.length})*\n\n${body}\n\n_Use ${prefix}unblock <number> to restore access._`);
        }

        const action = command === 'block' ? 'block' : 'unblock';

        // Collect every plausible identifier for the target.
        const raws = [];
        if (m.mentionedJid && m.mentionedJid[0]) raws.push(m.mentionedJid[0]);
        if (m.quoted) {
          if (m.quoted.sender) raws.push(m.quoted.sender);
          if (m.quoted.senderLid) raws.push(m.quoted.senderLid);
        }
        if (args[0]) raws.push(args[0]);

        if (!raws.length) {
          return m.reply(
            `❓ *Usage:*\n• Reply to a message and type *${prefix}${command}*\n• Or mention someone: *${prefix}${command} @user*\n• Or give a number: *${prefix}${command} 923001234567*`
          );
        }

        // ---- Resolve phone-number JID + LID --------------------------------
        let pnJid = null;
        let lidJid = null;
        let exists = null;
        for (const raw of raws) {
          const r = await resolveIdentities(sock, raw);
          if (!pnJid && r.pnJid) pnJid = r.pnJid;
          if (!lidJid && r.lidJid) lidJid = r.lidJid;
          if (r.exists === false) exists = false;
          if (pnJid && lidJid) break;
        }

        const target = pnJid || lidJid;
        if (!target) {
          return m.reply(`❓ Could not understand that contact. Give a number like *${prefix}${command} 923001234567*`);
        }

        // Never allow blocking the bot itself or the owner.
        const selfNum = String(sock?.user?.id || '').replace(/[^0-9]/g, '').slice(0, 12);
        const ownerNums = (config.OWNER_NUMBERS || []).map((n) => String(n).replace(/[^0-9]/g, ''));
        const isProtected = (jid) => {
          if (!jid) return false;
          const d = String(jid).split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
          if (!d) return false;
          if (selfNum && d === selfNum) return true;
          if (ownerNums.includes(d)) return true;
          return false;
        };
        if (isProtected(pnJid) || isProtected(lidJid)) {
          return m.reply('🛡️ *You cannot block the bot itself or the owner.*');
        }

        const num = String(pnJid || lidJid).split('@')[0].split(':')[0];

        // ---- 1) Bot-level blocklist (always works, even without a LID) ----
        let listChanged = false;
        if (action === 'block') {
          if (pnJid) listChanged = blocklist.add(pnJid) || listChanged;
          if (lidJid) listChanged = blocklist.add(lidJid) || listChanged;
        } else {
          if (pnJid) listChanged = blocklist.remove(pnJid) || listChanged;
          if (lidJid) listChanged = blocklist.remove(lidJid) || listChanged;
        }

        // ---- 2) Native WhatsApp block (LID-aware IQ) ----------------------
        let waOk = false;
        let waErr = null;
        try {
          await nativeBlockStatus(sock, { pnJid, lidJid }, action);
          waOk = true;
        } catch (e) {
          waErr = e;
        }

        // ---- 3) Verify against the server's authoritative blocklist -------
        let verified = null; // true / false / null (couldn't check)
        try {
          if (typeof sock.fetchBlocklist === 'function') {
            const serverList = await sock.fetchBlocklist();
            const wanted = new Set(
              (serverList || []).map((j) => String(j).split('@')[0].split(':')[0].replace(/[^0-9]/g, ''))
            );
            const keys = [String(num).replace(/[^0-9]/g, '')];
            if (lidJid) keys.push(String(lidJid).split('@')[0].replace(/[^0-9]/g, ''));
            if (pnJid) keys.push(String(pnJid).split('@')[0].replace(/[^0-9]/g, ''));
            verified = keys.some((k) => k && wanted.has(k));
          }
        } catch (_) { verified = null; }

        const waConfirmed = verified === true;

        if (action === 'block') {
          if (waConfirmed) {
            await m.reply(`🚫 *@${num}* has been blocked on WhatsApp.`, {
              mentions: [`${num}@s.whatsapp.net`],
            });
          } else if (listChanged) {
            await m.reply(
              `🛡️ *@${num}* is now blocked inside the bot.*\n\n` +
              `⚠️ WhatsApp-level block did not confirm` +
              (waErr ? ` (${(waErr.message || '').slice(0, 80)})` : '') +
              `.\nThe contact can still message your number, but Saqib-MD will ignore them completely.`,
              { mentions: [`${num}@s.whatsapp.net`] }
            );
          } else {
            await m.reply(
              `❌ *Could not block @${num}.*\n\n` +
              `WhatsApp rejected the request and the bot blocklist could not be saved.` +
              (waErr ? `\n_Reason:_ ${(waErr.message || '').slice(0, 120)}` : '')
            );
          }
        } else {
          if (waOk || listChanged) {
            await m.reply(`✅ *@${num}* has been unblocked.`, {
              mentions: [`${num}@s.whatsapp.net`],
            });
          } else if (verified === false) {
            await m.reply(`❌ *@${num}* was not in the blocklist — nothing to unblock.`);
          } else {
            await m.reply(
              `❌ *Could not unblock @${num}.*` +
              (waErr ? `\n_Reason:_ ${(waErr.message || '').slice(0, 120)}` : '')
            );
          }
        }
        break;
      }

      case 'broadcast':
      case 'bc': {
        const text = args.join(' ');
        if (!text) return m.reply(`❓ Enter message to broadcast!\nExample: *${prefix}bc Hello everyone, Saqib-MD is updated!*`);

        await m.reply(`📢 *Transmitting broadcast to all active groups...*`);
        try {
          const groups = await sock.groupFetchAllParticipating();
          const groupList = Object.values(groups);
          let success = 0;

          for (let group of groupList) {
            await sock.sendMessage(group.id, {
              text: `📢 *── 「 SAQIB-MD OFFICIAL BROADCAST 」 ──*\n\n${text}\n\n_⚡ Dispatched by Developer: ${config.OWNER_NAME}_`
            });
            success++;
            await new Promise(r => setTimeout(r, 1000));
          }
          await m.reply(`✅ Broadcast delivered to *${success}* groups successfully.`);
        } catch (e) {
          await m.reply('❌ Broadcast error: ' + e.message);
        }
        break;
      }

      case 'join': {
        const raw = args.join(' ').trim();
        const match = raw.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/i);
        if (!match) {
          return m.reply(`❓ Provide a valid WhatsApp group invite link!\nExample: *${prefix}join https://chat.whatsapp.com/xxxxxxxx*`);
        }
        const code = match[1];
        try {
          const joined = await sock.groupAcceptInvite(code);
          await m.reply(`✅ Successfully joined the group!${joined ? `\n🆔 ${joined}` : ''}`);
        } catch (e) {
          const msg = String(e && (e.message || e.output?.payload?.message) || 'unknown error');
          if (/already|conflict|409/i.test(msg)) {
            return m.reply('ℹ️ The bot is already a member of that group.');
          }
          await m.reply(`❌ Failed to join group.\n*Reason:* ${msg}\n\n💡 The invite link may be expired, revoked, or the group may be full.`);
        }
        break;
      }

      case 'leave':
      case 'left': {
        if (!m.isGroup) {
          return m.reply(`❓ This command only works inside a group.\nSend *${prefix}${command}* in the group you want the bot to leave.`);
        }
        await m.reply(`👋 *Goodbye!* Saqib-MD is leaving this group now.`);
        try {
          await sock.groupLeave(m.chat);
        } catch (e) {
          await m.reply(`❌ Failed to leave the group: ${e && e.message ? e.message : 'unknown error'}`);
        }
        break;
      }
    }
  }
};
