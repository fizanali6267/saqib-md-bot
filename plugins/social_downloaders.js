const fs = require('fs');
const config = require('../config');
const ytdlp = require('../lib/ytdlp');

/**
 * Social downloaders backed by yt-dlp.
 * The old public "giftedtech" API is dead, so every command here now uses the
 * same resilient yt-dlp ladder the YouTube commands use. If a platform is not
 * supported by yt-dlp we degrade gracefully with a helpful message instead of
 * throwing an error.
 */

function looksLike(url, ...hosts) {
  return typeof url === 'string' && hosts.some((h) => url.includes(h));
}

async function sendVideo(sock, m, url) {
  const res = await ytdlp.downloadVideo(url, { height: 720 });
  if (!res.ok) return { ok: false, error: res.error };
  try {
    await sock.sendMessage(m.chat, {
      video: fs.readFileSync(res.file),
      caption: '✅ *Download complete*',
      mimetype: 'video/mp4'
    }, { quoted: m });
    return { ok: true };
  } finally {
    ytdlp.cleanupDir(res.dir);
  }
}

async function sendAudio(sock, m, url) {
  const res = await ytdlp.downloadAudio(url, { bitrate: '128' });
  if (!res.ok) return { ok: false, error: res.error };
  try {
    await sock.sendMessage(m.chat, {
      audio: fs.readFileSync(res.file),
      mimetype: 'audio/mp4',
      ptt: false,
      fileName: (res.title || 'audio') + '.mp3'
    }, { quoted: m });
    return { ok: true };
  } finally {
    ytdlp.cleanupDir(res.dir);
  }
}

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
        if (!looksLike(url, 'twitter.com', 'x.com')) {
          return m.reply(`❓ Provide a valid Twitter/X video link!\nExample: *${prefix}twitter https://x.com/.../status/...*`);
        }
        await m.react('⏳');
        try {
          const r = await sendVideo(sock, m, url);
          if (r.ok) return m.react('✅');
          await m.reply('⚠️ Could not download that Twitter/X video. It may be private or unsupported.');
        } catch (e) {
          await m.reply('⚠️ Could not download that Twitter/X video right now. Please try again later.');
        }
        break;
      }

      case 'threads':
      case 'threadsdl': {
        if (!looksLike(url, 'threads.net', 'threads.com')) {
          return m.reply(`❓ Provide a valid Threads link!\nExample: *${prefix}threads https://www.threads.net/...*`);
        }
        await m.react('⏳');
        try {
          const r = await sendVideo(sock, m, url);
          if (r.ok) return m.react('✅');
          await m.reply('⚠️ Could not download that Threads video. It may be private or unsupported.');
        } catch (e) {
          await m.reply('⚠️ Could not download that Threads video right now. Please try again later.');
        }
        break;
      }

      case 'pinterestdl':
      case 'pindl': {
        if (!looksLike(url, 'pinterest.')) {
          return m.reply(`❓ Provide a valid Pinterest link!\nExample: *${prefix}pindl https://pin.it/...*`);
        }
        await m.react('⏳');
        try {
          const r = await sendVideo(sock, m, url);
          if (r.ok) return m.react('✅');
          await m.reply('⚠️ Could not download that Pinterest media. Try a direct video pin link.');
        } catch (e) {
          await m.reply('⚠️ Could not download that Pinterest media right now. Please try again later.');
        }
        break;
      }

      case 'soundcloud':
      case 'soundclouddl': {
        if (!looksLike(url, 'soundcloud.com')) {
          return m.reply(`❓ Provide a valid SoundCloud link!\nExample: *${prefix}soundcloud https://soundcloud.com/...*`);
        }
        await m.react('⏳');
        try {
          const r = await sendAudio(sock, m, url);
          if (r.ok) return m.react('✅');
          await m.reply('⚠️ Could not download that SoundCloud track. It may be private or region-locked.');
        } catch (e) {
          await m.reply('⚠️ Could not download that SoundCloud track right now. Please try again later.');
        }
        break;
      }

      case 'spotify':
      case 'spotifydl': {
        const query = args.join(' ').trim();
        if (!query) {
          return m.reply(`❓ Provide a song name or Spotify link!\nExample: *${prefix}spotify Kesariya*`);
        }
        await m.react('⏳');
        try {
          // Spotify audio is DRM-protected. Resolve the track name and pull the
          // matching audio from JioSaavn first (permanent, no cookies), then
          // fall back to YouTube.
          const searchTerm = query.replace(/https?:\/\/open\.spotify\.com\/\S+/i, '').trim() || query;
          const saavn = require('../lib/saavn');
          const sd = await saavn.downloadSong(searchTerm, { limit: 6 });
          if (sd.ok) {
            try {
              await sock.sendMessage(m.chat, {
                audio: { url: sd.file },
                mimetype: 'audio/mp4',
                fileName: `${sd.title}.m4a`,
                ptt: false
              }, { quoted: m });
              return m.react('✅');
            } finally {
              saavn.cleanupDir(sd.dir);
            }
          }
          const r = await sendAudio(sock, m, searchTerm);
          if (r.ok) return m.react('✅');
          await m.reply(`⚠️ Could not find that track. Try *${prefix}song ${searchTerm}*.`);
        } catch (e) {
          await m.reply('⚠️ Could not fetch that track right now. Please try again later.');
        }
        break;
      }
    }
  }
};
