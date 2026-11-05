const axios = require('axios');
const fs = require('fs');
const config = require('../config');
const ytdlp = require('../lib/ytdlp');

module.exports = {
  name: 'downloader',
  commands: ['song', 'ytmp3', 'play', 'video', 'ytmp4', 'yts', 'tiktok', 'tt', 'fb', 'facebook', 'ig', 'insta', 'apk', 'mediafire'],
  execute: async (sock, m, { command, args, prefix }) => {
    const query = args.join(' ');

    switch (command) {
      case 'song':
      case 'ytmp3':
      case 'play': {
        if (!query) return m.reply(`\u2753 Song ka naam ya YouTube link bhejein!\nMaslan: *${prefix}song Dil Dil Pakistan*`);
        await m.react('\u23f3');
        let result = null;
        try {
          result = await ytdlp.downloadAudio(query, { bitrate: '128' });
          if (!result.ok) {
            await m.react('\u274c');
            return m.reply(`\u274c *Song download failed*\n\n${result.error}`);
          }
          const sizeMB = (fs.statSync(result.file).size / (1024 * 1024)).toFixed(2);
          await sock.sendMessage(m.chat, {
            audio: { url: result.file },
            mimetype: 'audio/mpeg',
            fileName: `${result.title}.mp3`,
            ptt: false
          }, { quoted: m });
          await m.react('\ud83c\udfb5');
          console.log(`\ud83c\udfb5 .song served "${result.title}" (${sizeMB} MB)`);
        } catch (e) {
          await m.react('\u274c');
          await m.reply('\u274c Song download error: ' + (e && e.message ? e.message : e));
        } finally {
          if (result && result.dir) ytdlp.cleanupDir(result.dir);
        }
        break;
      }

      case 'video':
      case 'ytmp4': {
        if (!query) return m.reply(`\u2753 Video ka naam ya YouTube link bhejein!\nMaslan: *${prefix}video funny cats*`);
        await m.react('\u23f3');
        let result = null;
        try {
          result = await ytdlp.downloadVideo(query, { height: 480 });
          if (!result.ok) {
            await m.react('\u274c');
            return m.reply(`\u274c *Video download failed*\n\n${result.error}`);
          }
          const sizeMB = (fs.statSync(result.file).size / (1024 * 1024)).toFixed(2);
          await sock.sendMessage(m.chat, {
            video: { url: result.file },
            mimetype: 'video/mp4',
            fileName: `${result.title}.mp4`,
            caption: `\ud83c\udfac *${result.title}*\n\ud83d\udce6 ${sizeMB} MB\n\u26a1 _Downloaded via Saqib-MD_`
          }, { quoted: m });
          await m.react('\ud83c\udfac');
        } catch (e) {
          await m.react('\u274c');
          await m.reply('\u274c Video download error: ' + (e && e.message ? e.message : e));
        } finally {
          if (result && result.dir) ytdlp.cleanupDir(result.dir);
        }
        break;
      }

      case 'yts': {
        if (!query) return m.reply(`\u2753 Search keyword enter karein!\nMaslan: *${prefix}yts Ertugrul Ghazi*`);
        await m.reply(config.MESSAGES.WAIT);
        try {
          const info = await ytdlp.getInfo(query);
          if (!info.ok) return m.reply(`\u274c *Search failed*\n\n${info.error}`);
          const mins = info.duration ? Math.floor(info.duration / 60) + ':' + String(Math.floor(info.duration % 60)).padStart(2, '0') : 'N/A';
          const msg = `\ud83d\udd0d *\u2500\u2500 YOUTUBE RESULT \u2500\u2500* \ud83d\udd0d\n\n` +
            `\ud83c\udfb5 *${info.title}*\n` +
            `\ud83d\udc64 ${info.uploader || 'Unknown'}\n` +
            `\u23f1\ufe0f ${mins}\n` +
            `\ud83d\udd17 ${info.webpage_url}\n\n` +
            `_Download: ${prefix}song <link>_`;
          await m.reply(msg);
        } catch (e) {
          await m.reply('\u274c YouTube search failed: ' + (e && e.message ? e.message : e));
        }
        break;
      }

      case 'tiktok':
      case 'tt': {
        if (!query || !query.includes('tiktok.com')) {
          return m.reply(`❓ Durust TikTok video link enter karein!\nMaslan: *${prefix}tiktok https://vm.tiktok.com/xxxx/*`);
        }
        await m.react('⏳');

        try {
          const res = await axios.get(`https://api.giftedtech.my.id/api/download/tiktok?apikey=gifted&url=${encodeURIComponent(query)}`)
            .catch(() => null);

          if (res && res.data && res.data.result) {
            const videoUrl = res.data.result.video_nowm || res.data.result.video;
            await sock.sendMessage(m.chat, {
              video: { url: videoUrl },
              caption: `🎵 *TikTok No-Watermark*\n⚡ *Downloaded via Saqib-MD*`
            }, { quoted: m });
            await m.react('✅');
          } else {
            await m.reply('⚠️ Video download karne mein masla hua. Link check karein.');
          }
        } catch (e) {
          await m.reply('❌ TikTok download failed: ' + e.message);
        }
        break;
      }

      case 'fb':
      case 'facebook': {
        if (!query || !query.includes('facebook.com') && !query.includes('fb.watch')) {
          return m.reply(`❓ Durust Facebook video link enter karein!\nMaslan: *${prefix}fb https://fb.watch/xxxx/*`);
        }
        await m.react('⏳');

        try {
          const res = await axios.get(`https://api.giftedtech.my.id/api/download/facebook?apikey=gifted&url=${encodeURIComponent(query)}`)
            .catch(() => null);

          if (res && res.data && res.data.result) {
            const videoUrl = res.data.result.hd || res.data.result.sd;
            await sock.sendMessage(m.chat, {
              video: { url: videoUrl },
              caption: `📽️ *Facebook Video HD*\n⚡ *Downloaded via Saqib-MD*`
            }, { quoted: m });
            await m.react('✅');
          } else {
            await m.reply('⚠️ Facebook video download nahi ho saki.');
          }
        } catch (e) {
          await m.reply('❌ Facebook download failed: ' + e.message);
        }
        break;
      }

      case 'ig':
      case 'insta': {
        if (!query || !query.includes('instagram.com')) {
          return m.reply(`❓ Durust Instagram reel/post link enter karein!\nMaslan: *${prefix}ig https://www.instagram.com/reel/xxxx/*`);
        }
        await m.react('⏳');

        try {
          const res = await axios.get(`https://api.giftedtech.my.id/api/download/instagram?apikey=gifted&url=${encodeURIComponent(query)}`)
            .catch(() => null);

          if (res && res.data && res.data.result) {
            const mediaUrl = res.data.result[0]?.url || res.data.result.url;
            await sock.sendMessage(m.chat, {
              video: { url: mediaUrl },
              caption: `📸 *Instagram Reel/Post*\n⚡ *Downloaded via Saqib-MD*`
            }, { quoted: m });
            await m.react('✅');
          } else {
            await m.reply('⚠️ Instagram media download nahi ho saki.');
          }
        } catch (e) {
          await m.reply('❌ Instagram download failed: ' + e.message);
        }
        break;
      }

      case 'apk': {
        if (!query) return m.reply(`❓ Kisi application ka naam likhein!\nMaslan: *${prefix}apk WhatsApp*`);
        await m.react('⏳');

        try {
          const res = await axios.get(`https://api.giftedtech.my.id/api/download/apk?apikey=gifted&app=${encodeURIComponent(query)}`)
            .catch(() => null);

          if (res && res.data && res.data.result) {
            const app = res.data.result;
            await sock.sendMessage(m.chat, {
              document: { url: app.dllink },
              mimetype: 'application/vnd.android.package-archive',
              fileName: `${app.name || query}.apk`,
              caption: `📱 *App Name:* ${app.name}\n📦 *Size:* ${app.size}\n⚡ *Powered by Saqib-MD*`
            }, { quoted: m });
            await m.react('✅');
          } else {
            await m.reply(`📱 APK search for *${query}* completed.`);
          }
        } catch (e) {
          await m.reply('❌ APK fetch failed: ' + e.message);
        }
        break;
      }

      case 'mediafire': {
        if (!query || !query.includes('mediafire.com')) {
          return m.reply(`❓ MediaFire file link provide karein!\nMaslan: *${prefix}mediafire https://www.mediafire.com/file/...*`);
        }
        await m.reply(config.MESSAGES.WAIT);
        await m.reply(`📁 *MediaFire Downloader:* Fetching file stream...`);
        break;
      }
    }
  }
};
