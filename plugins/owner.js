const crypto = require("crypto");
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const config = require('../config');

module.exports = {
  name: 'owner',
  commands: ['mode', 'public', 'private', 'setpp', 'setppbot', 'block', 'unblock', 'broadcast', 'bc', 'join'],
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
        await m.reply(`🌐 *Bot Mode switched to PUBLIC!*\nEveryone can now interact with Saqib-MD.`);
        break;
      }

      case 'private': {
        config.WORK_TYPE = 'private';
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

      case 'block': {
        const target = m.mentionedJid[0] || (m.quoted ? m.quoted.sender : (args[0] ? `${args[0].replace(/[^0-9]/g, '')}@s.whatsapp.net` : null));
        if (!target) return m.reply(`❓ Mention a user or provide their number to block.`);
        await sock.updateBlockStatus(target, 'block');
        await m.reply(`🚫 @${target.split('@')[0]} has been blocked from contacting the bot!`, { mentions: [target] });
        break;
      }

      case 'unblock': {
        const target = m.mentionedJid[0] || (m.quoted ? m.quoted.sender : (args[0] ? `${args[0].replace(/[^0-9]/g, '')}@s.whatsapp.net` : null));
        if (!target) return m.reply(`❓ Mention a user or provide their number to unblock.`);
        await sock.updateBlockStatus(target, 'unblock');
        await m.reply(`✅ @${target.split('@')[0]} has been unblocked!`, { mentions: [target] });
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
        const link = args[0];
        if (!link || !link.includes('chat.whatsapp.com/')) {
          return m.reply(`❓ Provide a valid WhatsApp group invite link!\nExample: *${prefix}join https://chat.whatsapp.com/xxx*`);
        }
        try {
          const code = link.split('chat.whatsapp.com/')[1].trim();
          await sock.groupAcceptInvite(code);
          await m.reply(`✅ Successfully joined the group!`);
        } catch (e) {
          await m.reply('❌ Failed to join group. Invite link may be revoked or expired.');
        }
        break;
      }
    }
  }
};
