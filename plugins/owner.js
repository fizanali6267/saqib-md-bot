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

        // Build every plausible identifier for the target. WhatsApp's blocklist
        // IQ only accepts a real phone-number JID; a raw LID silently fails.
        const candidates = [];
        const push = (jid) => {
          if (!jid) return;
          const s = String(jid).trim();
          if (!s.includes('@')) {
            const d = s.replace(/[^0-9]/g, '');
            if (d.length >= 8 && d.length <= 15) candidates.push(`${d}@s.whatsapp.net`);
            return;
          }
          const pn = resolveTargetJid(s);
          if (pn) candidates.push(pn);
          // Keep the raw id as a last-resort (some groups address by LID).
          if (!candidates.includes(s)) candidates.push(s);
        };

        push(m.mentionedJid && m.mentionedJid[0]);
        if (m.quoted) {
          push(m.quoted.sender);
          push(m.quoted.senderLid);
        }
        if (args[0]) push(args[0]);

        const unique = [...new Set(candidates)].filter(Boolean);
        if (!unique.length) {
          return m.reply(
            `❓ *Usage:*\n• Reply to a message and type *${prefix}${command}*\n• Or mention someone: *${prefix}${command} @user*\n• Or give a number: *${prefix}${command} 923001234567*`
          );
        }

        // Never allow blocking the bot itself or the owner.
        const selfNum = String(sock?.user?.id || '').replace(/[^0-9]/g, '').slice(0, 12);
        const ownerNums = (config.OWNER_NUMBERS || []).map((n) => String(n).replace(/[^0-9]/g, ''));
        const isProtected = (jid) => {
          const d = String(jid).split('@')[0].replace(/[^0-9]/g, '');
          if (!d) return false;
          if (selfNum && d === selfNum) return true;
          if (ownerNums.includes(d)) return true;
          return false;
        };

        // ---- Resolve the single best target -------------------------------
        const pnJid = unique.find((j) => j.endsWith('@s.whatsapp.net')) || null;
        const rawJid = unique.find((j) => !j.endsWith('@s.whatsapp.net')) || null;
        const target = pnJid || rawJid;

        if (isProtected(target)) {
          return m.reply('🛡️ *You cannot block the bot itself or the owner.*');
        }

        const num = String(target).split('@')[0];

        // ---- 1) Bot-level blocklist (always works, even for LID) ----------
        let listChanged = false;
        if (action === 'block') {
          listChanged = blocklist.add(pnJid || target);
          if (rawJid) blocklist.add(rawJid);
        } else {
          listChanged = blocklist.remove(pnJid || target);
          if (rawJid) blocklist.remove(rawJid);
        }

        // ---- 2) Native WhatsApp block (best effort) -----------------------
        let waOk = false;
        let waErr = null;
        for (const jid of unique) {
          try {
            await sock.updateBlockStatus(jid, action);
            waOk = true;
            break;
          } catch (e) {
            waErr = e;
          }
        }

        if (action === 'block') {
          await m.reply(
            `🚫 *@${num}* has been blocked!`,
            { mentions: [`${num}@s.whatsapp.net`] }
          );
        } else {
          await m.reply(
            `✅ *@${num}* has been unblocked!`,
            { mentions: [`${num}@s.whatsapp.net`] }
          );
        }

        // Only surface a warning when BOTH paths failed.
        if (!waOk && !listChanged) {
          const detail = (waErr && (waErr.message || waErr.output?.payload?.message)) || 'unknown error';
          await m.reply(
            `⚠️ *Note:* WhatsApp-level ${action} failed (${detail}), ` +
            `but the bot blocklist was updated.`
          );
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
