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
        // Issue 6 Fix: .quran with no argument used to throw / return a bare
        // usage error. Now it falls back to Ayat-ul-Kursi (2:255) with a tip.
        let query = args[0];
        let isDefault = false;
        if (!query || !query.includes(':')) {
          query = '2:255'; // Ayat-ul-Kursi
          isDefault = true;
        }

        const [surah, ayah] = query.split(':');
        await m.react('📖').catch(() => null);

        try {
          const res = await axios.get(
            `https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/editions/quran-uthmani,ur.jalandhry,en.sahih`,
            { timeout: 8000 }
          );
          const data = res.data?.data;

          if (!data || data.length < 3) return m.reply('❌ Ayah not found. Please check Surah:Ayah numbers.');

          const arabic = data[0].text;
          const urdu = data[1].text;
          const english = data[2].text;
          const surahName = data[0].surah.englishName;

          let msg = `📖 *── SURAH ${surahName.toUpperCase()} [${surah}:${ayah}] ──* 📖\n\n` +
            `*Arabic:*\n${arabic}\n\n` +
            `*Urdu Translation:*\n${urdu}\n\n` +
            `*English Translation:*\n${english}\n\n`;

          if (isDefault) {
            msg += `💡 *Tip:* Kisi bhi Surah ki Ayah dekhne ke liye type karein: *${prefix}quran [surah]:[ayah]* (e.g. *${prefix}quran 1:1*)\n\n`;
          }
          msg += `_Al-Quran Al-Kareem_`;

          await m.reply(msg);
        } catch (e) {
          // Issue 6 Fix: offline API par crash ke bajaye offline Ayat-ul-Kursi
          await m.reply(
            `📖 *── AYAT-UL-KURSI [Surah Al-Baqarah 2:255] ──* 📖\n\n` +
            `اللَّهُ لَا إِلٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ...\n\n` +
            `_Al-Quran Al-Kareem_`
          );
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
        // Issue 5 Fix: the old hardcoded media.sd.ma URL was offline/blocked and
        // crashed the command (no try/catch). Now: multiple CDN mirrors, a real
        // timeout, and a complete Arabic text fallback if every mirror fails.
        await m.react('🔊').catch(() => null);

        const cdnMirrors = [
          'https://download.quranicaudio.com/athan/makkah.mp3',
          'https://server8.mp3quran.net/athan/Adhan_Makkah.mp3',
          'https://www.islamcan.com/audio/adhan/azan1.mp3'
        ];

        let audioSent = false;
        for (const url of cdnMirrors) {
          try {
            const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 7000 });
            if (res.status === 200 && res.data && res.data.byteLength > 1000) {
              await sock.sendMessage(m.chat, {
                audio: Buffer.from(res.data),
                mimetype: 'audio/mpeg',
                fileName: 'Azan_Makkah.mp3',
                ptt: true
              }, { quoted: m });
              audioSent = true;
              break;
            }
          } catch (_) {
            // try the next mirror
          }
        }

        if (!audioSent) {
          // Fail-safe: never crash, always deliver the Azan text + dua
          await m.reply(
            `📢 *───「 AZAN (CALL TO PRAYER) 」───* 📢\n\n` +
            `اللَّهُ أَكْبَرُ اللَّهُ أَكْبَرُ\n` +
            `اللَّهُ أَكْبَرُ اللَّهُ أَكْبَرُ\n\n` +
            `أَشْهَدُ أَنْ لَا إِلٰهَ إِلَّا اللَّهُ\n` +
            `أَشْهَدُ أَنْ لَا إِلٰهَ إِلَّا اللَّهُ\n\n` +
            `أَشْهَدُ أَنَّ مُحَمَّدًا رَسُولُ اللَّهِ\n` +
            `أَشْهَدُ أَنَّ مُحَمَّدًا رَسُولُ اللَّهِ\n\n` +
            `حَيَّ عَلَى الصَّلَاةِ\n` +
            `حَيَّ عَلَى الصَّلَاةِ\n\n` +
            `حَيَّ عَلَى الْفَلَاحِ\n` +
            `حَيَّ عَلَى الْفَلَاحِ\n\n` +
            `اللَّهُ أَكْبَرُ اللَّهُ أَكْبَرُ\n` +
            `لَا إِلٰهَ إِلَّا اللَّهُ\n\n` +
            `🤲 *Dua after Azan:*\n` +
            `_“Allahumma Rabba hadhihid-da'wati-t-tammah, was-salatil-qa'imah, ati Muhammadan al-wasilata wal-fadilah, wab'ath-hu maqaman mahmudan alladhi wa'adtah.”_\n\n` +
            `_“Whenever you hear the Azan, repeat what the Mu'adh-dhin says.” [Sahih Al-Bukhari 611]_`
          );
        }

        await m.react('✅').catch(() => null);
        break;
      }
    }
  }
};
