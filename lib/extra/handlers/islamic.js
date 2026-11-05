'use strict';
/**
 * Islamic command handlers (10 commands).
 * qibla, tasbeeh, hijri, duas, namesofallah, zakat, tafsir, seerah,
 * islamicquiz, hajjguide
 */
const U = require('../util');

const { textOf, need, reply, ai, box, getJson, pick, randInt } = U;

/* ------------------------------------------------------------------ */
/* Static data                                                         */
/* ------------------------------------------------------------------ */

const DUAS = [
  { t: 'Dua before eating', a: 'Bismillah', m: 'Bismillah — In the name of Allah.' },
  { t: 'Dua after eating', a: 'Alhamdulillahil-lazi at\'amana wa saqana wa ja\'alana minal-muslimeen', m: 'All praise is for Allah who fed us and gave us drink and made us Muslims.' },
  { t: 'Dua before sleeping', a: 'Bismika Allahumma amutu wa ahya', m: 'In Your name O Allah, I die and I live.' },
  { t: 'Dua on waking', a: 'Alhamdulillahil-lazi ahyana ba\'da ma amatana wa ilaihin-nushur', m: 'All praise is for Allah who gave us life after death, and to Him is the return.' },
  { t: 'Dua entering the toilet', a: 'Allahumma inni a\'uzu bika minal-khubusi wal-khaba\'is', m: 'O Allah, I seek refuge with You from evil and wicked things.' },
  { t: 'Dua leaving the toilet', a: 'Ghufranak', m: 'I seek Your forgiveness.' },
  { t: 'Dua before wudu', a: 'Bismillah', m: 'In the name of Allah.' },
  { t: 'Dua after wudu', a: 'Ash-hadu an la ilaha illallahu wahdahu la sharika lahu wa ash-hadu anna Muhammadan abduhu wa rasuluh', m: 'I bear witness that there is no god but Allah alone, and Muhammad is His servant and messenger.' },
  { t: 'Dua entering the mosque', a: 'Allahummaftah li abwaba rahmatik', m: 'O Allah, open for me the gates of Your mercy.' },
  { t: 'Dua leaving the mosque', a: 'Allahumma inni as\'aluka min fadlik', m: 'O Allah, I ask You from Your bounty.' },
  { t: 'Dua for travelling', a: 'Subhanallazi sakhkhara lana haza wa ma kunna lahu muqrinin wa inna ila Rabbina lamunqalibun', m: 'Glory to Him who has subjected this to us, and to our Lord we shall return.' },
  { t: 'Dua for anxiety', a: 'Allahumma inni a\'uzu bika minal-hammi wal-hazan', m: 'O Allah, I seek refuge in You from worry and grief.' },
  { t: 'Dua for parents', a: 'Rabbir-hamhuma kama rabbayani saghira', m: 'My Lord, have mercy on them as they raised me when I was small.' },
  { t: 'Dua for knowledge', a: 'Rabbi zidni ilma', m: 'My Lord, increase me in knowledge.' },
  { t: 'Dua for forgiveness', a: 'Astaghfirullaha Rabbi min kulli zambin wa atubu ilaih', m: 'I seek forgiveness from my Lord for every sin and turn to Him in repentance.' },
  { t: 'Dua for protection', a: 'A\'uzu bikalimatillahit-tammati min sharri ma khalaq', m: 'I seek refuge in the perfect words of Allah from the evil of what He created.' },
  { t: 'Dua for the deceased', a: 'Allahummaghfir lahu warhamhu wa \'afihi wa\'fu anhu', m: 'O Allah, forgive him, have mercy on him, grant him peace and pardon him.' },
  { t: 'Dua when it rains', a: 'Allahumma sayyiban nafi\'a', m: 'O Allah, a beneficial rain.' },
  { t: 'Dua for a new moon', a: 'Allahumma ahillahu \'alaina bil-yumni wal-iman', m: 'O Allah, let it rise upon us with blessing and faith.' },
  { t: 'Dua for entering the market', a: 'La ilaha illallahu wahdahu la sharika lah, lahul-mulku wa lahul-hamdu', m: 'There is no god but Allah alone, His is the dominion and His is the praise.' },
  { t: 'Dua for distress', a: 'La ilaha illallahul-\'Azimul-Halim', m: 'There is no god but Allah, the Mighty, the Forbearing.' },
  { t: 'Dua for a good spouse', a: 'Rabbana hab lana min azwajina wa zurriyyatina qurrata a\'yun', m: 'Our Lord, grant us from our spouses and offspring comfort to our eyes.' },
  { t: 'Dua for patience', a: 'Rabbana afrigh \'alaina sabran wa thabbit aqdamana', m: 'Our Lord, pour upon us patience and make our feet firm.' },
  { t: 'Dua for protection from hellfire', a: 'Rabbana isrif \'anna \'azaba Jahannam', m: 'Our Lord, avert from us the punishment of Hell.' },
  { t: 'Dua for good in both worlds', a: 'Rabbana atina fid-dunya hasanatan wa fil-akhirati hasanatan wa qina \'azaban-nar', m: 'Our Lord, give us good in this world and the Hereafter and protect us from the Fire.' }
];

const NAMES_OF_ALLAH = [
  'Ar-Rahman — The Most Merciful',
  'Ar-Rahim — The Most Compassionate',
  'Al-Malik — The King',
  'Al-Quddus — The Most Holy',
  'As-Salam — The Source of Peace',
  'Al-Mu\'min — The Granter of Security',
  'Al-Muhaymin — The Guardian',
  'Al-\'Aziz — The Almighty',
  'Al-Jabbar — The Compeller',
  'Al-Mutakabbir — The Supreme',
  'Al-Khaliq — The Creator',
  'Al-Bari\' — The Evolver',
  'Al-Musawwir — The Fashioner',
  'Al-Ghaffar — The Ever-Forgiving',
  'Al-Qahhar — The Subduer',
  'Al-Wahhab — The Bestower',
  'Ar-Razzaq — The Provider',
  'Al-Fattah — The Opener',
  'Al-\'Alim — The All-Knowing',
  'Al-Qabid — The Withholder',
  'Al-Basit — The Extender',
  'Al-Khafid — The Abaser',
  'Ar-Rafi\' — The Exalter',
  'Al-Mu\'izz — The Honorer',
  'Al-Muzill — The Dishonorer',
  'As-Sami\' — The All-Hearing',
  'Al-Basir — The All-Seeing',
  'Al-Hakam — The Judge',
  'Al-\'Adl — The Just',
  'Al-Latif — The Subtle',
  'Al-Khabir — The All-Aware',
  'Al-Halim — The Forbearing',
  'Al-\'Azim — The Magnificent',
  'Al-Ghafur — The Forgiving',
  'Ash-Shakur — The Appreciative',
  'Al-\'Ali — The Most High',
  'Al-Kabir — The Most Great',
  'Al-Hafiz — The Preserver',
  'Al-Muqit — The Sustainer',
  'Al-Hasib — The Reckoner',
  'Al-Jalil — The Majestic',
  'Al-Karim — The Generous',
  'Ar-Raqib — The Watchful',
  'Al-Mujib — The Responsive',
  'Al-Wasi\' — The All-Encompassing',
  'Al-Hakim — The Wise',
  'Al-Wadud — The Loving',
  'Al-Majid — The Glorious',
  'Al-Ba\'ith — The Resurrector',
  'Ash-Shahid — The Witness',
  'Al-Haqq — The Truth',
  'Al-Wakil — The Trustee',
  'Al-Qawiyy — The All-Strong',
  'Al-Matin — The Firm',
  'Al-Waliyy — The Protecting Friend',
  'Al-Hamid — The Praiseworthy',
  'Al-Muhsi — The Counter',
  'Al-Mubdi\' — The Originator',
  'Al-Mu\'id — The Restorer',
  'Al-Muhyi — The Giver of Life',
  'Al-Mumit — The Taker of Life',
  'Al-Hayy — The Ever-Living',
  'Al-Qayyum — The Self-Subsisting',
  'Al-Wajid — The Finder',
  'Al-Majid — The Noble',
  'Al-Wahid — The One',
  'Al-Ahad — The Unique',
  'As-Samad — The Eternal',
  'Al-Qadir — The Capable',
  'Al-Muqtadir — The Powerful',
  'Al-Muqaddim — The Expediter',
  'Al-Mu\'akhkhir — The Delayer',
  'Al-Awwal — The First',
  'Al-Akhir — The Last',
  'Az-Zahir — The Manifest',
  'Al-Batin — The Hidden',
  'Al-Wali — The Governor',
  'Al-Muta\'ali — The Most Exalted',
  'Al-Barr — The Source of All Good',
  'At-Tawwab — The Ever-Pardoning',
  'Al-Muntaqim — The Avenger',
  'Al-\'Afuww — The Pardoner',
  'Ar-Ra\'uf — The Most Kind',
  'Malik-ul-Mulk — Master of the Kingdom',
  'Zul-Jalali wal-Ikram — Lord of Majesty and Generosity',
  'Al-Muqsit — The Equitable',
  'Al-Jami\' — The Gatherer',
  'Al-Ghaniyy — The Self-Sufficient',
  'Al-Mughni — The Enricher',
  'Al-Mani\' — The Preventer',
  'Ad-Darr — The Distresser',
  'An-Nafi\' — The Benefactor',
  'An-Nur — The Light',
  'Al-Hadi — The Guide',
  'Al-Badi\' — The Incomparable Originator',
  'Al-Baqi — The Everlasting',
  'Al-Warith — The Inheritor',
  'Ar-Rashid — The Guide to the Right Path',
  'As-Sabur — The Most Patient'
];

const ISLAMIC_QUIZ = [
  { q: 'Kitne Rasool (prophets) ka zikr Quran mein naam se aaya hai?', a: '25', o: ['25', '20', '30', '40'] },
  { q: 'Sab se pehla Rasool kaun thay?', a: 'Hazrat Adam (A.S)', o: ['Hazrat Adam (A.S)', 'Hazrat Nuh (A.S)', 'Hazrat Ibrahim (A.S)', 'Hazrat Musa (A.S)'] },
  { q: 'Quran mein kitni Surahs hain?', a: '114', o: ['114', '100', '120', '99'] },
  { q: 'Sab se lambi Surah kaunsi hai?', a: 'Al-Baqarah', o: ['Al-Baqarah', 'Al-Imran', 'An-Nisa', 'Al-Kahf'] },
  { q: 'Qibla ki taraf rukh karna kya kehlata hai?', a: 'Istiqbal-e-Qibla', o: ['Istiqbal-e-Qibla', 'Tawaf', 'Sajdah', 'Ruku'] },
  { q: 'Hajj kis mahine mein hota hai?', a: 'Zil-Hijjah', o: ['Zil-Hijjah', 'Ramadan', 'Muharram', 'Rajab'] },
  { q: 'Ramadan kis Hijri mahine mein hota hai?', a: '9th', o: ['9th', '1st', '12th', '7th'] },
  { q: 'Kitne Arkan-e-Islam hain?', a: '5', o: ['5', '6', '4', '7'] },
  { q: 'Kitne Arkan-e-Iman hain?', a: '6', o: ['6', '5', '7', '4'] },
  { q: 'Quran ka pehla lafz kya hai?', a: 'Iqra', o: ['Iqra', 'Bismillah', 'Alhamdulillah', 'Allah'] },
  { q: 'Hazrat Muhammad (S.A.W) ki wiladat kis shehar mein hui?', a: 'Makkah', o: ['Makkah', 'Madinah', 'Taif', 'Jeddah'] },
  { q: 'Hijrat kis shehar ki taraf hui?', a: 'Madinah', o: ['Madinah', 'Makkah', 'Taif', 'Kufa'] },
  { q: 'Namaz mein kitne Rakat Fard hain (5 waqt)?', a: '17', o: ['17', '12', '15', '20'] },
  { q: 'Zakat ki nisab dar kis cheez par hai?', a: 'Sona/Chandi aur maal', o: ['Sona/Chandi aur maal', 'Sirf naqad', 'Sirf zameen', 'Sirf jaanwar'] },
  { q: 'Sab se pehli masjid kaunsi hai?', a: 'Masjid-e-Quba', o: ['Masjid-e-Quba', 'Masjid-e-Nabawi', 'Masjid-e-Aqsa', 'Masjid-e-Haram'] },
  { q: 'Quran kitne saal mein nazil hua?', a: '23 saal', o: ['23 saal', '10 saal', '40 saal', '13 saal'] },
  { q: 'Kaunsi Surah "Quran ka dil" kehlati hai?', a: 'Yaseen', o: ['Yaseen', 'Al-Fatiha', 'Al-Ikhlas', 'Al-Kahf'] },
  { q: 'Ayat-ul-Kursi kis Surah mein hai?', a: 'Al-Baqarah', o: ['Al-Baqarah', 'Al-Imran', 'An-Nisa', 'Al-Maidah'] },
  { q: 'Jumma ki namaz kis waqt hoti hai?', a: 'Zuhr ke waqt', o: ['Zuhr ke waqt', 'Fajr ke waqt', 'Asr ke waqt', 'Maghrib ke waqt'] },
  { q: 'Roza kis waqt se kis waqt tak hota hai?', a: 'Fajr se Maghrib tak', o: ['Fajr se Maghrib tak', 'Zuhr se Asr tak', 'Isha se Fajr tak', 'Maghrib se Fajr tak'] },
  { q: 'Kitne Sahaba ko "Ashara Mubashara" kaha jata hai?', a: '10', o: ['10', '5', '12', '40'] },
  { q: 'Quran ki sab se choti Surah kaunsi hai?', a: 'Al-Kausar', o: ['Al-Kausar', 'Al-Ikhlas', 'An-Nas', 'Al-Asr'] },
  { q: 'Hazrat Musa (A.S) ka muqabla kis se tha?', a: 'Firaun', o: ['Firaun', 'Namrud', 'Abu Jahl', 'Qarun'] },
  { q: 'Hazrat Ibrahim (A.S) ko kis cheez mein phenka gaya?', a: 'Aag', o: ['Aag', 'Pani', 'Pahar', 'Zameen'] },
  { q: 'Kaunsi Surah "Ummul Quran" kehlati hai?', a: 'Al-Fatiha', o: ['Al-Fatiha', 'Al-Baqarah', 'Yaseen', 'Al-Ikhlas'] }
];

const HAJJ_STEPS = [
  '1. *Ihram* — Ihram ke kapray pehno aur niyat karo (Meeqat par).',
  '2. *Talbiyah* — "Labbayk Allahumma Labbayk" parho.',
  '3. *Tawaf-e-Qudum* — Kaaba ke 7 chakkar (Makkah pohanchne par).',
  '4. *Sa\'i* — Safa aur Marwa ke darmiyan 7 chakkar.',
  '5. *8 Zil-Hijjah (Yawm-e-Tarwiyah)* — Mina jaao aur raat guzaro.',
  '6. *9 Zil-Hijjah (Yawm-e-Arafah)* — Arafat mein waqfa (sab se aham rukn).',
  '7. *Muzdalifah* — Arafat ke baad raat Muzdalifah mein guzaro.',
  '8. *10 Zil-Hijjah (Yawm-e-Nahr)* — Jamarat-e-Aqabah par rami (7 kankariyaan), qurbani, halq/takseer.',
  '9. *Tawaf-e-Ziyarah* — Kaaba ka tawaf (rukn-e-Hajj).',
  '10. *11-13 Zil-Hijjah* — Mina mein teenon Jamarat par rami.',
  '11. *Tawaf-e-Wida* — Rukhsat ka tawaf (wajib).'
];

const SEERAH = [
  '571 CE — Hazrat Muhammad (S.A.W) ki wiladat Makkah mein (12 Rabi-ul-Awwal).',
  '610 CE — Pehli wahi, Ghare Hira mein (Surah Al-Alaq ki pehli 5 ayat).',
  '613 CE — Khuli dawat ka aghaz (Dawat-e-Aam).',
  '615 CE — Pehla Hijrat-e-Habsha.',
  '619 CE — Aam-ul-Huzn (Abu Talib aur Hazrat Khadija R.A ka wisal).',
  '621 CE — Isra aur Mi\'raj.',
  '622 CE — Hijrat-e-Madinah (Hijri calendar ka aghaz).',
  '624 CE — Ghazwa-e-Badr (pehla bara maidan-e-jang).',
  '625 CE — Ghazwa-e-Uhud.',
  '627 CE — Ghazwa-e-Khandaq (Ahzab).',
  '628 CE — Sulah-e-Hudaibiya.',
  '629 CE — Fatah-e-Khyber.',
  '630 CE — Fatah-e-Makkah.',
  '632 CE — Khutba-e-Hajjatul-Wida aur wisal-e-Mubarak (Madinah).'
];

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

const handlers = {};

/* ---- Qibla ------------------------------------------------------- */
handlers.qibla = async (ctx) => {
  const KAABA = { lat: 21.4225, lon: 39.8262 };
  const place = textOf(ctx);
  if (!place) {
    return reply(ctx, box('🕋 QIBLA DIRECTION', [
      'Aap ke shehar ka naam likhein:',
      '',
      `*${ctx.prefix}qibla Lahore*`,
      `*${ctx.prefix}qibla Karachi*`,
      '',
      'Aap ko Qibla ka bearing (angle) bata diya jayega.'
    ]));
  }
  let geo;
  try {
    geo = await getJson(`https://geocode.maps.co/search?q=${encodeURIComponent(place)}`);
    if (!Array.isArray(geo) || !geo.length) throw new Error('not found');
  } catch (e) {
    return reply(ctx, `❌ *${place}* ka location nahi mila. Shehar ka naam dobara check karein.`);
  }
  const { lat, lon, display_name } = geo[0];
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const φ1 = toRad(parseFloat(lat));
  const φ2 = toRad(KAABA.lat);
  const Δλ = toRad(KAABA.lon - parseFloat(lon));
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  let brg = toDeg(Math.atan2(y, x));
  brg = (brg + 360) % 360;
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const compass = dirs[Math.round(brg / 22.5) % 16];
  return reply(ctx, box('🕋 QIBLA DIRECTION', [
    `📍 *Location:* ${String(display_name).split(',').slice(0, 3).join(',')}`,
    `🧭 *Bearing:* ${brg.toFixed(1)}° (${compass})`,
    `🕋 *Kaaba:* ${KAABA.lat}°N, ${KAABA.lon}°E`,
    '',
    `_Compass par ${brg.toFixed(0)}° set karein — Qibla us taraf hoga._`
  ]));
};

/* ---- Tasbeeh ----------------------------------------------------- */
const tasbeehState = new Map();

handlers.tasbeeh = async (ctx) => {
  const key = ctx.m.sender || 'anon';
  const arg = textOf(ctx).toLowerCase();
  let st = tasbeehState.get(key) || { count: 0, target: 33, dhikr: 'SubhanAllah' };

  if (!arg) {
    return reply(ctx, box('📿 TASBEEH COUNTER', [
      `🔢 *Current:* ${st.count} / ${st.target}`,
      `📝 *Dhikr:* ${st.dhikr}`,
      '',
      '*Commands:*',
      `• ${ctx.prefix}tasbeeh count — +1`,
      `• ${ctx.prefix}tasbeeh reset — reset to 0`,
      `• ${ctx.prefix}tasbeeh target 100 — set target`,
      `• ${ctx.prefix}tasbeeh set SubhanAllah — set dhikr`
    ]));
  }

  if (arg === 'count' || arg === '+' || arg === '1') {
    st.count += 1;
    tasbeehState.set(key, st);
    const pct = Math.min(100, Math.round((st.count / st.target) * 100));
    const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
    const done = st.count >= st.target;
    return reply(ctx, box('📿 TASBEEH', [
      `📝 ${st.dhikr}`,
      `${bar} ${pct}%`,
      `🔢 *${st.count}* / ${st.target}`,
      done ? '✅ *Target mukammal! Allah qubool farmaye.*' : '_Aage ginte rahein..._'
    ]));
  }

  if (arg === 'reset' || arg === '0') {
    st.count = 0;
    tasbeehState.set(key, st);
    return reply(ctx, `🔄 Tasbeeh reset ho gayi. *0 / ${st.target}*`);
  }

  const tm = arg.match(/^target\s+(\d+)$/);
  if (tm) {
    st.target = Math.max(1, Math.min(10000, parseInt(tm[1], 10)));
    tasbeehState.set(key, st);
    return reply(ctx, `🎯 Target set: *${st.target}*`);
  }

  const sm = arg.match(/^set\s+(.+)$/);
  if (sm) {
    st.dhikr = sm[1].slice(0, 80);
    tasbeehState.set(key, st);
    return reply(ctx, `📝 Dhikr set: *${st.dhikr}*`);
  }

  return reply(ctx, `❓ Samajh nahi aaya. ${ctx.prefix}tasbeeh likh kar options dekhein.`);
};

/* ---- Hijri date -------------------------------------------------- */
handlers.hijri = async (ctx) => {
  const now = new Date();
  let h;
  try {
    h = await getJson(`https://api.aladhan.com/v1/gToH/${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()}`);
    const d = h.data.hijri;
    const g = h.data.gregorian;
    return reply(ctx, box('🌙 HIJRI DATE', [
      `📅 *Hijri:* ${d.day} ${d.month.en} ${d.year} AH`,
      `🌍 *Gregorian:* ${g.day} ${g.month.en} ${g.year}`,
      `🗓️ *Day:* ${d.weekday.en}`,
      `🌙 *Month (Urdu):* ${d.month.ar}`,
      '',
      `_${d.designation ? d.designation.expanded : ''}_`
    ]));
  } catch (e) {
    // offline approximation
    const jd = Math.floor(now.getTime() / 86400000) + 2440588;
    const islamic = Math.floor((jd - 1948440 + 10632) / 10631);
    return reply(ctx, `🌙 *Hijri Year (approx):* ${islamic} AH\n_(Online API unavailable — approximate value)_`);
  }
};

/* ---- Duas -------------------------------------------------------- */
handlers.duas = async (ctx) => {
  const q = textOf(ctx).toLowerCase();
  if (!q) {
    const list = DUAS.map((d, i) => `${i + 1}. ${d.t}`).join('\n');
    return reply(ctx, box('🤲 DUAS (25)', [
      list,
      '',
      `*${ctx.prefix}duas <number or keyword>*`,
      `e.g. ${ctx.prefix}duas 3`,
      `e.g. ${ctx.prefix}duas sleep`
    ]));
  }
  const num = parseInt(q, 10);
  if (!isNaN(num) && num >= 1 && num <= DUAS.length) {
    const d = DUAS[num - 1];
    return reply(ctx, box(`🤲 ${d.t.toUpperCase()}`, [
      `🕌 *Arabic:*`,
      d.a,
      '',
      `📖 *Meaning:*`,
      d.m
    ]));
  }
  const found = DUAS.filter((d) => d.t.toLowerCase().includes(q) || d.m.toLowerCase().includes(q) || d.a.toLowerCase().includes(q));
  if (!found.length) return reply(ctx, `❌ "${q}" se koi dua nahi mili. ${ctx.prefix}duas se list dekhein.`);
  const d = found[0];
  return reply(ctx, box(`🤲 ${d.t.toUpperCase()}`, [`🕌 *Arabic:*`, d.a, '', `📖 *Meaning:*`, d.m]));
};

/* ---- Names of Allah ---------------------------------------------- */
handlers.namesofallah = async (ctx) => {
  const q = textOf(ctx);
  if (!q) {
    const half = Math.ceil(NAMES_OF_ALLAH.length / 2);
    return reply(ctx, box('☪️ 99 NAMES OF ALLAH', [
      '*(Part 1)*',
      NAMES_OF_ALLAH.slice(0, half).map((n, i) => `${i + 1}. ${n}`).join('\n'),
      '',
      '*(Part 2)*',
      NAMES_OF_ALLAH.slice(half).map((n, i) => `${half + i + 1}. ${n}`).join('\n')
    ]));
  }
  const num = parseInt(q, 10);
  if (!isNaN(num) && num >= 1 && num <= NAMES_OF_ALLAH.length) {
    return reply(ctx, box(`☪️ NAME #${num}`, [NAMES_OF_ALLAH[num - 1]]));
  }
  const found = NAMES_OF_ALLAH.filter((n) => n.toLowerCase().includes(q.toLowerCase()));
  if (!found.length) return reply(ctx, `❌ "${q}" nahi mila.`);
  return reply(ctx, box('☪️ NAMES OF ALLAH', found.slice(0, 10)));
};

/* ---- Zakat ------------------------------------------------------- */
handlers.zakat = async (ctx) => {
  const raw = textOf(ctx).replace(/,/g, '');
  const amt = parseFloat(raw);
  if (!raw || isNaN(amt) || amt <= 0) {
    return reply(ctx, box('💰 ZAKAT CALCULATOR', [
      'Apna total zakat-able maal (PKR) likhein:',
      '',
      `*${ctx.prefix}zakat 500000*`,
      '',
      '_Zakat = 2.5% of savings held for one lunar year (nisab: 87.48g gold or 612.36g silver)._'
    ]));
  }
  const zakat = amt * 0.025;
  // nisab using approximate gold price
  let nisabNote = '';
  try {
    const g = await getJson('https://data-asg.goldprice.org/dbXRates/USD');
    const usdPerOz = g.items[0].xauPrice;
    const usdPerGram = usdPerOz / 31.1035;
    const pkr = await getJson('https://open.er-api.com/v6/latest/USD');
    const rate = pkr.rates.PKR;
    const nisabPKR = 87.48 * usdPerGram * rate;
    nisabNote = `\n📊 *Nisab (gold 87.48g):* ~PKR ${Math.round(nisabPKR).toLocaleString()}\n${amt >= nisabPKR ? '✅ Aap nisab par hain — zakat wajib hai.' : '⚠️ Aap nisab se kam par hain — zakat wajib nahi.'}`;
  } catch (e) { /* ignore */ }

  return reply(ctx, box('💰 ZAKAT CALCULATION', [
    `💵 *Total wealth:* PKR ${amt.toLocaleString()}`,
    `📈 *Rate:* 2.5%`,
    `🕌 *Zakat due:* *PKR ${zakat.toLocaleString(undefined, { maximumFractionDigits: 2 })}*`,
    nisabNote,
    '',
    '_Note: yeh sirf savings par hai. Alag alag assets (gold, business stock) ke liye mashwara lein._'
  ]));
};

/* ---- Tafsir ------------------------------------------------------ */
handlers.tafsir = async (ctx) => {
  const q = textOf(ctx).replace(/\s+/g, ' ').trim();
  if (!q) {
    return reply(ctx, box('📖 TAFSIR', [
      'Surah aur ayat number likhein:',
      '',
      `*${ctx.prefix}tafsir 2:255*`,
      `*${ctx.prefix}tafsir 1:1*`,
      `*${ctx.prefix}tafsir 112*`,
      '',
      '_Aap ko Arabic, tarjuma aur mukhtasar tafsir milegi._'
    ]));
  }
  const m = q.match(/^(\d{1,3})(?::(\d{1,3}))?$/);
  if (!m) return reply(ctx, `❌ Format: *${ctx.prefix}tafsir <surah>:<ayah>*  e.g. 2:255`);
  const surah = parseInt(m[1], 10);
  const ayah = m[2] ? parseInt(m[2], 10) : 1;
  try {
    const [ar, en] = await Promise.all([
      getJson(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/quran-uthmani`),
      getJson(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/en.sahih`)
    ]);
    const a = ar.data;
    const e = en.data;
    let out = box(`📖 SURAH ${a.surah.englishName.toUpperCase()} ${surah}:${ayah}`, [
      `🕌 *Arabic:*`,
      a.text,
      '',
      `📘 *Translation (Sahih Intl.):*`,
      e.text,
      '',
      `📚 *Surah:* ${a.surah.name} (${a.surah.englishName})`,
      `🔢 *Ayah:* ${a.numberInSurah} of ${a.surah.numberOfAyahs}`,
      `📗 *Revelation:* ${a.surah.revelationType}`
    ]);
    await reply(ctx, out);
    // optional AI tafsir
    const t = await ai(ctx, `Give a short, balanced tafsir (3-5 sentences) of Quran ${surah}:${ayah}. Arabic: "${a.text}". Translation: "${e.text}". Mention context and practical lesson. Be respectful and scholarly.`, 'You are an Islamic studies scholar writing concise tafsir.');
    if (t) await reply(ctx, `🧠 *Mukhtasar Tafsir:*\n\n${t}`);
  } catch (err) {
    return reply(ctx, `❌ Ayah ${surah}:${ayah} nahi mili. Surah 1-114 aur sahi ayah number dein.`);
  }
};

/* ---- Seerah ------------------------------------------------------ */
handlers.seerah = async (ctx) => {
  const q = textOf(ctx).toLowerCase();
  if (q) {
    const hits = SEERAH.filter((s) => s.toLowerCase().includes(q));
    if (hits.length) return reply(ctx, box('🕌 SEERAH — MATCHES', hits));
  }
  return reply(ctx, box('🕌 SEERAH TIMELINE', SEERAH.concat(['', `_${ctx.prefix}seerah <year or keyword>_`])));
};

/* ---- Islamic quiz ------------------------------------------------ */
const quizState = new Map();

handlers.islamicquiz = async (ctx) => {
  const arg = textOf(ctx).toLowerCase();
  const key = ctx.m.chat || ctx.m.sender || 'anon';
  const st = quizState.get(key);

  if (st && arg) {
    const letter = arg.trim().toUpperCase();
    const idx = ['A', 'B', 'C', 'D'].indexOf(letter);
    if (idx === -1) return reply(ctx, '❓ A, B, C ya D mein se jawab dein.');
    quizState.delete(key);
    const correct = st.q.a;
    const chosen = st.q.o[idx];
    if (chosen === correct) {
      return reply(ctx, `✅ *Bilkul sahi!* Jawab: *${correct}*\n\n🎉 Aap jeet gaye!`);
    }
    return reply(ctx, `❌ *Ghalat.* Aap ne *${chosen}* chuna.\n✅ Sahi jawab: *${correct}*`);
  }

  const q = pick(ISLAMIC_QUIZ);
  const shuffled = q.o.slice().sort(() => Math.random() - 0.5);
  quizState.set(key, { q: { ...q, o: shuffled }, at: Date.now() });
  setTimeout(() => quizState.delete(key), 120000);
  const opts = shuffled.map((o, i) => `${'ABCD'[i]}. ${o}`).join('\n');
  return reply(ctx, box('🕌 ISLAMIC QUIZ', [
    `❓ ${q.q}`,
    '',
    opts,
    '',
    `_${ctx.prefix}islamicquiz A  (jawab dene ke liye)_`
  ]));
};

/* ---- Hajj guide -------------------------------------------------- */
handlers.hajjguide = async (ctx) => {
  const q = textOf(ctx).toLowerCase();
  if (q) {
    const hits = HAJJ_STEPS.filter((s) => s.toLowerCase().includes(q));
    if (hits.length) return reply(ctx, box('🕋 HAJJ GUIDE — MATCHES', hits));
  }
  return reply(ctx, box('🕋 HAJJ GUIDE — STEP BY STEP', HAJJ_STEPS.concat([
    '',
    '📌 *Arkan-e-Hajj (Fard):* Ihram, Waqfa-e-Arafah, Tawaf-e-Ziyarah.',
    '📌 *Wajibat:* Sa\'i, Rami, Qurbani, Halq, Tawaf-e-Wida.',
    `\n_${ctx.prefix}hajjguide <keyword>_`
  ])));
};

module.exports = { handlers, DUAS, NAMES_OF_ALLAH, ISLAMIC_QUIZ, HAJJ_STEPS, SEERAH };
