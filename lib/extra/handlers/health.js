'use strict';
/**
 * Health & fitness handlers (20 commands).
 * bmi, caloriecalc, waterintake, workout, dietplan, heartrate, sleeptimer,
 * firstaid, meditate, symptom, macrocalc, stepstracker, fasting, bodyfat,
 * one-rm, stretching, posture, caffeine, addiction, mentalhealth
 */
const U = require('../util');

const { textOf, need, reply, ai, box, pick, randInt } = U;

const handlers = {};

const steps = new Map();   // sender -> { date, count }
const fasting = new Map(); // sender -> { start, target }

function num(s) {
  const n = parseFloat(String(s).replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

/* ---- BMI --------------------------------------------------------- */
handlers.bmi = async (ctx) => {
  const q = textOf(ctx).replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  if (q.length < 2) {
    return reply(ctx, box('⚖️ BMI CALCULATOR', [
      'Weight (kg) aur height (cm) dein:',
      '',
      `*${ctx.prefix}bmi 70 175*`,
      '',
      '_BMI = weight(kg) / height(m)²_'
    ]));
  }
  const w = num(q[0]), h = num(q[1]);
  if (!w || !h || w <= 0 || h <= 0) return reply(ctx, `❌ Sahi numbers dein: ${ctx.prefix}bmi 70 175`);
  const m = h / 100;
  const bmi = w / (m * m);
  let cat, emoji;
  if (bmi < 18.5) { cat = 'Underweight'; emoji = '🔵'; }
  else if (bmi < 25) { cat = 'Normal weight'; emoji = '🟢'; }
  else if (bmi < 30) { cat = 'Overweight'; emoji = '🟡'; }
  else if (bmi < 35) { cat = 'Obese Class I'; emoji = '🟠'; }
  else if (bmi < 40) { cat = 'Obese Class II'; emoji = '🔴'; }
  else { cat = 'Obese Class III'; emoji = '⚫'; }
  const idealMin = 18.5 * m * m;
  const idealMax = 24.9 * m * m;
  return reply(ctx, box('⚖️ BMI RESULT', [
    `📏 *Height:* ${h} cm`,
    `⚖️ *Weight:* ${w} kg`,
    `📊 *BMI:* *${bmi.toFixed(1)}*`,
    `${emoji} *Category:* ${cat}`,
    '',
    `🎯 *Ideal weight range:* ${idealMin.toFixed(1)} – ${idealMax.toFixed(1)} kg`,
    `📉 *To reach normal:* ${w > idealMax ? `lose ${(w - idealMax).toFixed(1)} kg` : w < idealMin ? `gain ${(idealMin - w).toFixed(1)} kg` : 'already in range ✅'}`,
    '',
    `_BMI muscle mass ko consider nahi karta. Doctor se mashwara lein._`
  ]));
};

/* ---- Calorie calculator ------------------------------------------ */
handlers.caloriecalc = async (ctx) => {
  // .caloriecalc 70 175 25 male 1.55
  const q = textOf(ctx).replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  if (q.length < 4) {
    return reply(ctx, box('🔥 CALORIE CALCULATOR', [
      'Format: `<weight kg> <height cm> <age> <male|female> [activity]`',
      '',
      `*${ctx.prefix}caloriecalc 70 175 25 male 1.55*`,
      '',
      '*Activity levels:*',
      '• 1.2 — sedentary',
      '• 1.375 — light exercise',
      '• 1.55 — moderate',
      '• 1.725 — very active',
      '• 1.9 — athlete'
    ]));
  }
  const w = num(q[0]), h = num(q[1]), age = num(q[2]);
  const sex = (q[3] || '').toLowerCase();
  const act = num(q[4]) || 1.375;
  if (!w || !h || !age || !['male', 'female', 'm', 'f'].includes(sex)) return reply(ctx, `❌ Format ghalat hai. ${ctx.prefix}caloriecalc 70 175 25 male 1.55`);
  const isMale = sex.startsWith('m');
  const bmr = isMale ? 10 * w + 6.25 * h - 5 * age + 5 : 10 * w + 6.25 * h - 5 * age - 161;
  const tdee = bmr * act;
  return reply(ctx, box('🔥 CALORIE NEEDS', [
    `👤 *Profile:* ${isMale ? 'Male' : 'Female'}, ${age}y, ${w}kg, ${h}cm`,
    `🏃 *Activity:* ×${act}`,
    '',
    `⚡ *BMR:* ${Math.round(bmr)} kcal/day`,
    `🔥 *TDEE (maintain):* *${Math.round(tdee)} kcal/day*`,
    '',
    `📉 *Lose 0.5 kg/week:* ${Math.round(tdee - 550)} kcal`,
    `📉 *Lose 0.25 kg/week:* ${Math.round(tdee - 275)} kcal`,
    `📈 *Gain 0.5 kg/week:* ${Math.round(tdee + 550)} kcal`,
    '',
    `_Mifflin-St Jeor equation._`
  ]));
};

/* ---- Water intake ------------------------------------------------ */
handlers.waterintake = async (ctx) => {
  const q = textOf(ctx).replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  const w = num(q[0]);
  if (!w) return reply(ctx, `💧 *Usage:* ${ctx.prefix}waterintake 70\n(weight in kg)`);
  const base = w * 35; // ml
  const act = num(q[1]) || 0; // minutes exercise
  const total = base + act * 12;
  const glasses = Math.round(total / 250);
  return reply(ctx, box('💧 WATER INTAKE', [
    `⚖️ *Weight:* ${w} kg`,
    `🏃 *Exercise:* ${act} min`,
    '',
    `💧 *Daily target:* *${(total / 1000).toFixed(2)} L*`,
    `🥛 *Glasses (250ml):* ${glasses}`,
    `⏰ *Per waking hour:* ~${(total / 16 / 250).toFixed(1)} glasses`,
    '',
    `_Thirst, urine colour aur weather ke hisaab se adjust karein._`
  ]));
};

/* ---- Workout plan ------------------------------------------------ */
handlers.workout = async (ctx) => {
  const q = textOf(ctx);
  const goal = q || 'general fitness';
  const t = await ai(ctx, `Create a 7-day workout plan for goal: "${goal}". For each day give 4-6 exercises with sets×reps (or duration), plus warm-up and cool-down. Include 1-2 rest days. Keep it compact and practical for a home/gym setting. Use emojis. Max 300 words.`, 'You are a certified personal trainer.');
  return reply(ctx, t || `🏋️ *WORKOUT*\n\n${ctx.prefix}workout <goal>  e.g. weight loss, muscle gain, strength`);
};

/* ---- Diet plan -------------------------------------------------- */
handlers.dietplan = async (ctx) => {
  const q = textOf(ctx) || 'balanced 2000 kcal';
  const t = await ai(ctx, `Create a 1-day meal plan for: "${q}". Include breakfast, mid-morning snack, lunch, evening snack, dinner with approximate calories per meal and a total. Add 3 practical tips. Mention it's general guidance, not medical advice. Max 280 words. Use emojis.`, 'You are a registered dietitian.');
  return reply(ctx, t || `🥗 *DIET PLAN*\n\n${ctx.prefix}dietplan <goal/calories>`);
};

/* ---- Heart rate zones -------------------------------------------- */
handlers.heartrate = async (ctx) => {
  const age = num(textOf(ctx));
  if (!age || age < 5 || age > 110) return reply(ctx, `❤️ *Usage:* ${ctx.prefix}heartrate 25\n(age in years)`);
  const max = 220 - age;
  const zones = [
    ['Zone 1 — Recovery', 0.5, 0.6, 'Very light, fat burn warm-up'],
    ['Zone 2 — Endurance', 0.6, 0.7, 'Easy pace, aerobic base'],
    ['Zone 3 — Aerobic', 0.7, 0.8, 'Moderate, improves cardio'],
    ['Zone 4 — Threshold', 0.8, 0.9, 'Hard, lactate threshold'],
    ['Zone 5 — Maximum', 0.9, 1.0, 'Sprint / VO2 max']
  ];
  return reply(ctx, box('❤️ HEART RATE ZONES', [
    `👤 *Age:* ${age}`,
    `💓 *Max HR:* *${max} bpm*`,
    `😴 *Resting (typical):* ${Math.round(60 + age * 0.3)} bpm`,
    '',
    ...zones.map(([n, lo, hi, d]) => `*${n}*\n   ${Math.round(max * lo)}–${Math.round(max * hi)} bpm — ${d}`)
  ]));
};

/* ---- Sleep timer ------------------------------------------------- */
handlers.sleeptimer = async (ctx) => {
  const q = textOf(ctx).toLowerCase();
  if (q === 'now' || !q) {
    const now = new Date();
    const cycles = [3, 4, 5, 6];
    const lines = cycles.map((c) => {
      const wake = new Date(now.getTime() + (c * 90 + 15) * 60000);
      return `😴 ${c} cycles (${(c * 1.5).toFixed(1)}h) → wake at *${wake.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}*`;
    });
    return reply(ctx, box('😴 SLEEP TIMER', [
      `🕐 *Sleeping now:* ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
      '',
      ...lines,
      '',
      `_90-min cycles + 15 min to fall asleep._`,
      `_Ya: ${ctx.prefix}sleeptimer 07:00 (wake time)_`
    ]));
  }
  const m = q.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return reply(ctx, `😴 *Usage:*\n${ctx.prefix}sleeptimer now\n${ctx.prefix}sleeptimer 07:00`);
  const wake = new Date();
  wake.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
  if (wake < new Date()) wake.setDate(wake.getDate() + 1);
  const lines = [6, 5, 4, 3].map((c) => {
    const bed = new Date(wake.getTime() - (c * 90 + 15) * 60000);
    return `🛏️ ${c} cycles → sleep at *${bed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}*`;
  });
  return reply(ctx, box('😴 SLEEP TIMER', [
    `⏰ *Wake up at:* ${wake.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
    '',
    ...lines,
    '',
    `_Best: 5-6 cycles (7.5–9 hours)._`
  ]));
};

/* ---- First aid --------------------------------------------------- */
const FIRSTAID = {
  burn: ['Cool under running water 20 min (not ice)', 'Remove tight items/jewellery', 'Cover with clean non-stick dressing', 'Do NOT pop blisters', 'Seek help if larger than palm or on face/hands'],
  bleeding: ['Apply firm direct pressure with clean cloth', 'Elevate the limb above heart', 'Do not remove soaked cloth — add more on top', 'Keep pressure 10-15 min', 'Call emergency if bleeding doesn\'t stop'],
  choking: ['Encourage coughing if they can', '5 back blows between shoulder blades', '5 abdominal thrusts (Heimlich)', 'Alternate until object clears', 'Call emergency if unconscious'],
  cpr: ['Check responsiveness & breathing', 'Call emergency immediately', '30 chest compressions (100-120/min, 5-6cm deep)', '2 rescue breaths', 'Repeat 30:2 until help arrives'],
  fracture: ['Immobilise the limb, do not realign', 'Apply ice pack wrapped in cloth', 'Support with splint/sling', 'Check circulation beyond injury', 'Get X-ray urgently'],
  fainting: ['Lay flat, raise legs 30cm', 'Loosen tight clothing', 'Ensure fresh air', 'Turn on side if vomiting', 'Call help if not waking in 1 min'],
  seizure: ['Clear the area of hard objects', 'Cushion the head', 'Do NOT restrain or put anything in mouth', 'Time the seizure', 'Call emergency if >5 min'],
  nosebleed: ['Sit upright, lean slightly forward', 'Pinch soft part of nose 10 min', 'Breathe through mouth', 'Apply cold pack to bridge', 'Seek help if >20 min'],
  heatstroke: ['Move to shade/cool area', 'Remove excess clothing', 'Cool with water/fan/ice packs', 'Give water if conscious', 'Call emergency — this is life-threatening'],
  poisoning: ['Do NOT induce vomiting', 'Note the substance and amount', 'Call poison control/emergency', 'Keep the container', 'If unconscious, recovery position']
};

handlers.firstaid = async (ctx) => {
  const q = textOf(ctx).toLowerCase().trim();
  if (!q) {
    return reply(ctx, box('🚑 FIRST AID', [
      'Available topics:',
      ...Object.keys(FIRSTAID).map((k) => `• ${ctx.prefix}firstaid ${k}`),
      '',
      '_⚠️ Yeh general guidance hai. Emergency mein foran 1122 (Pakistan) / 911 (US) / 999 (UK) call karein._'
    ]));
  }
  const key = Object.keys(FIRSTAID).find((k) => k.includes(q) || q.includes(k));
  if (!key) return reply(ctx, `❌ "${q}" nahi mila. ${ctx.prefix}firstaid se list dekhein.`);
  return reply(ctx, box(`🚑 FIRST AID — ${key.toUpperCase()}`, [
    ...FIRSTAID[key].map((s, i) => `${i + 1}. ${s}`),
    '',
    '⚠️ *Emergency:* 1122 (Rescue PK) | 115 (Edhi) | 112 (Police)'
  ]));
};

/* ---- Meditation ------------------------------------------------- */
handlers.meditate = async (ctx) => {
  const mins = num(textOf(ctx)) || 5;
  const t = Math.max(1, Math.min(60, mins));
  const script = [
    `🧘 *${t}-MINUTE MEDITATION*`,
    '',
    '1️⃣ *Sit comfortably.* Spine straight, hands on knees, eyes softly closed.',
    '2️⃣ *Breathe in for 4 counts,* hold 2, out for 6.',
    '3️⃣ *Focus on the breath.* When the mind wanders, gently return.',
    `4️⃣ *Continue for ${t} minutes.* Set a timer.`,
    '5️⃣ *End slowly.* Open eyes, stretch, notice how you feel.',
    '',
    '💡 *Tip:* Same time daily builds the habit. Start with 3 minutes if 5 feels long.',
    '',
    `_⏱️ Timer: ${t}:00_`
  ];
  return reply(ctx, script.join('\n'));
};

/* ---- Symptom checker --------------------------------------------- */
handlers.symptom = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🩺 *Usage:* ${ctx.prefix}symptom headache and fever for 2 days`);
  const t = await ai(ctx, `User reports symptoms: "${q}". Provide: 1) possible common causes (3-5, non-alarming), 2) self-care steps, 3) RED FLAGS that require urgent medical care, 4) which doctor/specialist to see. Be clear that this is NOT a diagnosis. Keep under 250 words with bullets.`, 'You are a cautious medical information assistant. Never diagnose. Always recommend seeing a doctor.');
  return reply(ctx, `🩺 *SYMPTOM GUIDE*\n\n${t || 'Doctor se mashwara karein.'}\n\n⚠️ _Yeh medical advice nahi hai._`);
};

/* ---- Macro calculator ------------------------------------------- */
handlers.macrocalc = async (ctx) => {
  const q = textOf(ctx).replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  const cal = num(q[0]);
  const goal = (q[1] || 'maintain').toLowerCase();
  if (!cal) return reply(ctx, `🥩 *Usage:* ${ctx.prefix}macrocalc 2000 [cut|maintain|bulk]`);
  let p, f, c;
  if (goal.startsWith('cut')) { p = 0.35; f = 0.25; c = 0.40; }
  else if (goal.startsWith('bulk')) { p = 0.25; f = 0.25; c = 0.50; }
  else { p = 0.30; f = 0.30; c = 0.40; }
  return reply(ctx, box('🥩 MACROS', [
    `🔥 *Calories:* ${cal} kcal`,
    `🎯 *Goal:* ${goal}`,
    '',
    `🥩 *Protein:* ${Math.round((cal * p) / 4)} g (${Math.round(p * 100)}%)`,
    `🧈 *Fat:* ${Math.round((cal * f) / 9)} g (${Math.round(f * 100)}%)`,
    `🍚 *Carbs:* ${Math.round((cal * c) / 4)} g (${Math.round(c * 100)}%)`,
    '',
    `_Protein 4 kcal/g · Carbs 4 kcal/g · Fat 9 kcal/g_`
  ]));
};

/* ---- Step tracker ----------------------------------------------- */
handlers.stepstracker = async (ctx) => {
  const key = ctx.m.sender || 'anon';
  const arg = textOf(ctx).toLowerCase().trim();
  const today = new Date().toISOString().slice(0, 10);
  let st = steps.get(key);
  if (!st || st.date !== today) st = { date: today, count: 0 };
  if (arg === 'reset') { st.count = 0; steps.set(key, st); return reply(ctx, '🔄 Steps reset to 0.'); }
  const n = num(arg);
  if (n) { st.count += Math.round(n); steps.set(key, st); }
  const pct = Math.min(100, Math.round((st.count / 10000) * 100));
  const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
  const km = (st.count * 0.00075).toFixed(2);
  const kcal = Math.round(st.count * 0.04);
  return reply(ctx, box('👟 STEP TRACKER', [
    `📅 *Date:* ${today}`,
    `${bar} ${pct}%`,
    `👟 *Steps:* *${st.count.toLocaleString()}* / 10,000`,
    `📏 *Distance:* ~${km} km`,
    `🔥 *Calories:* ~${kcal} kcal`,
    '',
    `_${ctx.prefix}stepstracker 1500  (add steps)_`,
    `_${ctx.prefix}stepstracker reset_`
  ]));
};

/* ---- Fasting tracker -------------------------------------------- */
handlers.fasting = async (ctx) => {
  const key = ctx.m.sender || 'anon';
  const arg = textOf(ctx).toLowerCase().trim();
  const st = fasting.get(key);
  if (arg === 'start' || !st) {
    const hours = num(arg) || 16;
    fasting.set(key, { start: Date.now(), target: Math.max(1, Math.min(48, hours)) });
    return reply(ctx, `⏳ *FASTING STARTED*\n\n🎯 Target: *${hours} hours*\n🕐 Start: ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}\n\n_${ctx.prefix}fasting status_`);
  }
  if (arg === 'stop' || arg === 'end') {
    fasting.delete(key);
    return reply(ctx, '✅ Fasting end ho gayi. Paani aur light food se shuru karein.');
  }
  const elapsed = (Date.now() - st.start) / 3600000;
  const remain = Math.max(0, st.target - elapsed);
  const pct = Math.min(100, Math.round((elapsed / st.target) * 100));
  const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
  const stage = elapsed < 4 ? '🍽️ Digestive — glucose use ho raha hai'
    : elapsed < 8 ? '🩸 Blood sugar stabilising'
    : elapsed < 12 ? '🔥 Fat burning shuru'
    : elapsed < 16 ? '⚡ Ketosis mild'
    : elapsed < 24 ? '🧠 Ketosis + autophagy'
    : '♻️ Deep autophagy';
  return reply(ctx, box('⏳ FASTING STATUS', [
    `${bar} ${pct}%`,
    `⏱️ *Elapsed:* ${elapsed.toFixed(1)} h / ${st.target} h`,
    `⌛ *Remaining:* ${remain.toFixed(1)} h`,
    `🔬 *Stage:* ${stage}`,
    '',
    `_${ctx.prefix}fasting stop_`
  ]));
};

/* ---- Body fat --------------------------------------------------- */
handlers.bodyfat = async (ctx) => {
  // US Navy method: waist, neck, height (+hip for female)
  const q = textOf(ctx).replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  if (q.length < 4) {
    return reply(ctx, box('📊 BODY FAT %', [
      'US Navy method:',
      '`<waist cm> <neck cm> <height cm> <male|female> [hip cm]`',
      '',
      `*${ctx.prefix}bodyfat 85 38 175 male*`,
      `*${ctx.prefix}bodyfat 75 32 165 female 95*`
    ]));
  }
  const waist = num(q[0]), neck = num(q[1]), height = num(q[2]);
  const sex = (q[3] || '').toLowerCase();
  const hip = num(q[4]);
  if (!waist || !neck || !height) return reply(ctx, '❌ Numbers check karein.');
  const isMale = sex.startsWith('m');
  let bf;
  if (isMale) {
    bf = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height)) - 450;
  } else {
    if (!hip) return reply(ctx, '❌ Females ke liye hip measurement bhi dein.');
    bf = 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.22100 * Math.log10(height)) - 450;
  }
  bf = Math.max(2, Math.min(60, bf));
  const cat = isMale
    ? bf < 6 ? 'Essential' : bf < 14 ? 'Athletic' : bf < 18 ? 'Fitness' : bf < 25 ? 'Average' : 'Obese'
    : bf < 14 ? 'Essential' : bf < 21 ? 'Athletic' : bf < 25 ? 'Fitness' : bf < 32 ? 'Average' : 'Obese';
  return reply(ctx, box('📊 BODY FAT', [
    `📏 *Waist:* ${waist} cm`,
    `📏 *Neck:* ${neck} cm`,
    hip ? `📏 *Hip:* ${hip} cm` : null,
    `📏 *Height:* ${height} cm`,
    '',
    `📊 *Body fat:* *${bf.toFixed(1)}%*`,
    `🏷️ *Category:* ${cat}`,
    '',
    `_US Navy formula — approximate._`
  ].filter(Boolean)));
};

/* ---- One rep max ------------------------------------------------ */
handlers['one-rm'] = async (ctx) => {
  const q = textOf(ctx).replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  const w = num(q[0]), r = num(q[1]);
  if (!w || !r) return reply(ctx, `🏋️ *Usage:* ${ctx.prefix}one-rm 80 5\n(weight × reps)`);
  const rm = w * (1 + r / 30); // Epley
  const brzycki = w * (36 / (37 - r));
  const lombardi = w * Math.pow(r, 0.10);
  const avg = (rm + brzycki + lombardi) / 3;
  return reply(ctx, box('🏋️ ONE REP MAX', [
    `⚖️ *Lifted:* ${w} kg × ${r} reps`,
    '',
    `📊 *Epley:* ${rm.toFixed(1)} kg`,
    `📊 *Brzycki:* ${brzycki.toFixed(1)} kg`,
    `📊 *Lombardi:* ${lombardi.toFixed(1)} kg`,
    `🎯 *Estimated 1RM:* *${avg.toFixed(1)} kg*`,
    '',
    '*Training percentages:*',
    `• 95% → ${(avg * 0.95).toFixed(1)} kg × 2`,
    `• 90% → ${(avg * 0.90).toFixed(1)} kg × 4`,
    `• 85% → ${(avg * 0.85).toFixed(1)} kg × 6`,
    `• 80% → ${(avg * 0.80).toFixed(1)} kg × 8`,
    `• 75% → ${(avg * 0.75).toFixed(1)} kg × 10`,
    `• 70% → ${(avg * 0.70).toFixed(1)} kg × 12`
  ]));
};

/* ---- Stretching ------------------------------------------------- */
handlers.stretching = async (ctx) => {
  const q = textOf(ctx) || 'full body';
  const t = await ai(ctx, `Give a ${q} stretching routine: 6-8 stretches with name, duration (seconds per side), and one-line how-to. Add a note about not bouncing and breathing. Max 200 words, emoji bullets.`, 'You are a mobility and flexibility coach.');
  return reply(ctx, t || `🤸 *STRETCHING*\n\n${ctx.prefix}stretching <body part>`);
};

/* ---- Posture ---------------------------------------------------- */
handlers.posture = async (ctx) => {
  const t = await ai(ctx, 'Give a concise posture improvement guide: 1) signs of bad posture, 2) 5 corrective exercises with sets/reps, 3) desk/phone ergonomics tips, 4) daily habits. Max 250 words, emoji bullets.', 'You are a physiotherapist.');
  return reply(ctx, t || '🧍 Posture guide unavailable.');
};

/* ---- Caffeine --------------------------------------------------- */
handlers.caffeine = async (ctx) => {
  const q = textOf(ctx).replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  const mg = num(q[0]) || 200;
  const weight = num(q[1]) || 70;
  const halfLife = 5; // hours
  const hours = [0, 1, 2, 4, 6, 8, 10, 12];
  const lines = hours.map((h) => {
    const remain = mg * Math.pow(0.5, h / halfLife);
    return `⏱️ +${h}h → ${remain.toFixed(0)} mg`;
  });
  const safeLimit = weight * 6;
  return reply(ctx, box('☕ CAFFEINE', [
    `💊 *Dose:* ${mg} mg`,
    `⚖️ *Body weight:* ${weight} kg`,
    `📉 *Half-life:* ~${halfLife} hours`,
    '',
    ...lines,
    '',
    `✅ *Safe limit (EFSA):* ~${safeLimit.toFixed(0)} mg/day`,
    `${mg > safeLimit ? '⚠️ Aap ki dose safe limit se zyada hai.' : '✅ Dose safe range mein hai.'}`,
    '',
    `_Sone se 8-10 ghante pehle caffeine band karein._`
  ]));
};

/* ---- Addiction -------------------------------------------------- */
handlers.addiction = async (ctx) => {
  const q = textOf(ctx) || 'general';
  const t = await ai(ctx, `User is asking about overcoming addiction to: "${q}". Give a compassionate, non-judgemental response: 1) acknowledge the courage, 2) 5 practical steps, 3) coping strategies for cravings, 4) when to seek professional help, 5) helpline suggestion (generic). Max 250 words. Emphasise professional support.`, 'You are a supportive counsellor. Never shame. Always encourage professional help.');
  return reply(ctx, `💚 *OVERCOMING ADDICTION*\n\n${t || 'Professional help zaroor lein.'}\n\n📞 _Pakistan: 115 (Edhi) · Umang 0311-7786264_`);
};

/* ---- Mental health --------------------------------------------- */
handlers.mentalhealth = async (ctx) => {
  const q = textOf(ctx);
  if (!q) {
    return reply(ctx, box('🧠 MENTAL HEALTH', [
      'Aap kaisa mehsoos kar rahe hain? Likh kar bhejein:',
      '',
      `*${ctx.prefix}mentalhealth I feel anxious all the time*`,
      `*${ctx.prefix}mentalhealth I cannot sleep*`,
      '',
      '💚 Aap akelay nahi hain.',
      '📞 *Helplines (Pakistan):*',
      '• Umang: 0311-7786264',
      '• Rozan: 0304-1111741',
      '• Edhi: 115'
    ]));
  }
  const t = await ai(ctx, `The user says: "${q}". Respond with warmth and empathy (not clinical). Acknowledge feelings, offer 3-4 gentle coping suggestions (breathing, grounding, journaling, talking to someone), and strongly encourage professional help if it's persistent. End with a caring line. Max 220 words. Never diagnose.`, 'You are a warm, empathetic mental health supporter. Never diagnose or prescribe.');
  return reply(ctx, `💚 *SUPPORT*\n\n${t || 'Aap akelay nahi hain. Kisi se baat karein.'}\n\n📞 _Umang 0311-7786264 · Edhi 115_`);
};

module.exports = { handlers, steps, fasting, FIRSTAID };
