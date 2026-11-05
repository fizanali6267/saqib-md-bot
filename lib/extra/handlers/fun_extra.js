'use strict';
/**
 * Extra fun handlers (11 commands).
 * pickup, fortune, insult, compliment, coffeefact, catfact, dogfact,
 * bored, advice, dadjoke, memeidea
 */
const U = require('../util');

const { textOf, reply, ai, box, getJson, pick, randInt } = U;

const handlers = {};

/* ---- Pickup lines ----------------------------------------------- */
const PICKUP = [
  'Kya aapke paas map hai? Mujhe aap mein kho gaya hoon. 🗺️',
  'Aap WiFi jaisi hain — bina aap ke connection nahi aata. 📶',
  'Aap science hain, main religion — hum saath mein complete hain. 🧪',
  'Aapki smile Bitcoin se bhi zyada valuable hai. 💎',
  'Agar aap ek bug hoti, to main kabhi fix nahi karta. 🐛',
  'Aap meri notification list ki sab se achi entry hain. 🔔',
  'Aap chaand hain — door magar sab ko apni taraf kheenchte hain. 🌙',
  'Mera phone 1% par hai, magar aapka message 100%. 🔋',
  'Aapki awaaz sun kar lagta hai playlist ka best gaana chal raha hai. 🎵',
  'Kya aap delivery hain? Kyunki mera dil aap ke paas hai. 📦',
  'Aap itni special hain ke Google bhi aap ko search nahi kar sakta. 🔍',
  'Meri duaon mein aap ka naam aata hai — aur main namaz mein distract ho jata hoon. 🤲'
];

handlers.pickup = async (ctx) => {
  const q = textOf(ctx);
  if (q) {
    const t = await ai(ctx, `Write 5 fresh, clean, witty pickup lines related to "${q}". Keep them respectful and funny, not creepy. Number them.`, 'You are a witty but respectful copywriter.');
    return reply(ctx, `💘 *PICKUP LINES*\n\n${t || pick(PICKUP)}`);
  }
  return reply(ctx, `💘 *PICKUP LINE*\n\n${pick(PICKUP)}\n\n_${ctx.prefix}pickup <topic> for more_`);
};

/* ---- Fortune cookie -------------------------------------------- */
const FORTUNES = [
  'Aaj ka din aap ke liye naye darwaze khol dega. 🚪',
  'Jo aap dhoond rahe hain, woh aap ko dhoond raha hai. 🔍',
  'Sabr ka phal meetha hota hai — thora aur intezar karein. 🍯',
  'Aap ki mehnat jald rang layegi. 🌱',
  'Ek purana dost achanak yaad karega. 📞',
  'Bara faisla lene se pehle do raat sochain. 🌙',
  'Paisa aayega — magar kharch bhi. Budget banayein. 💰',
  'Aap ki sehat aap ki sab se bari daulat hai. 💪',
  'Kisi ko maaf karna aap ko halka kar dega. 🕊️',
  'Aaj koi choti khushi aap ka din bana degi. ✨',
  'Jo cheez aap kho chuke hain, woh behtar shakal mein wapas aayegi. 🔄',
  'Aap ki zaban ki narmi aap ke liye darwaze khol degi. 🗝️',
  'Naya hunar seekhne ka behtareen waqt abhi hai. 📚',
  'Safar lamba hai magar manzil aap ki hai. 🛤️',
  'Aap ke andar ki himmat aap ke darr se bari hai. 🦁'
];

handlers.fortune = async (ctx) => {
  const lucky = randInt(1, 99);
  return reply(ctx, box('🥠 FORTUNE COOKIE', [
    `🔮 ${pick(FORTUNES)}`,
    '',
    `🍀 *Lucky number:* ${lucky}`,
    `🎨 *Lucky colour:* ${pick(['Red', 'Green', 'Blue', 'Gold', 'White', 'Purple'])}`,
    `⏰ *Best hour:* ${randInt(6, 22)}:00`
  ]));
};

/* ---- Insult (playful, clean) ----------------------------------- */
const INSULTS = [
  'Aap ki logic dekh kar calculator bhi confuse ho jata hai. 🧮',
  'Aap WiFi ki tarah hain — signal kam, drama zyada. 📶',
  'Aap ka GPS bhi kehta hai: "recalculating... recalculating..." 🗺️',
  'Aap ki speed dekh kar snail ne bhi record tor diya. 🐌',
  'Aap itne slow hain ke buffering bhi aap se seekhti hai. ⏳',
  'Aap ki battery 1% par hai — aur woh bhi fake hai. 🔋',
  'Aap ka humour "404 Not Found" hai. 🚫',
  'Aap ka fashion sense Windows 95 se inspire hai. 💾',
  'Aap ki planning itni solid hai ke woh kabhi start nahi hoti. 📋',
  'Aap "multitasking" kehte hain, main "sab adhoora" kehta hoon. 🎯'
];

handlers.insult = async (ctx) => {
  const t = textOf(ctx);
  const target = t || 'aap';
  return reply(ctx, `😏 *PLAYFUL ROAST*\n\n${target}, ${pick(INSULTS)}\n\n_💚 Sirf mazaak — dil par mat lein!_`);
};

/* ---- Compliment ------------------------------------------------- */
const COMPLIMENTS = [
  'Aap ki presence kamre ki roshni badha deti hai. ✨',
  'Aap sunte hain — aur yeh aaj kal bohat rare hai. 👂',
  'Aap ka confidence quietly powerful hai. 💪',
  'Aap logon ko comfortable feel karate hain. 🤗',
  'Aap ki mehnat aap ki sab se bari pehchaan hai. 🏆',
  'Aap ka dil bara hai — aur woh sab se achi quality hai. ❤️',
  'Aap baat karte waqt sach bolte hain, yeh badi baat hai. 🗣️',
  'Aap ki hasi contagious hai. 😄',
  'Aap detail notice karte hain — yeh ek superpower hai. 🔍',
  'Aap mushkil waqt mein bhi poore rehte hain. 🧭'
];

handlers.compliment = async (ctx) => {
  const t = textOf(ctx);
  return reply(ctx, `💐 *COMPLIMENT*\n\n${t ? `${t}, ` : ''}${pick(COMPLIMENTS)}`);
};

/* ---- Coffee fact ----------------------------------------------- */
const COFFEE_FACTS = [
  'Coffee duniya ki sab se zyada trade hone wali commodity hai (oil ke baad). ☕',
  'Espresso mein filter coffee se kam caffeine hota hai per cup — kyunki cup chota hota hai. ⚡',
  'Coffee plant ki 2 main varieties hain: Arabica (60%) aur Robusta. 🌱',
  'Brazil duniya ka sab se bara coffee producer hai — 150+ saal se. 🇧🇷',
  'Coffee beans asal mein seeds hain, berries ke andar. 🍒',
  'Caffeine ka half-life ~5 ghante hai — dopahar 3 baje ki coffee raat 1 baje tak rehti hai. ⏰',
  'Finland mein per capita coffee consumption sab se zyada hai. 🇫🇮',
  'Coffee ki khushbu 800+ aromatic compounds se banti hai. 👃',
  'Decaf coffee se caffeine 97% tak nikal diya jata hai. 🚫',
  'Coffee 9th century Ethiopia mein discover hui thi (kissa Kaldi the goat herder). 🐐'
];

handlers.coffeefact = async (ctx) => {
  return reply(ctx, `☕ *COFFEE FACT*\n\n${pick(COFFEE_FACTS)}`);
};

/* ---- Cat fact --------------------------------------------------- */
handlers.catfact = async (ctx) => {
  try {
    const d = await getJson('https://catfact.ninja/fact');
    return reply(ctx, `🐱 *CAT FACT*\n\n${d.fact}\n\n_📏 Length: ${d.length} chars_`);
  } catch (e) {
    return reply(ctx, `🐱 *CAT FACT*\n\nBilli apni zindagi ka 70% hissa sote hue guzarti hai. 😴`);
  }
};

/* ---- Dog fact --------------------------------------------------- */
handlers.dogfact = async (ctx) => {
  try {
    const d = await getJson('https://dogapi.dog/api/v2/facts');
    const fact = d.data && d.data[0] ? d.data[0].attributes.body : null;
    if (!fact) throw new Error('empty');
    return reply(ctx, `🐶 *DOG FACT*\n\n${fact}`);
  } catch (e) {
    return reply(ctx, `🐶 *DOG FACT*\n\nKutton ki sunghne ki power insaan se 10,000 guna zyada hoti hai. 👃`);
  }
};

/* ---- Bored ------------------------------------------------------ */
handlers.bored = async (ctx) => {
  try {
    const d = await getJson('https://bored-api.appbrewery.com/random');
    return reply(ctx, box('😐 BORED? TRY THIS', [
      `🎯 *Activity:* ${d.activity}`,
      `📂 *Type:* ${d.type}`,
      `👥 *Participants:* ${d.participants}`,
      `💵 *Price:* ${d.price === 0 ? 'Free' : d.price}`,
      `🔗 *Link:* ${d.link || '—'}`
    ]));
  } catch (e) {
    const ideas = ['10 minute walk par jayein 🚶', 'Ek naya gaana sunein 🎵', 'Kisi purane dost ko message karein 📱', '5 minute meditation karein 🧘', 'Ek nayi recipe try karein 🍳', 'Apni almari sort karein 👕', 'Ek page kitab parhein 📖', 'Paani piyein aur stretch karein 💧'];
    return reply(ctx, `😐 *BORED? TRY THIS*\n\n• ${pick(ideas)}`);
  }
};

/* ---- Advice ----------------------------------------------------- */
handlers.advice = async (ctx) => {
  try {
    const d = await getJson('https://api.adviceslip.com/advice');
    return reply(ctx, `💡 *ADVICE*\n\n${d.slip.advice}\n\n_#${d.slip.id}_`);
  } catch (e) {
    const t = await ai(ctx, 'Give one short, genuinely useful piece of life advice in one or two sentences.', 'You are a wise mentor.');
    return reply(ctx, `💡 *ADVICE*\n\n${t || 'Aaj kisi ki madad karein — woh sab se achi advice hai.'}`);
  }
};

/* ---- Dad joke --------------------------------------------------- */
handlers.dadjoke = async (ctx) => {
  try {
    const d = await getJson('https://icanhazdadjoke.com/', { headers: { Accept: 'application/json', 'User-Agent': 'SAQIB-MD-Bot' } });
    return reply(ctx, `👨 *DAD JOKE*\n\n${d.joke}\n\n_😐 ...get it?_`);
  } catch (e) {
    const jokes = [
      'Why don\'t scientists trust atoms? Because they make up everything. ⚛️',
      'I told my wife she was drawing her eyebrows too high. She looked surprised. 🤨',
      'Why did the scarecrow win an award? He was outstanding in his field. 🌾',
      'I\'m reading a book about anti-gravity. It\'s impossible to put down. 📘',
      'Why don\'t eggs tell jokes? They\'d crack each other up. 🥚'
    ];
    return reply(ctx, `👨 *DAD JOKE*\n\n${pick(jokes)}`);
  }
};

/* ---- Meme idea -------------------------------------------------- */
handlers.memeidea = async (ctx) => {
  const q = textOf(ctx);
  const t = await ai(ctx, `Give 8 funny meme ideas${q ? ` about "${q}"` : ''}. For each: a caption/top text + bottom text and the type of image it would use. Keep them clean and relatable. Number them.`, 'You are a meme creator.');
  return reply(ctx, `😂 *MEME IDEAS*\n\n${t || 'Nahi bana sake.'}`);
};

module.exports = { handlers, PICKUP, FORTUNES, COMPLIMENTS, INSULTS, COFFEE_FACTS };
