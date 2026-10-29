const os = require('os');
const path = require('path');
const fs = require('fs');
const humanizeDuration = require('humanize-duration');
const config = require('../config');

// Cache the banner once — avoids a synchronous disk read on every .menu call.
let _bannerCache = null;
function getBanner() {
  if (_bannerCache !== null) return _bannerCache;
  try {
    const p = path.join(__dirname, '../assets/banner.jpg');
    _bannerCache = fs.existsSync(p) ? fs.readFileSync(p) : false;
  } catch (_) {
    _bannerCache = false;
  }
  return _bannerCache;
}

module.exports = {
  name: 'general',
  commands: ['menu', 'help', 'ping', 'speed', 'alive', 'runtime', 'uptime', 'owner', 'system', 'info', 'restart', 'commanddetails', 'commands', 'cmd', 'cmdinfo'],
  execute: async (sock, m, { command, args, prefix }) => {
    switch (command) {
      case 'menu':
      case 'help': {
        const uptime = humanizeDuration(process.uptime() * 1000, { round: true });
        const menuText = `⚡ *───「 ${config.BOT_NAME} 」───* ⚡

👋 *Welcome, @${m.sender.split('@')[0]}!*
👑 *Developer:* ${config.OWNER_NAME}
⏱️ *Uptime:* ${uptime}
⚙️ *Prefix:* ${prefix}
🌐 *Mode:* ${config.WORK_TYPE.toUpperCase()}
📊 *Total Commands:* 115+ Active

┌─── 🌟 *GENERAL & SYSTEM*
│ ◦ ${prefix}menu
│ ◦ ${prefix}commanddetails
│ ◦ ${prefix}ping
│ ◦ ${prefix}alive
│ ◦ ${prefix}runtime
│ ◦ ${prefix}owner
│ ◦ ${prefix}system
│ ◦ ${prefix}restart
└───────────────

┌─── 🛡️ *SECURITY & AUTOMATION*
│ ◦ ${prefix}antidelete
│ ◦ ${prefix}vv
│ ◦ ${prefix}vv2
│ ◦ ${prefix}autovv
│ ◦ ${prefix}save
│ ◦ ${prefix}alwaysonline
│ ◦ ${prefix}bluetick
│ ◦ ${prefix}autoreact
│ ◦ ${prefix}aireact
│ ◦ ${prefix}autostatus
│ ◦ ${prefix}chatbot
│ ◦ ${prefix}antibadword
│ ◦ ${prefix}anticall
│ ◦ ${prefix}autobio
└───────────────

┌─── 🕌 *ISLAMIC & SPIRITUAL*
│ ◦ ${prefix}prayer
│ ◦ ${prefix}quran
│ ◦ ${prefix}surah
│ ◦ ${prefix}hadith
│ ◦ ${prefix}azan
└───────────────

┌─── ✍️ *SMART AI & WRITING*
│ ◦ ${prefix}ai
│ ◦ ${prefix}summarize
│ ◦ ${prefix}rephrase
│ ◦ ${prefix}grammar
│ ◦ ${prefix}code
│ ◦ ${prefix}lyrics
│ ◦ ${prefix}recipe
│ ◦ ${prefix}imagine
└───────────────

┌─── 🎛️ *AUDIO & MEDIA MODIFIERS*
│ ◦ ${prefix}bass
│ ◦ ${prefix}nightcore
│ ◦ ${prefix}slowed
│ ◦ ${prefix}reverse
│ ◦ ${prefix}mute
│ ◦ ${prefix}compress
│ ◦ ${prefix}circle
│ ◦ ${prefix}emojimix
└───────────────

┌─── 🌐 *DAILY & WEB UTILITIES*
│ ◦ ${prefix}wiki
│ ◦ ${prefix}crypto
│ ◦ ${prefix}currency
│ ◦ ${prefix}qr
│ ◦ ${prefix}readqr
│ ◦ ${prefix}tempmail
│ ◦ ${prefix}checkmail
│ ◦ ${prefix}weather
│ ◦ ${prefix}google
│ ◦ ${prefix}calc
│ ◦ ${prefix}shorturl
│ ◦ ${prefix}define
│ ◦ ${prefix}whoisdomain
│ ◦ ${prefix}speedtest
└───────────────

┌─── 🛠️ *PROFILE & INTERACTIVE*
│ ◦ ${prefix}getpp
│ ◦ ${prefix}setpp
│ ◦ ${prefix}profile
│ ◦ ${prefix}fancy
│ ◦ ${prefix}poll
│ ◦ ${prefix}remind
│ ◦ ${prefix}stickertele
└───────────────

┌─── 👥 *GROUP CONTROLS*
│ ◦ ${prefix}tagall
│ ◦ ${prefix}hidetag
│ ◦ ${prefix}tagadmin
│ ◦ ${prefix}listadmin
│ ◦ ${prefix}kick
│ ◦ ${prefix}add
│ ◦ ${prefix}promote
│ ◦ ${prefix}demote
│ ◦ ${prefix}group
│ ◦ ${prefix}setname
│ ◦ ${prefix}setdesc
│ ◦ ${prefix}setgpp
│ ◦ ${prefix}mutechat
│ ◦ ${prefix}unmutechat
│ ◦ ${prefix}link
│ ◦ ${prefix}revoke
│ ◦ ${prefix}antilink
│ ◦ ${prefix}antispam
│ ◦ ${prefix}warn
│ ◦ ${prefix}resetwarn
│ ◦ ${prefix}ghost
│ ◦ ${prefix}kickinactive
└───────────────

┌─── 🔒 *PRIVACY & MESSAGE TOOLS*
│ ◦ ${prefix}del
│ ◦ ${prefix}vvphoto
│ ◦ ${prefix}vvvideo
│ ◦ ${prefix}forward
│ ◦ ${prefix}readmore
│ ◦ ${prefix}quoted
└───────────────

┌─── 🎮 *FUN, GAMES & SOCIAL*
│ ◦ ${prefix}truth
│ ◦ ${prefix}dare
│ ◦ ${prefix}paheli
│ ◦ ${prefix}quote
│ ◦ ${prefix}fact
│ ◦ ${prefix}coin
│ ◦ ${prefix}dice
│ ◦ ${prefix}ship
│ ◦ ${prefix}roast
└───────────────

┌─── 🎭 *VIP ANIME GIF REACTIONS (21+)*
│ ◦ ${prefix}kiss
│ ◦ ${prefix}angry
│ ◦ ${prefix}love
│ ◦ ${prefix}lovebite
│ ◦ ${prefix}cry
│ ◦ ${prefix}cuddle
│ ◦ ${prefix}dance
│ ◦ ${prefix}wave
│ ◦ ${prefix}wink
│ ◦ ${prefix}punch
│ ◦ ${prefix}blush
│ ◦ ${prefix}highfive
│ ◦ ${prefix}kill
│ ◦ ${prefix}poke
│ ◦ ${prefix}happy
│ ◦ ${prefix}smile
│ ◦ ${prefix}nom
│ ◦ ${prefix}hug
│ ◦ ${prefix}slap
│ ◦ ${prefix}pat
└───────────────

┌─── 📥 *MEDIA DOWNLOADERS*
│ ◦ ${prefix}song
│ ◦ ${prefix}video
│ ◦ ${prefix}yts
│ ◦ ${prefix}tiktok
│ ◦ ${prefix}fb
│ ◦ ${prefix}ig
│ ◦ ${prefix}apk
│ ◦ ${prefix}mediafire
└───────────────

┌─── 🎨 *CONVERTERS & MEDIA*
│ ◦ ${prefix}sticker
│ ◦ ${prefix}take
│ ◦ ${prefix}toimg
│ ◦ ${prefix}tovideo
│ ◦ ${prefix}tomp3
│ ◦ ${prefix}tts
│ ◦ ${prefix}translate
│ ◦ ${prefix}ocr
└───────────────

┌─── 👑 *OWNER CONTROLS*
│ ◦ ${prefix}mode
│ ◦ ${prefix}public
│ ◦ ${prefix}private
│ ◦ ${prefix}block
│ ◦ ${prefix}unblock
│ ◦ ${prefix}broadcast
│ ◦ ${prefix}join
└───────────────

💡 *For full syntax and descriptions of all 115+ commands:*
Type *${prefix}commanddetails*

🚀 *Get Your Own Free Saqib-MD Bot:*
🔗 ${config.PAIRING_LINK}

_⚡ Engineered for High-Speed Performance | Powered by Saqib Iqbal_`;

        const bannerBuffer = getBanner();
        if (bannerBuffer) {
          await sock.sendMessage(m.chat, {
            image: bannerBuffer,
            caption: menuText,
            mentions: [m.sender]
          }, { quoted: m });
        } else {
          await m.reply(menuText, { mentions: [m.sender] });
        }
        break;
      }

      case 'commanddetails':
      case 'commands':
      case 'cmd':
      case 'cmdinfo': {
        const detailsText = `📋 *───「 ${config.BOT_NAME} COMMAND DIRECTORY 」───* 📋

Comprehensive manual of all 115+ commands supported by ${config.BOT_NAME}:

━━━━━━━━━━━━━━━━━━━━━
🌟 *1. GENERAL & SYSTEM*
━━━━━━━━━━━━━━━━━━━━━
• *${prefix}menu* - Compact dashboard attached to luxury banner.
• *${prefix}commanddetails* - Full command manual with descriptions.
• *${prefix}ping* - Tests WebSocket round-trip response speed (ms).
• *${prefix}alive* - Verifies operational status & active APIs.
• *${prefix}runtime* - Displays continuous server uptime.
• *${prefix}owner* - Delivers Saqib Iqbal's verified vCard contact.
• *${prefix}system* - Real-time host RAM, OS specs, and Node.js metrics.
• *${prefix}restart* - Safely reboots the cloud process (Owner only).

━━━━━━━━━━━━━━━━━━━━━
🛡️ *2. SECURITY & AUTOMATION*
━━━━━━━━━━━━━━━━━━━━━
• *${prefix}antidelete same / inbox / off* - Recovers deleted messages with sender & deleter tags.
• *${prefix}vv* - Unlocks View-Once photos/videos in current chat.
• *${prefix}vv2* - Secretly delivers unlocked View-Once media to your personal DM.
• *${prefix}autovv on / off* - Auto-saves incoming View-Once media straight to your inbox.
• *${prefix}save* - Reply to any WhatsApp status to get clean media sent directly to your DM! (Also triggers automatically on status reply).
• *${prefix}alwaysonline on / off* - Keeps presence as "Available" 24/7.
• *${prefix}bluetick on / off* - Toggles automatic blue read receipts vs double grey ticks.
• *${prefix}autoreact all / sender / me / mirror / off* - Automated message reaction modes.
• *${prefix}aireact on / off* - AI sentiment analysis emoji reactions.
• *${prefix}autostatus on / off / react / emoji* - Views status updates & leaves automated reactions.
• *${prefix}chatbot pm on / off* - Enables human-like conversational companion in DMs.
• *${prefix}chatbot group on / off* - Enables friendly conversational companion in Groups.
• *${prefix}antibadword on / off* - Removes abusive language.
• *${prefix}anticall on / off* - Auto-declines calls & blocks callers.
• *${prefix}autobio on / off* - Live digital clock in WhatsApp bio.

━━━━━━━━━━━━━━━━━━━━━
🕌 *3. ISLAMIC & SPIRITUAL*
━━━━━━━━━━━━━━━━━━━━━
• *${prefix}prayer [city]* - Daily prayer timings (Fajr, Dhuhr, Asr, Maghrib, Isha) for any city.
• *${prefix}quran [surah:ayah]* - Quranic verse in Arabic text with Urdu/English translations.
• *${prefix}surah [number]* - Surah details, names, verses count, and revelations.
• *${prefix}hadith* - Authentic Hadith of the day from Sahih Al-Bukhari.
• *${prefix}azan* - Delivers beautiful Azan audio recitation file.

━━━━━━━━━━━━━━━━━━━━━
✍️ *4. SMART AI & CONTENT WRITING*
━━━━━━━━━━━━━━━━━━━━━
• *${prefix}summarize [text/quote]* - Concise bullet-point summary of long text.
• *${prefix}rephrase [text/quote]* - Rewrites text in Professional, Casual, and Persuasive styles.
• *${prefix}grammar [text/quote]* - Detects and corrects grammar, punctuation, and spelling errors.
• *${prefix}code [lang] [task]* - Generates clean, production-ready code snippets.
• *${prefix}lyrics [song]* - Full authentic song/naat lyrics.
• *${prefix}recipe [dish]* - Step-by-step culinary cooking recipes with ingredients.
• *${prefix}imagine [prompt]* - Generates photorealistic AI artwork.

━━━━━━━━━━━━━━━━━━━━━
🎛️ *5. AUDIO & MEDIA MODIFIERS*
━━━━━━━━━━━━━━━━━━━━━
• *${prefix}bass* - Boosts low-frequency bass in quoted audio/song.
• *${prefix}nightcore* - Speeds up audio with Nightcore pitch enhancement.
• *${prefix}slowed* - Converts audio to aesthetic Slowed + Reverb lofi music.
• *${prefix}reverse* - Plays quoted audio or video backwards.
• *${prefix}mute* - Removes audio track from video files.
• *${prefix}compress* - Compresses large video or image file sizes.
• *${prefix}circle* - Converts quoted photo into a circular WhatsApp sticker.
• *${prefix}emojimix [e1+e2]* - Combines two emojis into a custom sticker.

━━━━━━━━━━━━━━━━━━━━━
🌐 *6. DAILY & WEB UTILITIES*
━━━━━━━━━━━━━━━━━━━━━
• *${prefix}wiki [query]* - Wikipedia search summaries.
• *${prefix}crypto [coin]* - Real-time prices for BTC, ETH, SOL, USDT in USD & PKR.
• *${prefix}currency [amount from to]* - Live international forex exchange rates.
• *${prefix}qr [text/link]* - Generates high-definition QR code image.
• *${prefix}tempmail* - Generates disposable temporary email for signups.
• *${prefix}checkmail* - Checks temporary email inbox for incoming OTPs.
• *${prefix}whoisdomain [domain]* - Domain registration and DNS verification.
• *${prefix}speedtest* - Measures host server internet download/upload speeds.

━━━━━━━━━━━━━━━━━━━━━
🛠️ *7. INTERACTIVE & PROFILE*
━━━━━━━━━━━━━━━━━━━━━
• *${prefix}getpp [@user/number]* - Downloads full HD profile picture of any user.
• *${prefix}setpp [full/square/fit]* - Updates your profile picture without cropping!
• *${prefix}profile [@user]* - Fetches HD DP, WhatsApp bio, and registration details.
• *${prefix}fancy [text]* - Converts text into 6+ stylish fonts.
• *${prefix}poll [Question | Opt1 | Opt2]* - Creates native WhatsApp interactive poll.
• *${prefix}remind [time] [task]* - Accurate countdown reminder notification.
• *${prefix}stickertele [link]* - Downloads Telegram sticker packs into WhatsApp.

━━━━━━━━━━━━━━━━━━━━━
👥 *8. GROUP MANAGEMENT*
━━━━━━━━━━━━━━━━━━━━━
• *${prefix}tagall [msg]* - Mentions all group members visibly.
• *${prefix}hidetag [msg]* - Mentions all members invisibly behind the message.
• *${prefix}tagadmin [reason]* - Pings all group administrators only.
• *${prefix}listadmin* - Lists all admins with phone numbers.
• *${prefix}kick [@user]* - Removes participant from group.
• *${prefix}add [phone]* - Adds phone number to group.
• *${prefix}promote [@user]* - Promotes member to Admin.
• *${prefix}demote [@user]* - Demotes Admin back to member.
• *${prefix}group open / close* - Locks or unlocks group messages.
• *${prefix}setname [name]* - Updates group subject.
• *${prefix}setdesc [desc]* - Updates group description.
• *${prefix}setgpp* - Updates group icon using quoted image.
• *${prefix}mutechat / unmutechat* - Silences or enables group conversation.
• *${prefix}antilink on / off* - Deletes external links and kicks sender.
• *${prefix}antispam on / off* - Protects against message flood spammers.
• *${prefix}warn [@user]* - Infraction strike (3 = auto kick).
• *${prefix}resetwarn [@user]* - Resets strike count to zero.
• *${prefix}ghost* - Scans group for inactive members.

━━━━━━━━━━━━━━━━━━━━━
🔒 *9. PRIVACY & MESSAGE TOOLS*
━━━━━━━━━━━━━━━━━━━━━
• *${prefix}del* - Deletes quoted message (bot or user message if bot is admin).
• *${prefix}vvphoto / vvvideo* - Converts media into View-Once.
• *${prefix}forward [number]* - Forwards quoted message to specified recipient.
• *${prefix}readmore [visible | hidden]* - Creates WhatsApp spoiler text.
• *${prefix}quoted* - Inspects hidden metadata of quoted message.

━━━━━━━━━━━━━━━━━━━━━
🎮 *10. FUN, GAMES & SOCIAL*
━━━━━━━━━━━━━━━━━━━━━
• *${prefix}truth* - Random engaging truth question.
• *${prefix}dare* - Exciting dare challenge.
• *${prefix}paheli* - Brain-teaser riddle with spoiler answer.
• *${prefix}quote* - Motivational quote of the day.
• *${prefix}fact* - Fascinating scientific/historical fact.
• *${prefix}coin* - Coin toss (Heads or Tails).
• *${prefix}dice* - Rolls a 6-sided dice (1 to 6).
• *${prefix}ship [@user1 @user2]* - Love compatibility percentage meter.
• *${prefix}roast [@user]* - Playful witty roast.

━━━━━━━━━━━━━━━━━━━━━
🎭 *11. VIP ANIME GIF REACTIONS (21+)*
━━━━━━━━━━━━━━━━━━━━━
• *${prefix}kiss*, *${prefix}love*, *${prefix}lovebite*, *${prefix}cuddle*, *${prefix}hug*, *${prefix}pat*, *${prefix}blush*, *${prefix}wink*, *${prefix}happy*, *${prefix}smile* - Affectionate & romantic reactions.
• *${prefix}angry*, *${prefix}slap*, *${prefix}punch*, *${prefix}kill*, *${prefix}bite* - Action & battle reactions.
• *${prefix}cry*, *${prefix}dance*, *${prefix}wave*, *${prefix}highfive*, *${prefix}poke*, *${prefix}nom* - Mood & playful reactions.

━━━━━━━━━━━━━━━━━━━━━
📥 *12. MEDIA DOWNLOADERS*
━━━━━━━━━━━━━━━━━━━━━
• *${prefix}song [query]* - Ultra-fast YouTube MP3 stream fetcher.
• *${prefix}video [query]* - High definition YouTube video downloader.
• *${prefix}yts [query]* - Searches YouTube with durations and links.
• *${prefix}tiktok [link]* - No-watermark HD TikTok video downloader.
• *${prefix}fb [link]* - High definition Facebook video downloader.
• *${prefix}ig [link]* - Instagram post, reels, and video downloader.
• *${prefix}apk [app]* - Official Android APK installer downloader.
• *${prefix}mediafire [link]* - Direct MediaFire file downloader.

━━━━━━━━━━━━━━━━━━━━━
🎨 *13. CONVERTERS & UTILITIES*
━━━━━━━━━━━━━━━━━━━━━
• *${prefix}sticker* - Converts photo/video to sticker.
• *${prefix}take [pack|author]* - Edits sticker author & pack name.
• *${prefix}toimg* - Converts sticker back to photo.
• *${prefix}tovideo* - Converts animated sticker to video.
• *${prefix}tomp3* - Extracts audio track to MP3.
• *${prefix}tts [lang] [text]* - Text-to-speech audio converter.
• *${prefix}translate [lang] [text]* - Multi-language translation.
• *${prefix}ocr* - Extracts text from quoted images.

━━━━━━━━━━━━━━━━━━━━━
👑 *14. OWNER CONTROLS*
━━━━━━━━━━━━━━━━━━━━━
• *${prefix}mode public / private* - Public access or owner-only access.
• *${prefix}public* - Shortcut to switch bot mode to public.
• *${prefix}private* - Shortcut to switch bot mode to private.
• *${prefix}block / unblock [@user]* - Block or unblock users.
• *${prefix}broadcast [msg]* - Broadcasts message to all groups.
• *${prefix}join [link]* - Joins group via invite link.

━━━━━━━━━━━━━━━━━━━━━
🚀 *Deploy your own free bot here:*
🔗 ${config.PAIRING_LINK}

_⚡ Developed exclusively for Saqib Iqbal | Ultra-Fast Architecture_`;

        await m.reply(detailsText);
        break;
      }

      case 'ping':
      case 'speed': {
        const start = Date.now();
        // Issue 6 Fix: fire-and-forget reaction. Awaiting m.react() added the
        // whole WhatsApp round-trip to the measured latency and made .ping feel
        // slow even on a healthy connection.
        m.react('⚡').catch(() => null);
        const latency = Date.now() - start;
        await m.reply(`🚀 *Pong:* \`${latency}ms\`\n⚡ *Status:* Online & Lightning Fast\n\n👑 *Developer:* ${config.OWNER_NAME}\n🤖 *Engine:* ${config.BOT_NAME} High-Speed Core`);
        break;
      }

      case 'alive': {
        await m.reply(`✨ *${config.BOT_NAME} IS OPERATIONAL & RUNNING!* ✨\n\n` +
          `👑 *Developer:* ${config.OWNER_NAME}\n` +
          `⚡ *Response Engine:* Sub-Second Baileys Multi-Device\n` +
          `🧠 *AI Brain:* Google Gemini 1.5 Flash\n` +
          `🌤️ *Weather Engine:* OpenWeatherMap High-Speed API\n` +
          `💬 *Command List:* Type *${prefix}menu* or *${prefix}commanddetails*\n\n` +
          `🚀 *Get Your Own Free Bot:* ${config.PAIRING_LINK}`);
        break;
      }

      case 'runtime':
      case 'uptime': {
        const duration = humanizeDuration(process.uptime() * 1000, { round: true });
        await m.reply(`⏱️ *Uptime:* ${duration}`);
        break;
      }

      case 'owner': {
        const vcard = 'BEGIN:VCARD\n' +
          'VERSION:3.0\n' +
          `FN:${config.OWNER_NAME}\n` +
          `ORG:${config.BOT_NAME} Development;\n` +
          `TEL;type=CELL;type=VOICE;waid=${config.OWNER_NUMBER}:+${config.OWNER_NUMBER}\n` +
          'END:VCARD';
        await sock.sendMessage(m.chat, {
          contacts: { displayName: config.OWNER_NAME, contacts: [{ vcard }] }
        }, { quoted: m });
        break;
      }

      case 'system':
      case 'info': {
        const memory = process.memoryUsage();
        const totalRam = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
        const freeRam = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
        const usedRam = (memory.heapUsed / 1024 / 1024).toFixed(2);

        await m.reply(`💻 *── SYSTEM SPECIFICATIONS ──* 💻\n\n` +
          `🖥️ *OS:* ${os.type()} ${os.arch()}\n` +
          `🧠 *Total Host RAM:* ${totalRam} GB\n` +
          `🆓 *Free RAM:* ${freeRam} GB\n` +
          `📊 *Node.js RAM Allocated:* ${usedRam} MB\n` +
          `⚙️ *Platform:* Railway / Linux Cloud Container\n` +
          `⏱️ *Continuous Uptime:* ${humanizeDuration(process.uptime() * 1000, { round: true })}`);
        break;
      }

      case 'restart': {
        if (!config.checkIsOwner(m, sock)) {
          return m.reply(config.MESSAGES.OWNER_ONLY);
        }
        await m.reply('🔄 *Restarting Saqib-MD instance... Reconnecting within seconds.*');
        process.exit(0);
        break;
      }
    }
  }
};
