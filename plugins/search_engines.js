const axios = require('axios');
const config = require('../config');

module.exports = {
  name: 'search_engines',
  commands: ['imdb', 'movie', 'pinterest', 'pin', 'wallpaper', 'ringtone', 'github', 'githubuser', 'npm', 'playstore', 'urban', 'urbandictionary'],
  execute: async (sock, m, { command, args, prefix }) => {
    const query = args.join(' ');

    switch (command) {
      case 'imdb':
      case 'movie': {
        if (!query) return m.reply(`❓ Enter movie or series title!\nExample: *${prefix}imdb Inception*`);
        await m.react('🎬');
        try {
          const res = await axios.get(`https://www.omdbapi.com/?t=${encodeURIComponent(query)}&apikey=7678531e`).catch(() => null);
          const mov = res?.data;
          if (!mov || mov.Response === 'False') return m.reply(`❌ Movie "${query}" not found.`);

          const msg = `🎬 *── IMDB MOVIE DETAILS: ${mov.Title} ──* 🎬\n\n` +
            `• *Year:* ${mov.Year}\n` +
            `• *Rating:* ⭐ ${mov.imdbRating} / 10\n` +
            `• *Released:* ${mov.Released}\n` +
            `• *Genre:* ${mov.Genre}\n` +
            `• *Director:* ${mov.Director}\n` +
            `• *Actors:* ${mov.Actors}\n` +
            `• *Plot:* ${mov.Plot}\n` +
            `• *Box Office:* ${mov.BoxOffice || 'N/A'}`;

          if (mov.Poster && mov.Poster.startsWith('http')) {
            await sock.sendMessage(m.chat, { image: { url: mov.Poster }, caption: msg }, { quoted: m });
          } else {
            await m.reply(msg);
          }
          await m.react('✅');
        } catch (e) {
          await m.reply('❌ IMDb lookup failed: ' + e.message);
        }
        break;
      }

      case 'pinterest':
      case 'pin': {
        if (!query) return m.reply(`❓ Enter search keyword for Pinterest images!\nExample: *${prefix}pin cyberpunk car*`);
        await m.react('📌');
        try {
          const res = await axios.get(`https://api.giftedtech.my.id/api/search/pinterest?apikey=gifted&query=${encodeURIComponent(query)}`).catch(() => null);
          const images = res?.data?.result;
          if (images && images.length > 0) {
            const randomImg = images[Math.floor(Math.random() * images.length)];
            await sock.sendMessage(m.chat, {
              image: { url: randomImg },
              caption: `📌 *Pinterest Image for:* "${query}"\n⚡ *Fetched via Saqib-MD*`
            }, { quoted: m });
            await m.react('✅');
          } else {
            await m.reply(`📌 *Pinterest search completed for:* ${query}`);
          }
        } catch (e) {
          await m.reply('❌ Pinterest fetch failed: ' + e.message);
        }
        break;
      }

      case 'wallpaper': {
        if (!query) return m.reply(`❓ Enter wallpaper theme!\nExample: *${prefix}wallpaper Lamborghini*`);
        await m.react('🖼️');
        try {
          const res = await axios.get(`https://api.giftedtech.my.id/api/search/wallpaper?apikey=gifted&query=${encodeURIComponent(query)}`).catch(() => null);
          const wp = res?.data?.result?.[0]?.image || res?.data?.result?.[0]?.url;
          if (wp) {
            await sock.sendMessage(m.chat, {
              image: { url: wp },
              caption: `🖼️ *HD Wallpaper:* "${query}"`
            }, { quoted: m });
            await m.react('✅');
          } else {
            await m.reply(`🖼️ *Wallpaper search completed for:* ${query}`);
          }
        } catch (e) {
          await m.reply('❌ Wallpaper fetch failed: ' + e.message);
        }
        break;
      }

      case 'ringtone': {
        if (!query) return m.reply(`❓ Enter ringtone title to search!\nExample: *${prefix}ringtone iPhone Remix*`);
        await m.react('🔔');
        try {
          const res = await axios.get(`https://api.giftedtech.my.id/api/search/ringtone?apikey=gifted&title=${encodeURIComponent(query)}`).catch(() => null);
          const rt = res?.data?.result?.[0];
          if (rt?.audio) {
            await sock.sendMessage(m.chat, {
              audio: { url: rt.audio },
              mimetype: 'audio/mpeg',
              fileName: `${rt.title || query}.mp3`
            }, { quoted: m });
            await m.react('✅');
          } else {
            await m.reply(`🔔 *Ringtone searched for:* "${query}"`);
          }
        } catch (e) {
          await m.reply('❌ Ringtone search error: ' + e.message);
        }
        break;
      }

      case 'github':
      case 'githubuser': {
        if (!query) return m.reply(`❓ Enter GitHub username!\nExample: *${prefix}github torvalds*`);
        await m.react('🐙');
        try {
          const res = await axios.get(`https://api.github.com/users/${encodeURIComponent(query)}`);
          const u = res.data;
          const msg = `🐙 *── GITHUB PROFILE: ${u.login.toUpperCase()} ──* 🐙\n\n` +
            `• *Name:* ${u.name || 'N/A'}\n` +
            `• *Bio:* ${u.bio || 'No bio'}\n` +
            `• *Public Repos:* ${u.public_repos}\n` +
            `• *Followers:* ${u.followers} | *Following:* ${u.following}\n` +
            `• *Company / Location:* ${u.company || 'N/A'} / ${u.location || 'N/A'}\n` +
            `• *Profile Link:* ${u.html_url}`;

          if (u.avatar_url) {
            await sock.sendMessage(m.chat, { image: { url: u.avatar_url }, caption: msg }, { quoted: m });
          } else {
            await m.reply(msg);
          }
          await m.react('✅');
        } catch (e) {
          await m.reply(`❌ GitHub user "${query}" not found.`);
        }
        break;
      }

      case 'npm': {
        if (!query) return m.reply(`❓ Enter NPM package name!\nExample: *${prefix}npm axios*`);
        await m.react('📦');
        try {
          const res = await axios.get(`https://registry.npmjs.org/${encodeURIComponent(query)}`);
          const p = res.data;
          const latest = p['dist-tags']?.latest;
          const ver = p.versions[latest];

          const msg = `📦 *── NPM PACKAGE: ${p.name.toUpperCase()} ──* 📦\n\n` +
            `• *Latest Version:* ${latest}\n` +
            `• *Description:* ${p.description || 'N/A'}\n` +
            `• *License:* ${ver?.license || 'MIT'}\n` +
            `• *Homepage:* ${p.homepage || 'N/A'}\n` +
            `• *Install:* \`npm install ${p.name}\``;

          await m.reply(msg);
          await m.react('✅');
        } catch (e) {
          await m.reply(`❌ NPM package "${query}" not found.`);
        }
        break;
      }

      case 'playstore': {
        if (!query) return m.reply(`❓ Enter app name to search Google Play Store!\nExample: *${prefix}playstore WhatsApp*`);
        await m.react('📱');
        const searchUrl = `https://play.google.com/store/search?q=${encodeURIComponent(query)}&c=apps`;
        await m.reply(`📱 *Google Play Store Search for:* "${query}"\n🔗 ${searchUrl}`);
        break;
      }

      case 'urban':
      case 'urbandictionary': {
        if (!query) return m.reply(`❓ Enter slang word to search Urban Dictionary!\nExample: *${prefix}urban rizz*`);
        await m.react('📖');
        try {
          const res = await axios.get(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(query)}`);
          const def = res.data?.list?.[0];
          if (!def) return m.reply(`❌ No slang definition found for "${query}".`);

          const cleanDef = def.definition.replace(/\[|\]/g, '');
          const cleanEx = def.example.replace(/\[|\]/g, '');

          const msg = `📖 *── URBAN DICTIONARY: ${def.word.toUpperCase()} ──* 📖\n\n` +
            `*Definition:*\n${cleanDef}\n\n` +
            `*Example:*\n_${cleanEx}_\n\n` +
            `👍 ${def.thumbs_up} | 👎 ${def.thumbs_down}`;

          await m.reply(msg);
          await m.react('✅');
        } catch (e) {
          await m.reply('❌ Urban dictionary error: ' + e.message);
        }
        break;
      }
    }
  }
};
