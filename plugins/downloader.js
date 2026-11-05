const axios = require('axios');
const fs = require('fs');
const config = require('../config');
const ytdlp = require('../lib/ytdlp');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// ---------------------------------------------------------------------------
// YouTube search via the public results page (no yt-dlp, no bot wall).
// ---------------------------------------------------------------------------
async function youtubeSearch(query, limit = 6) {
  const res = await axios.get('https://www.youtube.com/results', {
    params: { search_query: query },
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    timeout: 25000,
  });
  const html = String(res.data || '');
  const match = html.match(/ytInitialData\s*=\s*(\{.+?\});<\/script>/s);
  if (!match) throw new Error('could not parse YouTube results');
  const data = JSON.parse(match[1]);
  const sections =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
  const out = [];
  for (const section of sections) {
    const items = section?.itemSectionRenderer?.contents || [];
    for (const item of items) {
      const v = item?.videoRenderer;
      if (!v || !v.videoId) continue;
      const title = (v.title?.runs || []).map((r) => r.text).join('') || '';
      if (!title) continue;
      out.push({
        title,
        id: v.videoId,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        channel: v.ownerText?.runs?.[0]?.text || v.longBylineText?.runs?.[0]?.text || '',
        duration: v.lengthText?.simpleText || '',
        views: v.viewCountText?.simpleText || '',
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Aptoide APK search + direct download (public API, no key).
// ---------------------------------------------------------------------------
async function aptoideLookup(name) {
  const search = await axios.get('https://ws75.aptoide.com/api/7/apps/search', {
    params: { query: name, limit: 1 },
    timeout: 20000,
  });
  const list = search.data?.datalist?.list || [];
  if (!list.length) return null;
  const pkg = list[0].package;
  const get = await axios.get('https://ws75.aptoide.com/api/7/app/get', {
    params: { package_name: pkg },
    timeout: 20000,
  });
  const d = get.data?.nodes?.meta?.data;
  if (!d || !d.file?.path) return null;
  return {
    name: d.name || name,
    package: pkg,
    version: d.file?.vername || d.vername || '',
    size: d.file?.filesize || d.size || 0,
    icon: d.icon || '',
    developer: d.developer?.name || '',
    url: d.file.path,
  };
}

// ---------------------------------------------------------------------------
// TikTok via tikwm (no-watermark), used before falling back to yt-dlp.
// ---------------------------------------------------------------------------
async function tikwmLookup(url) {
  const res = await axios.get('https://www.tikwm.com/api/', {
    params: { url, hd: 1 },
    timeout: 25000,
    headers: { 'User-Agent': UA },
  });
  if (res.data?.code !== 0 || !res.data?.data) return null;
  const d = res.data.data;
  const abs = (u) => (u && u.startsWith('http') ? u : u ? `https://www.tikwm.com${u}` : null);
  return {
    title: d.title || 'TikTok video',
    play: abs(d.play),
    hd: abs(d.hdplay),
    music: abs(d.music),
    images: Array.isArray(d.images) ? d.images.map(abs) : null,
  };
}

// ---------------------------------------------------------------------------
// TikTok: read the public video page and reuse its ttwid cookie.
// Cloudflare-fronted mirrors (tikwm, snaptik, ...) 403 every datacenter IP,
// but tiktok.com itself serves the page and the CDN accepts the same cookie.
// ---------------------------------------------------------------------------
function pickCookie(setCookie) {
  if (!setCookie) return '';
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  return arr.map((c) => String(c).split(';')[0]).filter(Boolean).join('; ');
}

function parseUniversal(html) {
  const m = /id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (_) { return null; }
}

async function tiktokWeb(url) {
  const page = await axios.get(url, {
    timeout: 25000,
    maxRedirects: 5,
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    validateStatus: () => true,
  });
  if (page.status !== 200 || typeof page.data !== 'string') {
    throw new Error('TikTok page returned HTTP ' + page.status);
  }
  const data = parseUniversal(page.data);
  const scope = data && data.__DEFAULT_SCOPE__;
  const detail = scope && (scope['webapp.video-detail'] || scope['webapp.video-detail-v2']);
  const item = detail && detail.itemInfo && detail.itemInfo.itemStruct;
  if (!item) {
    const statusMsg = detail && detail.statusMsg;
    throw new Error(statusMsg ? 'TikTok says: ' + statusMsg : 'Could not read this TikTok post');
  }

  const cookie = pickCookie(page.headers['set-cookie']);
  const dl = (u) => axios.get(u, {
    responseType: 'arraybuffer',
    timeout: 90000,
    maxRedirects: 5,
    headers: { 'User-Agent': UA, Referer: 'https://www.tiktok.com/', Cookie: cookie, Accept: '*/*' },
  });

  const title = String(item.desc || 'TikTok video').slice(0, 120);
  const author = (item.author && item.author.uniqueId) || 'tiktok';

  // Photo/slideshow post
  const imgs = item.imagePost && item.imagePost.images;
  if (Array.isArray(imgs) && imgs.length) {
    const urls = imgs.map((im) => {
      const list = (im.imageURL && im.imageURL.urlList) || [];
      return list[list.length - 1] || list[0];
    }).filter(Boolean);
    const buffers = [];
    for (const u of urls.slice(0, 10)) {
      try { buffers.push(Buffer.from((await dl(u)).data)); } catch (_) {}
    }
    if (buffers.length) return { kind: 'images', title, author, images: buffers };
  }

  // Video: prefer the highest bitrate entry, fall back to playAddr
  const video = item.video || {};
  const candidates = [];
  for (const br of (video.bitrateInfo || [])) {
    const u = br && br.PlayAddr && br.PlayAddr.UrlList && br.PlayAddr.UrlList[0];
    if (u) candidates.push(u);
  }
  if (video.playAddr) candidates.push(video.playAddr);
  if (video.downloadAddr) candidates.push(video.downloadAddr);

  let lastErr = null;
  for (const u of candidates) {
    try {
      const r = await dl(u);
      const buf = Buffer.from(r.data);
      if (buf.length > 20000) return { kind: 'video', title, author, buffer: buf };
      lastErr = new Error('empty video body');
    } catch (e) { lastErr = e; }
  }
  throw new Error(lastErr ? lastErr.message : 'No downloadable video URL');
}

function humanSize(bytes) {
  if (!bytes) return 'N/A';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = Number(bytes);
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(1)} ${units[i]}`;
}

module.exports = {
  _internal: { youtubeSearch, aptoideLookup, tikwmLookup, tiktokWeb, humanSize },
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
        if (!query) return m.reply(`❓ Enter a search keyword!\nExample: *${prefix}yts Dil Dil Pakistan*`);
        await m.react('🔍').catch(() => null);
        try {
          const results = await youtubeSearch(query, 6);
          if (!results.length) throw new Error('no results found');
          let out = `🔍 *── YOUTUBE RESULTS ──*\n📝 *Query:* ${query}\n\n`;
          results.forEach((r, i) => {
            out += `*${i + 1}. ${r.title}*\n`;
            if (r.channel) out += `👤 ${r.channel}\n`;
            if (r.duration || r.views) out += `⏱️ ${r.duration || 'N/A'}${r.views ? ` · 👁️ ${r.views}` : ''}\n`;
            out += `🔗 ${r.url}\n\n`;
          });
          out += `_Download audio: ${prefix}song <link>_`;
          await m.reply(out.trim());
        } catch (e) {
          await m.reply(
            `❌ *Search failed:* ${e.message}\n\n🔗 Try directly:\nhttps://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
          );
        }
        break;
      }

      case 'tiktok':
      case 'tt': {
        if (!query || !query.includes('tiktok.com')) {
          return m.reply(`❓ Please send a valid TikTok video link!\nExample: *${prefix}tiktok https://vm.tiktok.com/xxxx/*`);
        }
        await m.react('⏳');

        // 1) Native page scrape (works from datacenter IPs where mirrors 403).
        try {
          const native = await tiktokWeb(query);
          if (native.kind === 'images') {
            for (const img of native.images) {
              await sock.sendMessage(m.chat, { image: img, caption: `🎵 *${native.title}*` }, { quoted: m });
            }
            await m.react('✅');
            return;
          }
          await sock.sendMessage(m.chat, {
            video: native.buffer,
            mimetype: 'video/mp4',
            fileName: 'tiktok.mp4',
            caption: `🎵 *${native.title}*\n👤 @${native.author}\n⚡ _Downloaded via Saqib-MD_`,
          }, { quoted: m });
          await m.react('✅');
          return;
        } catch (_) {
          // fall through to mirrors
        }

        // 2) tikwm — fast, no-watermark, no auth.
        try {
          const info = await tikwmLookup(query);
          if (info) {
            if (info.images && info.images.length) {
              for (const img of info.images.slice(0, 10)) {
                await sock.sendMessage(m.chat, { image: { url: img } }, { quoted: m });
              }
              await m.react('✅');
              return;
            }
            const src = info.hd || info.play;
            if (src) {
              const buf = await axios.get(src, {
                responseType: 'arraybuffer',
                timeout: 90000,
                headers: { 'User-Agent': UA, Referer: 'https://www.tiktok.com/' },
              });
              await sock.sendMessage(m.chat, {
                video: Buffer.from(buf.data),
                mimetype: 'video/mp4',
                fileName: 'tiktok.mp4',
                caption: `🎵 *${info.title}*\n⚡ _Downloaded via Saqib-MD_`,
              }, { quoted: m });
              await m.react('✅');
              return;
            }
          }
        } catch (_) {
          // fall through to yt-dlp
        }

        // 3) yt-dlp fallback
        let result = null;
        try {
          result = await ytdlp.downloadVideo(query, { height: 720 });
          if (!result.ok) throw new Error(result.error || 'download failed');
          await sock.sendMessage(m.chat, {
            video: { url: result.file },
            mimetype: 'video/mp4',
            fileName: `${result.title || 'tiktok'}.mp4`,
            caption: `🎵 *TikTok No-Watermark*\n⚡ _Downloaded via Saqib-MD_`,
          }, { quoted: m });
          await m.react('✅');
        } catch (e) {
          await m.react('❌');
          await m.reply(
            `⚠️ *Could not download that TikTok video.*\n*Reason:* ${e.message || 'private or region-locked'}\n\nTry again with the full video link (not a photo post).`
          );
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
        if (!query) return m.reply(`❓ Please provide an app name!\nExample: *${prefix}apk WhatsApp*`);
        await m.react('⏳');
        try {
          const app = await aptoideLookup(query);
          if (!app) {
            await m.react('❌');
            return m.reply(`❌ *App not found* on Aptoide for *${query}*.\nTry the exact app name, e.g. *${prefix}apk WhatsApp*.`);
          }
          await m.reply(
            `📱 *── APK FOUND ──*\n\n` +
              `📦 *Name:* ${app.name}\n` +
              `🏷️ *Package:* ${app.package}\n` +
              `🔢 *Version:* ${app.version}\n` +
              `💾 *Size:* ${humanSize(app.size)}\n` +
              (app.developer ? `👨‍💻 *Developer:* ${app.developer}\n` : '') +
              `\n⬇️ _Downloading APK, please wait..._`
          );

          const buf = await axios.get(app.url, {
            responseType: 'arraybuffer',
            timeout: 180000,
            maxContentLength: 300 * 1024 * 1024,
            headers: { 'User-Agent': UA },
          });
          const file = Buffer.from(buf.data);
          if (!file.length) throw new Error('empty APK download');

          await sock.sendMessage(m.chat, {
            document: file,
            mimetype: 'application/vnd.android.package-archive',
            fileName: `${app.name.replace(/[^a-zA-Z0-9._-]/g, '_')}_${app.version}.apk`,
            caption: `📦 *${app.name}* v${app.version}\n💾 ${humanSize(file.length)}\n⚡ _Downloaded via Saqib-MD_`,
          }, { quoted: m });
          await m.react('✅');
        } catch (e) {
          await m.react('❌');
          await m.reply(`❌ *APK download failed:* ${e.message || 'unknown error'}`);
        }
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
