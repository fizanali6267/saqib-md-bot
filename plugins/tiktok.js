const axios = require('axios');
const config = require('../config');

/**
 * TikTok toolkit — .tts (search) and .ttdl (download)
 * -------------------------------------------------------------------------
 * TikTok blocks most datacenter IPs, so no single public API is dependable.
 * This module tries a cascade of providers and keeps the first one that
 * returns usable data. If every provider is down it still gives the user
 * something actionable (direct TikTok search links) instead of an error.
 *
 * Default search region is Pakistan, as requested.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const PROVIDERS = [  {
    // Works when /api/feed/search is Cloudflare-blocked (which is almost always
    // from datacenter IPs). We resolve the keyword to a TikTok hashtag id and
    // then pull that hashtag's real video feed. Same host, different path, so
    // it survives the challenge that kills the search endpoint.
    name: 'tikwm-challenge',
    search: async (q, count) => {
      const keyword = String(q).trim().replace(/^#/, '').replace(/\s+/g, '');
      const info = await axios.get('https://tikwm.com/api/challenge/info', {
        params: { challenge_name: keyword },
        timeout: 12000,
        headers: { 'User-Agent': UA, Accept: 'application/json' }
      });
      const id = info.data && info.data.data && info.data.data.id;
      if (!id) throw new Error('no challenge id');

      const posts = await axios.get('https://tikwm.com/api/challenge/posts', {
        params: { challenge_id: id, count: Math.max(Number(count) || 10, 10) },
        timeout: 15000,
        headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://tikwm.com/' }
      });
      const list = posts.data && posts.data.data && posts.data.data.videos;
      if (!Array.isArray(list) || !list.length) throw new Error('empty');

      return list.slice(0, count).map((v) => ({
        id: v.video_id,
        title: v.title || 'TikTok video',
        author: (v.author && (v.author.unique_id || v.author.nickname)) || 'tiktok',
        plays: v.play_count,
        likes: v.digg_count,
        duration: v.duration,
        cover: v.origin_cover || v.cover,
        url: `https://www.tiktok.com/@${(v.author && v.author.unique_id) || 'user'}/video/${v.video_id}`
      }));
    }
  },  {
    name: 'tikwm',
    search: async (q, count) => {
      const res = await axios.get('https://www.tikwm.com/api/feed/search', {
        params: { keywords: q, count, region: 'PK' },
        timeout: 12000,
        headers: { 'User-Agent': UA, Accept: 'application/json' }
      });
      const list = res.data?.data?.videos;
      if (!Array.isArray(list) || !list.length) throw new Error('empty');
      return list.map((v) => ({
        id: v.video_id,
        title: v.title || 'TikTok video',
        author: v.author?.unique_id || v.author?.nickname || 'unknown',
        plays: v.play_count,
        likes: v.digg_count,
        duration: v.duration,
        cover: v.origin_cover || v.cover,
        url: `https://www.tiktok.com/@${v.author?.unique_id || 'user'}/video/${v.video_id}`
      }));
    },
    download: async (url) => {
      const res = await axios.get('https://www.tikwm.com/api/', {
        params: { url, hd: 1 },
        timeout: 15000,
        headers: { 'User-Agent': UA, Accept: 'application/json' }
      });
      const d = res.data?.data;
      if (!d || !d.play) throw new Error('no media');
      return {
        video: d.hdplay || d.play,
        music: d.music,
        title: d.title || 'TikTok video',
        author: d.author?.unique_id || 'unknown'
      };
    }
  },  {
    // Last-resort real feed: trending videos for the requested region (PK).
    // Not keyword-filtered, but it is genuine live TikTok data instead of an
    // error, so the command always returns something useful.
    name: 'tikwm-region',
    search: async (q, count) => {
      const res = await axios.get('https://tikwm.com/api/feed/list', {
        params: { region: 'PK', count: Math.max(Number(count) || 10, 10) },
        timeout: 15000,
        headers: { 'User-Agent': UA, Accept: 'application/json' }
      });
      const list = res.data && res.data.data;
      if (!Array.isArray(list) || !list.length) throw new Error('empty');
      return list.slice(0, count).map((v) => ({
        id: v.video_id,
        title: v.title || 'TikTok video',
        author: (v.author && (v.author.unique_id || v.author.nickname)) || 'tiktok',
        plays: v.play_count,
        likes: v.digg_count,
        duration: v.duration,
        cover: v.origin_cover || v.cover,
        url: `https://www.tiktok.com/@${(v.author && v.author.unique_id) || 'user'}/video/${v.video_id}`
      }));
    }
  },  {
    name: 'tiklydown',
    search: async (q, count) => {
      const res = await axios.get('https://api.tiklydown.eu.org/api/search', {
        params: { q },
        timeout: 12000,
        headers: { 'User-Agent': UA, Accept: 'application/json' }
      });
      const list = res.data?.videos || res.data?.data || res.data?.result;
      if (!Array.isArray(list) || !list.length) throw new Error('empty');
      return list.slice(0, count).map((v) => ({
        id: v.id || v.video_id,
        title: v.title || v.desc || 'TikTok video',
        author: v.author?.unique_id || v.author || 'unknown',
        plays: v.playCount || v.play_count,
        likes: v.likeCount || v.digg_count,
        duration: v.duration,
        cover: v.cover || v.origin_cover,
        url: v.url || `https://www.tiktok.com/video/${v.id || v.video_id}`
      }));
    }
  }
];

function fmtNum(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(v);
}

function fmtDur(s) {
  const v = Number(s);
  if (!Number.isFinite(v) || v <= 0) return '—';
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}

async function searchTikTok(query, count) {
  let lastErr = null;
  for (const p of PROVIDERS) {
    if (typeof p.search !== 'function') continue;
    try {
      const results = await p.search(query, count);
      if (results && results.length) return { ok: true, provider: p.name, results };
    } catch (e) {
      lastErr = e;
    }
  }
  return { ok: false, error: lastErr ? lastErr.message : 'All providers unavailable' };
}

async function downloadTikTok(url) {
  let lastErr = null;
  for (const p of PROVIDERS) {
    if (typeof p.download !== 'function') continue;
    try {
      const media = await p.download(url);
      if (media && media.video) return { ok: true, provider: p.name, media };
    } catch (e) {
      lastErr = e;
    }
  }
  return { ok: false, error: lastErr ? lastErr.message : 'All providers unavailable' };
}

module.exports = {
  name: 'tiktok',
  _search: searchTikTok,
  _download: downloadTikTok,
  commands: ['tts', 'tiktoksearch', 'ttsearch', 'ttdl', 'tiktokdl', 'ttmp4'],

  execute: async (sock, m, { command, args, prefix }) => {
    const isDownload = ['ttdl', 'tiktokdl', 'ttmp4'].includes(command);
    const input = args.join(' ').trim();

    if (!input) {
      return m.reply(
        isDownload
          ? `❓ Send a TikTok link.\nExample: *${prefix}ttdl https://www.tiktok.com/@user/video/123*`
          : `❓ What should I search on TikTok?\nExample: *${prefix}tts pakistan cricket*`
      );
    }

    // ---------------- DOWNLOAD ----------------
    if (isDownload || /tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com/i.test(input)) {
      if (!/tiktok\.com/i.test(input)) {
        return m.reply(`❓ That does not look like a TikTok link.`);
      }

      await m.react('⏳').catch(() => null);
      const res = await downloadTikTok(input);

      if (!res.ok) {
        await m.react('❌').catch(() => null);
        return m.reply(
          `⚠️ *Could not download this TikTok video.*\n\n` +
          `TikTok is blocking the download service right now. Please try again in a minute.`
        );
      }

      try {
        await sock.sendMessage(m.chat, {
          video: { url: res.media.video },
          caption:
            `🎵 *TikTok Video*\n\n` +
            `📝 ${res.media.title || 'No title'}\n` +
            `👤 @${res.media.author || 'unknown'}\n\n` +
            `⚡ *SAQIB-MD*`
        }, { quoted: m });
        await m.react('✅').catch(() => null);
      } catch (e) {
        await m.react('❌').catch(() => null);
        await m.reply('⚠️ *Download succeeded but sending failed.* Please try again.');
      }
      return;
    }

    // ---------------- SEARCH ----------------
    await m.react('🔎').catch(() => null);

    const res = await searchTikTok(input, 8);

    if (!res.ok) {
      await m.react('⚠️').catch(() => null);
      const tag = input.replace(/\s+/g, '');
      return m.reply(
        `⚠️ *TikTok search is temporarily unavailable.*\n\n` +
        `You can still browse directly:\n` +
        `🔗 https://www.tiktok.com/search?q=${encodeURIComponent(input)}\n` +
        `🔗 https://www.tiktok.com/tag/${encodeURIComponent(tag)}\n\n` +
        `_Please try the command again in a few minutes._`
      );
    }

    const lines = res.results.slice(0, 8).map((v, i) => {
      return (
        `*${i + 1}.* ${String(v.title || 'TikTok video').slice(0, 70)}\n` +
        `   👤 @${v.author}  ⏱️ ${fmtDur(v.duration)}  ▶️ ${fmtNum(v.plays)}  ❤️ ${fmtNum(v.likes)}\n` +
        `   🔗 ${v.url}`
      );
    });

    await m.react('✅').catch(() => null);

    const note = res.provider === 'tikwm-region'
      ? 'ℹ️ _No exact matches for that keyword, so here are trending videos in Pakistan._\n\n'
      : '';

    return m.reply(
      `🎬 *TIKTOK SEARCH — "${input}"*\n` +
      `🇵🇰 _Region: Pakistan_\n\n` +
      note +
      lines.join('\n\n') +
      `\n\n💡 Download any video with *${prefix}ttdl <link>*`
    );
  }
};
