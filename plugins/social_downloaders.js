const axios = require('axios');
const config = require('../config');

module.exports = {
  name: 'social_downloaders',
  commands: ['twitter', 'tw', 'x', 'xdl', 'threads', 'threadsdl', 'pinterestdl', 'pindl', 'soundcloud', 'soundclouddl', 'spotify', 'spotifydl'],
  execute: async (sock, m, { command, args, prefix }) => {
    const url = args[0];

    switch (command) {
      case 'twitter':
      case 'tw':
      case 'x':
      case 'xdl': {
        if (!url || (!url.includes('twitter.com') && !url.includes('x.com'))) {
          return m.reply(`❓ Provide a valid Twitter/X video link!\nExample: *${prefix}twitter https://x.com/.../status/...*`);
        }
        await m.react('⏳');
        try {
          const res = await axios.get(`https://api.giftedtech.my.id/api/download/twitter?apikey=gifted&url=${encodeURIComponent(url)}`).catch(() => null);
          const videoUrl = res?.data?.result?.video || res?.data?.result?.hd || res?.data?.result?.url;

          if (videoUrl) {
            await sock.sendMessage(m.chat, {
              video: { url: videoUrl },
              caption: `🐦 *Twitter/X Video Downloaded*\n⚡ *Powered by Saqib-MD*`
            }, { quoted: m });
            await m.react('✅');
          } else {
            await m.reply('⚠️ Failed to extract Twitter video. Please verify link.');
          }
        } catch (e) {
          await m.reply('❌ Twitter download error: ' + e.message);
        }
        break;
      }

      case 'threads':
      case 'threadsdl': {
        if (!url || !url.includes('threads.net')) {
          return m.reply(`❓ Provide a valid Threads post link!\nExample: *${prefix}threads https://www.threads.net/...*`);
        }
        await m.react('⏳');
        try {
          const res = await axios.get(`https://api.giftedtech.my.id/api/download/threads?apikey=gifted&url=${encodeURIComponent(url)}`).catch(() => null);
          const media = res?.data?.result?.video || res?.data?.result?.image;
          if (media) {
            const isVid = res?.data?.result?.video;
            await sock.sendMessage(m.chat, {
              [isVid ? 'video' : 'image']: { url: media },
              caption: `🧵 *Threads Media Downloaded*\n⚡ *Powered by Saqib-MD*`
            }, { quoted: m });
            await m.react('✅');
          } else {
            await m.reply('⚠️ Failed to extract Threads media.');
          }
        } catch (e) {
          await m.reply('❌ Threads error: ' + e.message);
        }
        break;
      }

      case 'pinterestdl':
      case 'pindl': {
        if (!url || !url.includes('pinterest.com') && !url.includes('pin.it')) {
          return m.reply(`❓ Provide a valid Pinterest pin link!\nExample: *${prefix}pindl https://pin.it/...*`);
        }
        await m.react('⏳');
        try {
          const res = await axios.get(`https://api.giftedtech.my.id/api/download/pinterest?apikey=gifted&url=${encodeURIComponent(url)}`).catch(() => null);
          const media = res?.data?.result?.video || res?.data?.result?.image;
          if (media) {
            const isVid = res?.data?.result?.video;
            await sock.sendMessage(m.chat, {
              [isVid ? 'video' : 'image']: { url: media },
              caption: `📌 *Pinterest Media Downloaded*`
            }, { quoted: m });
            await m.react('✅');
          } else {
            await m.reply('⚠️ Failed to download Pinterest pin.');
          }
        } catch (e) {
          await m.reply('❌ Pinterest download error: ' + e.message);
        }
        break;
      }

      case 'soundcloud':
      case 'soundclouddl': {
        const query = args.join(' ');
        if (!query) return m.reply(`❓ Enter SoundCloud track name or link!\nExample: *${prefix}soundcloud Alan Walker Faded*`);
        await m.react('☁️');
        try {
          const res = await axios.get(`https://api.giftedtech.my.id/api/search/soundcloud?apikey=gifted&query=${encodeURIComponent(query)}`).catch(() => null);
          const track = res?.data?.result?.[0];
          if (track?.download_url) {
            await sock.sendMessage(m.chat, {
              audio: { url: track.download_url },
              mimetype: 'audio/mpeg',
              fileName: `${track.title || query}.mp3`
            }, { quoted: m });
            await m.react('✅');
          } else {
            await m.reply(`☁️ *SoundCloud Stream for:* "${query}"`);
          }
        } catch (e) {
          await m.reply('❌ SoundCloud error: ' + e.message);
        }
        break;
      }

      case 'spotify':
      case 'spotifydl': {
        const query = args.join(' ');
        if (!query) return m.reply(`❓ Enter song name or Spotify link!\nExample: *${prefix}spotify Starboy*`);
        await m.react('🟢');
        try {
          const res = await axios.get(`https://api.giftedtech.my.id/api/search/spotify?apikey=gifted&query=${encodeURIComponent(query)}`).catch(() => null);
          const track = res?.data?.result?.[0];
          if (track) {
            const msg = `🟢 *── SPOTIFY TRACK DETAILS ──* 🟢\n\n` +
              `• *Title:* ${track.title}\n` +
              `• *Artist:* ${track.artist || 'N/A'}\n` +
              `• *Duration:* ${track.duration || 'N/A'}\n` +
              `• *Link:* ${track.url || 'N/A'}\n\n` +
              `_Use ${prefix}song ${track.title} to download this track directly._`;

            if (track.image) {
              await sock.sendMessage(m.chat, { image: { url: track.image }, caption: msg }, { quoted: m });
            } else {
              await m.reply(msg);
            }
            await m.react('✅');
          } else {
            await m.reply(`🟢 *Spotify search completed for:* "${query}"`);
          }
        } catch (e) {
          await m.reply('❌ Spotify error: ' + e.message);
        }
        break;
      }
    }
  }
};
