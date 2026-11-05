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
        if (!query) return m.reply(`\u2753 Send a song name or YouTube link!\nExample: *${prefix}song Dil Dil Pakistan*`);
        await m.react('\u23f3');

        const isUrl = /^https?:\/\//i.test(query);
        let result = null;
        let source = '';

        try {
          // 1) Direct YouTube/other link -> yt-dlp straight away.
          if (isUrl) {
            result = await ytdlp.downloadAudio(query, { bitrate: '128' });
            source = 'YouTube';
          } else {
            // 2) Free-text search -> JioSaavn first (permanent, no cookies, 320kbps).
            const saavn = require('../lib/saavn');
            const sres = await saavn.downloadSong(query, { limit: 8 });
            if (sres.ok) {
              result = sres;
              source = 'JioSaavn';
            } else {
              // 3) Fallback to yt-dlp (works while cookies are valid).
              result = await ytdlp.downloadAudio(query, { bitrate: '128' });
              source = 'YouTube';
            }
          }

          if (!result || !result.ok) {
            await m.react('\u274c');
            return m.reply(`\u274c *Could not find that song.*\n\nPlease check the spelling or try another name.`);
          }

          const sizeMB = (fs.statSync(result.file).size / (1024 * 1024)).toFixed(2);
          const isM4a = /\.m4a$/i.test(result.file);

          await sock.sendMessage(m.chat, {
            audio: { url: result.file },
            mimetype: isM4a ? 'audio/mp4' : 'audio/mpeg',
            fileName: `${result.title || 'song'}.${isM4a ? 'm4a' : 'mp3'}`,
            ptt: false
          }, { quoted: m });

          await m.react('\ud83c\udfb5');
          console.log(`\ud83c\udfb5 .song "${result.title}" via ${source} (${sizeMB} MB)`);
        } catch (e) {
          await m.react('\u274c');
          await m.reply('\u26a0\ufe0f *Something went wrong while fetching this song.*\n\nPlease report this to the owner so it can be fixed.');
        } finally {
          if (result && result.dir) {
            try { require('../lib/saavn').cleanupDir(result.dir); } catch (_) {}
          }
        }
        break;
      }

      case 'video':
      case 'ytmp4': {
        if (!query) return m.reply(`\u2753 Send a video name or YouTube link!\nExample: *${prefix}video funny cats*`);
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
        if (!query) return m.reply(`\u2753 Enter a search keyword!\nExample: *${prefix}yts Ertugrul Ghazi*`);
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
          return m.reply(`\u2753 Please send a valid TikTok video link!\nExample: *${prefix}tiktok https://vm.tiktok.com/xxxx/*`);
        }
        await m.react('\u23f3');
        let result = null;
        try {
          result = await ytdlp.downloadVideo(query, { height: 720 });
          if (!result.ok) {
            await m.react('\u274c');
            return m.reply('\u26a0\ufe0f Could not download that TikTok video. It may be private or region-locked.');
          }
          await sock.sendMessage(m.chat, {
            video: { url: result.file },
            mimetype: 'video/mp4',
            fileName: `${result.title}.mp4`,
            caption: `\ud83c\udfb5 *TikTok No-Watermark*\n\u26a1 _Downloaded via Saqib-MD_`
          }, { quoted: m });
          await m.react('\u2705');
        } catch (e) {
          await m.react('\u274c');
          await m.reply('\u26a0\ufe0f Could not download that TikTok video right now. Please try again later.');
        } finally {
          if (result && result.dir) ytdlp.cleanupDir(result.dir);
        }
        break;
      }

      case 'fb':
      case 'facebook': {
        if (!query || (!query.includes('facebook.com') && !query.includes('fb.watch'))) {
          return m.reply(`\u2753 Please send a valid Facebook video link!\nExample: *${prefix}fb https://fb.watch/xxxx/*`);
        }
        await m.react('\u23f3');
        let result = null;
        try {
          result = await ytdlp.downloadVideo(query, { height: 720 });
          if (!result.ok) {
            await m.react('\u274c');
            return m.reply('\u26a0\ufe0f Could not download that Facebook video. It may be private or unsupported.');
          }
          await sock.sendMessage(m.chat, {
            video: { url: result.file },
            mimetype: 'video/mp4',
            fileName: `${result.title}.mp4`,
            caption: `\ud83d\udcfd\ufe0f *Facebook Video HD*\n\u26a1 _Downloaded via Saqib-MD_`
          }, { quoted: m });
          await m.react('\u2705');
        } catch (e) {
          await m.react('\u274c');
          await m.reply('\u26a0\ufe0f Could not download that Facebook video right now. Please try again later.');
        } finally {
          if (result && result.dir) ytdlp.cleanupDir(result.dir);
        }
        break;
      }

      case 'ig':
      case 'insta': {
        if (!query || !query.includes('instagram.com')) {
          return m.reply(`\u2753 Please send a valid Instagram reel/post link!\nExample: *${prefix}ig https://www.instagram.com/reel/xxxx/*`);
        }
        await m.react('\u23f3');
        let result = null;
        try {
          result = await ytdlp.downloadVideo(query, { height: 720 });
          if (!result.ok) {
            await m.react('\u274c');
            return m.reply('\u26a0\ufe0f Could not download that Instagram media. It may be private or login-locked.');
          }
          await sock.sendMessage(m.chat, {
            video: { url: result.file },
            mimetype: 'video/mp4',
            fileName: `${result.title}.mp4`,
            caption: `\ud83d\udcf8 *Instagram Reel/Post*\n\u26a1 _Downloaded via Saqib-MD_`
          }, { quoted: m });
          await m.react('\u2705');
        } catch (e) {
          await m.react('\u274c');
          await m.reply('\u26a0\ufe0f Could not download that Instagram media right now. Please try again later.');
        } finally {
          if (result && result.dir) ytdlp.cleanupDir(result.dir);
        }
        break;
      }

      case 'apk': {
        if (!query) return m.reply(`\u2753 Please provide an app name!\nExample: *${prefix}apk WhatsApp*`);
        await m.react('\u23f3');
        await m.reply(`\ud83d\udcf1 *APK search:* Please download *${query}* from a trusted source such as APKMirror or the official Play Store. Direct APK mirroring is disabled for safety.`);
        await m.react('\u2139\ufe0f');
        break;
      }

      case 'mediafire': {
        if (!query || !query.includes('mediafire.com')) {
          return m.reply(`❓ Provide a MediaFire file link!\nExample: *${prefix}mediafire https://www.mediafire.com/file/...*`);
        }
        await m.reply(config.MESSAGES.WAIT);
        await m.reply(`📁 *MediaFire Downloader:* Fetching file stream...`);
        break;
      }
    }
  }
};
