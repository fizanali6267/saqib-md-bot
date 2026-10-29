const axios = require('axios');
const config = require('../config');

module.exports = {
  name: 'islamic',
  commands: ['prayer', 'namaz', 'quran', 'surah', 'hadith', 'azan', 'athan'],
  execute: async (sock, m, { command, args, prefix }) => {
    switch (command) {
      case 'prayer':
      case 'namaz': {
        const city = args.join(' ') || 'Lahore';
        await m.react('🕌');
        try {
          const res = await axios.get(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=Pakistan&method=1`);
          const t = res.data?.data?.timings;
          const d = res.data?.data?.date;

          if (!t) return m.reply(`❌ Could not fetch prayer timings for "${city}".`);

          const msg = `🕌 *── DAILY PRAYER TIMINGS (${city.toUpperCase()}) ──* 🕌\n\n` +
            `📅 *Hijri Date:* ${d.hijri.day} ${d.hijri.month.en} ${d.hijri.year} AH\n` +
            `📆 *Solar Date:* ${d.readable}\n\n` +
            `• *Fajr:* ${t.Fajr}\n` +
            `• *Sunrise:* ${t.Sunrise}\n` +
            `• *Dhuhr:* ${t.Dhuhr}\n` +
            `• *Asr:* ${t.Asr}\n` +
            `• *Sunset:* ${t.Sunset}\n` +
            `• *Maghrib:* ${t.Maghrib}\n` +
            `• *Isha:* ${t.Isha}\n\n` +
            `_“Indeed, prayer has been decreed upon the believers a decree of specified times.” [4:103]_`;

          await m.reply(msg);
        } catch (e) {
          await m.reply(`❌ Error fetching prayer times: ${e.message}`);
        }
        break;
      }

      case 'quran': {
        const query = args[0]; // e.g. 1:1 or 2:255
        if (!query || !query.includes(':')) {
          return m.reply(`❓ Provide Surah and Ayah numbers separated by colon!\n*Example:* *${prefix}quran 2:255* (Ayat-ul-Kursi)`);
        }

        const [surah, ayah] = query.split(':');
        await m.react('📖');

        try {
          const res = await axios.get(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/editions/quran-uthmani,ur.jalandhry,en.sahih`);
          const data = res.data?.data;

          if (!data || data.length < 3) return m.reply('❌ Ayah not found. Please check Surah:Ayah numbers.');

          const arabic = data[0].text;
          const urdu = data[1].text;
          const english = data[2].text;
          const surahName = data[0].surah.englishName;

          const msg = `📖 *── SURAH ${surahName.toUpperCase()} [${surah}:${ayah}] ──* 📖\n\n` +
            `*Arabic:*\n${arabic}\n\n` +
            `*Urdu Translation:*\n${urdu}\n\n` +
            `*English Translation:*\n${english}\n\n` +
            `_Al-Quran Al-Kareem_`;

          await m.reply(msg);
        } catch (e) {
          await m.reply(`❌ Failed to retrieve Quranic verse: ${e.message}`);
        }
        break;
      }

      case 'surah': {
        const surahNum = args[0] || '1';
        await m.react('📖');
        try {
          const res = await axios.get(`https://api.alquran.cloud/v1/surah/${surahNum}`);
          const s = res.data?.data;
          if (!s) return m.reply('❌ Surah number not found (1-114).');

          const msg = `📖 *── SURAH ${s.englishName.toUpperCase()} (${s.name}) ──* 📖\n\n` +
            `• *Surah Number:* ${s.number}\n` +
            `• *English Translation:* ${s.englishNameTranslation}\n` +
            `• *Revelation Type:* ${s.revelationType}\n` +
            `• *Total Verses:* ${s.numberOfAyahs}\n\n` +
            `_Use ${prefix}quran ${s.number}:1 to read verses._`;

          await m.reply(msg);
        } catch (e) {
          await m.reply(`❌ Surah error: ${e.message}`);
        }
        break;
      }

      case 'hadith': {
        await m.react('📜');
        try {
          // Reliable Hadith API endpoint
          const res = await axios.get(`https://api.hadith.gading.dev/books/bukhari?range=1-50`).catch(() => null);
          const hadithList = res?.data?.data?.hadiths || [];
          const randomH = hadithList[Math.floor(Math.random() * hadithList.length)];

          if (randomH) {
            const msg = `📜 *── SAHIH BUKHARI HADITH [No. ${randomH.number}] ──* 📜\n\n` +
              `*Arabic:*\n${randomH.arab}\n\n` +
              `*Translation:*\n${randomH.id || 'Good deeds erase bad deeds and bring peace to the believers.'}\n\n` +
              `_Sahih Al-Bukhari_`;
            await m.reply(msg);
          } else {
            await m.reply(`📜 *Hadith of the Day (Sahih Bukhari):*\n\n"The best among you are those who have the best manners and character."\n_[Sahih Al-Bukhari 3559]_`);
          }
        } catch (e) {
          await m.reply(`📜 *Hadith of the Day (Sahih Bukhari):*\n\n"None of you truly believes until he loves for his brother what he loves for himself."\n_[Sahih Al-Bukhari 13]_`);
        }
        break;
      }

      case 'azan':
      case 'athan': {
        await m.react('🔊');
        const azanAudioUrl = 'https://media.sd.ma/assabile/athan_37564/makkah.mp3';
        await sock.sendMessage(m.chat, {
          audio: { url: azanAudioUrl },
          mimetype: 'audio/mpeg',
          fileName: 'Azan_Makkah.mp3'
        }, { quoted: m });
        break;
      }
    }
  }
};
