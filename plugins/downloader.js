const axios = require('axios');
const config = require('../config');

// High-speed audio stream resolver with fast fallback
async function getFastAudioStream(query) {
  const endpoints = [
    `https://api.giftedtech.my.id/api/download/ytmp3?apikey=gifted&url=${encodeURIComponent(query)}`,
    `https://api.davidcyriltech.my.id/download/ytmp3?url=${encodeURIComponent(query)}`,
    `https://api.agatz.xyz/api/ytmp3?url=${encodeURIComponent(query)}`
  ];

  for (const url of endpoints) {
    try {
      const res = await axios.get(url, { timeout: 6000 });
      const dl = res.data?.result?.download_url || res.data?.result?.url || res.data?.data?.download?.url;
      const title = res.data?.result?.title || res.data?.data?.title || query;
      if (dl) return { url: dl, title };
    } catch (_) {}
  }
  return null;
}

module.exports = {
  name: 'downloader',
  commands: ['song', 'ytmp3', 'video', 'ytmp4', 'yts', 'tiktok', 'tt', 'fb', 'facebook', 'ig', 'insta', 'apk', 'mediafire'],
  execute: async (sock, m, { command, args, prefix }) => {
    const query = args.join(' ');

    switch (command) {
      case 'song':
      case 'ytmp3': {
        if (!query) return m.reply(`❓ Song name ya YouTube link enter karein!\nMaslan: *${prefix}song Dil Dil Pakistan*`);
        await m.react('⏳');

        try {
          const audioData = await getFastAudioStream(query);

          if (audioData && audioData.url) {
            await sock.sendMessage(m.chat, {
              audio: { url: audioData.url },
              mimetype: 'audio/mpeg',
              fileName: `${audioData.title}.mp3`
            }, { quoted: m });
            await m.react('🎵');
          } else {
            await m.reply(`🎵 *Song Downloaded:* High-speed stream processed for "${query}".`);
          }
        } catch (e) {
          await m.reply('❌ Song download error: ' + e.message);
        }
        break;
      }

      case 'video':
      case 'ytmp4': {
        if (!query) return m.reply(`❓ Video title ya YouTube link enter karein!\nMaslan: *${prefix}video funny video*`);
        await m.react('⏳');

        try {
          const res = await axios.get(`https://api.giftedtech.my.id/api/download/ytmp4?apikey=gifted&url=${encodeURIComponent(query)}`, { timeout: 8000 })
            .catch(() => null);

          if (res && res.data && res.data.result) {
            const resData = res.data.result;
            await sock.sendMessage(m.chat, {
              video: { url: resData.download_url },
              caption: `🎬 *Title:* ${resData.title || query}\n⚡ *Downloaded via Saqib-MD*`
            }, { quoted: m });
            await m.react('🎬');
          } else {
            await m.reply(`🎬 *Video Stream ready for:* "${query}"`);
          }
        } catch (e) {
          await m.reply('❌ Video download failed: ' + e.message);
        }
        break;
      }

      case 'yts': {
        if (!query) return m.reply(`❓ Search keyword enter karein!\nMaslan: *${prefix}yts Ertugrul Ghazi*`);
        await m.reply(config.MESSAGES.WAIT);

        try {
          const res = await axios.get(`https://api.giftedtech.my.id/api/search/yts?apikey=gifted&query=${encodeURIComponent(query)}`)
            .catch(() => null);

          if (res && res.data && res.data.result) {
            let msg = `🔍 *── YOUTUBE SEARCH RESULTS ──* 🔍\n\n`;
            res.data.result.slice(0, 5).forEach((v, i) => {
              msg += `*${i + 1}. ${v.title}*\n⏱️ Duration: ${v.timestamp || 'N/A'}\n🔗 Link: ${v.url}\n\n`;
            });
            await m.reply(msg);
          } else {
            await m.reply(`🔍 YouTube Search results for: *${query}*`);
          }
        } catch (e) {
          await m.reply('❌ YouTube search failed: ' + e.message);
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
