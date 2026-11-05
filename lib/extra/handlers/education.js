'use strict';
/**
 * Education handlers (20 commands).
 * periodic, mathsolve, physics, astronomy, history, dictionary, thesaurus,
 * unitconvert, periodicquiz, citation, formula, dino, mythology,
 * constellation, anatomy, earthquake, volcano, spaceflight, philosophy,
 * literature
 */
const U = require('../util');

const { textOf, need, reply, ai, box, getJson, pick, randInt } = U;

const handlers = {};

/* ---- Periodic table --------------------------------------------- */
const ELEMENTS = {
  1: ['H', 'Hydrogen', 1.008, 'Nonmetal', '1s¹'], 2: ['He', 'Helium', 4.0026, 'Noble gas', '1s²'],
  3: ['Li', 'Lithium', 6.94, 'Alkali metal', '[He]2s¹'], 4: ['Be', 'Beryllium', 9.0122, 'Alkaline earth', '[He]2s²'],
  5: ['B', 'Boron', 10.81, 'Metalloid', '[He]2s²2p¹'], 6: ['C', 'Carbon', 12.011, 'Nonmetal', '[He]2s²2p²'],
  7: ['N', 'Nitrogen', 14.007, 'Nonmetal', '[He]2s²2p³'], 8: ['O', 'Oxygen', 15.999, 'Nonmetal', '[He]2s²2p⁴'],
  9: ['F', 'Fluorine', 18.998, 'Halogen', '[He]2s²2p⁵'], 10: ['Ne', 'Neon', 20.180, 'Noble gas', '[He]2s²2p⁶'],
  11: ['Na', 'Sodium', 22.990, 'Alkali metal', '[Ne]3s¹'], 12: ['Mg', 'Magnesium', 24.305, 'Alkaline earth', '[Ne]3s²'],
  13: ['Al', 'Aluminium', 26.982, 'Post-transition', '[Ne]3s²3p¹'], 14: ['Si', 'Silicon', 28.085, 'Metalloid', '[Ne]3s²3p²'],
  15: ['P', 'Phosphorus', 30.974, 'Nonmetal', '[Ne]3s²3p³'], 16: ['S', 'Sulfur', 32.06, 'Nonmetal', '[Ne]3s²3p⁴'],
  17: ['Cl', 'Chlorine', 35.45, 'Halogen', '[Ne]3s²3p⁵'], 18: ['Ar', 'Argon', 39.948, 'Noble gas', '[Ne]3s²3p⁶'],
  19: ['K', 'Potassium', 39.098, 'Alkali metal', '[Ar]4s¹'], 20: ['Ca', 'Calcium', 40.078, 'Alkaline earth', '[Ar]4s²'],
  21: ['Sc', 'Scandium', 44.956, 'Transition metal', '[Ar]3d¹4s²'], 22: ['Ti', 'Titanium', 47.867, 'Transition metal', '[Ar]3d²4s²'],
  23: ['V', 'Vanadium', 50.942, 'Transition metal', '[Ar]3d³4s²'], 24: ['Cr', 'Chromium', 51.996, 'Transition metal', '[Ar]3d⁵4s¹'],
  25: ['Mn', 'Manganese', 54.938, 'Transition metal', '[Ar]3d⁵4s²'], 26: ['Fe', 'Iron', 55.845, 'Transition metal', '[Ar]3d⁶4s²'],
  27: ['Co', 'Cobalt', 58.933, 'Transition metal', '[Ar]3d⁷4s²'], 28: ['Ni', 'Nickel', 58.693, 'Transition metal', '[Ar]3d⁸4s²'],
  29: ['Cu', 'Copper', 63.546, 'Transition metal', '[Ar]3d¹⁰4s¹'], 30: ['Zn', 'Zinc', 65.38, 'Transition metal', '[Ar]3d¹⁰4s²'],
  31: ['Ga', 'Gallium', 69.723, 'Post-transition', '[Ar]3d¹⁰4s²4p¹'], 32: ['Ge', 'Germanium', 72.630, 'Metalloid', '[Ar]3d¹⁰4s²4p²'],
  33: ['As', 'Arsenic', 74.922, 'Metalloid', '[Ar]3d¹⁰4s²4p³'], 34: ['Se', 'Selenium', 78.971, 'Nonmetal', '[Ar]3d¹⁰4s²4p⁴'],
  35: ['Br', 'Bromine', 79.904, 'Halogen', '[Ar]3d¹⁰4s²4p⁵'], 36: ['Kr', 'Krypton', 83.798, 'Noble gas', '[Ar]3d¹⁰4s²4p⁶'],
  37: ['Rb', 'Rubidium', 85.468, 'Alkali metal', '[Kr]5s¹'], 38: ['Sr', 'Strontium', 87.62, 'Alkaline earth', '[Kr]5s²'],
  39: ['Y', 'Yttrium', 88.906, 'Transition metal', '[Kr]4d¹5s²'], 40: ['Zr', 'Zirconium', 91.224, 'Transition metal', '[Kr]4d²5s²'],
  41: ['Nb', 'Niobium', 92.906, 'Transition metal', '[Kr]4d⁴5s¹'], 42: ['Mo', 'Molybdenum', 95.95, 'Transition metal', '[Kr]4d⁵5s¹'],
  43: ['Tc', 'Technetium', 98, 'Transition metal', '[Kr]4d⁵5s²'], 44: ['Ru', 'Ruthenium', 101.07, 'Transition metal', '[Kr]4d⁷5s¹'],
  45: ['Rh', 'Rhodium', 102.91, 'Transition metal', '[Kr]4d⁸5s¹'], 46: ['Pd', 'Palladium', 106.42, 'Transition metal', '[Kr]4d¹⁰'],
  47: ['Ag', 'Silver', 107.87, 'Transition metal', '[Kr]4d¹⁰5s¹'], 48: ['Cd', 'Cadmium', 112.41, 'Transition metal', '[Kr]4d¹⁰5s²'],
  49: ['In', 'Indium', 114.82, 'Post-transition', '[Kr]4d¹⁰5s²5p¹'], 50: ['Sn', 'Tin', 118.71, 'Post-transition', '[Kr]4d¹⁰5s²5p²'],
  51: ['Sb', 'Antimony', 121.76, 'Metalloid', '[Kr]4d¹⁰5s²5p³'], 52: ['Te', 'Tellurium', 127.60, 'Metalloid', '[Kr]4d¹⁰5s²5p⁴'],
  53: ['I', 'Iodine', 126.90, 'Halogen', '[Kr]4d¹⁰5s²5p⁵'], 54: ['Xe', 'Xenon', 131.29, 'Noble gas', '[Kr]4d¹⁰5s²5p⁶'],
  55: ['Cs', 'Caesium', 132.91, 'Alkali metal', '[Xe]6s¹'], 56: ['Ba', 'Barium', 137.33, 'Alkaline earth', '[Xe]6s²'],
  57: ['La', 'Lanthanum', 138.91, 'Lanthanide', '[Xe]5d¹6s²'], 58: ['Ce', 'Cerium', 140.12, 'Lanthanide', '[Xe]4f¹5d¹6s²'],
  59: ['Pr', 'Praseodymium', 140.91, 'Lanthanide', '[Xe]4f³6s²'], 60: ['Nd', 'Neodymium', 144.24, 'Lanthanide', '[Xe]4f⁴6s²'],
  61: ['Pm', 'Promethium', 145, 'Lanthanide', '[Xe]4f⁵6s²'], 62: ['Sm', 'Samarium', 150.36, 'Lanthanide', '[Xe]4f⁶6s²'],
  63: ['Eu', 'Europium', 151.96, 'Lanthanide', '[Xe]4f⁷6s²'], 64: ['Gd', 'Gadolinium', 157.25, 'Lanthanide', '[Xe]4f⁷5d¹6s²'],
  65: ['Tb', 'Terbium', 158.93, 'Lanthanide', '[Xe]4f⁹6s²'], 66: ['Dy', 'Dysprosium', 162.50, 'Lanthanide', '[Xe]4f¹⁰6s²'],
  67: ['Ho', 'Holmium', 164.93, 'Lanthanide', '[Xe]4f¹¹6s²'], 68: ['Er', 'Erbium', 167.26, 'Lanthanide', '[Xe]4f¹²6s²'],
  69: ['Tm', 'Thulium', 168.93, 'Lanthanide', '[Xe]4f¹³6s²'], 70: ['Yb', 'Ytterbium', 173.05, 'Lanthanide', '[Xe]4f¹⁴6s²'],
  71: ['Lu', 'Lutetium', 174.97, 'Lanthanide', '[Xe]4f¹⁴5d¹6s²'], 72: ['Hf', 'Hafnium', 178.49, 'Transition metal', '[Xe]4f¹⁴5d²6s²'],
  73: ['Ta', 'Tantalum', 180.95, 'Transition metal', '[Xe]4f¹⁴5d³6s²'], 74: ['W', 'Tungsten', 183.84, 'Transition metal', '[Xe]4f¹⁴5d⁴6s²'],
  75: ['Re', 'Rhenium', 186.21, 'Transition metal', '[Xe]4f¹⁴5d⁵6s²'], 76: ['Os', 'Osmium', 190.23, 'Transition metal', '[Xe]4f¹⁴5d⁶6s²'],
  77: ['Ir', 'Iridium', 192.22, 'Transition metal', '[Xe]4f¹⁴5d⁷6s²'], 78: ['Pt', 'Platinum', 195.08, 'Transition metal', '[Xe]4f¹⁴5d⁹6s¹'],
  79: ['Au', 'Gold', 196.97, 'Transition metal', '[Xe]4f¹⁴5d¹⁰6s¹'], 80: ['Hg', 'Mercury', 200.59, 'Transition metal', '[Xe]4f¹⁴5d¹⁰6s²'],
  81: ['Tl', 'Thallium', 204.38, 'Post-transition', '[Xe]4f¹⁴5d¹⁰6s²6p¹'], 82: ['Pb', 'Lead', 207.2, 'Post-transition', '[Xe]4f¹⁴5d¹⁰6s²6p²'],
  83: ['Bi', 'Bismuth', 208.98, 'Post-transition', '[Xe]4f¹⁴5d¹⁰6s²6p³'], 84: ['Po', 'Polonium', 209, 'Metalloid', '[Xe]4f¹⁴5d¹⁰6s²6p⁴'],
  85: ['At', 'Astatine', 210, 'Halogen', '[Xe]4f¹⁴5d¹⁰6s²6p⁵'], 86: ['Rn', 'Radon', 222, 'Noble gas', '[Xe]4f¹⁴5d¹⁰6s²6p⁶'],
  87: ['Fr', 'Francium', 223, 'Alkali metal', '[Rn]7s¹'], 88: ['Ra', 'Radium', 226, 'Alkaline earth', '[Rn]7s²'],
  89: ['Ac', 'Actinium', 227, 'Actinide', '[Rn]6d¹7s²'], 90: ['Th', 'Thorium', 232.04, 'Actinide', '[Rn]6d²7s²'],
  91: ['Pa', 'Protactinium', 231.04, 'Actinide', '[Rn]5f²6d¹7s²'], 92: ['U', 'Uranium', 238.03, 'Actinide', '[Rn]5f³6d¹7s²'],
  93: ['Np', 'Neptunium', 237, 'Actinide', '[Rn]5f⁴6d¹7s²'], 94: ['Pu', 'Plutonium', 244, 'Actinide', '[Rn]5f⁶7s²'],
  95: ['Am', 'Americium', 243, 'Actinide', '[Rn]5f⁷7s²'], 96: ['Cm', 'Curium', 247, 'Actinide', '[Rn]5f⁷6d¹7s²'],
  97: ['Bk', 'Berkelium', 247, 'Actinide', '[Rn]5f⁹7s²'], 98: ['Cf', 'Californium', 251, 'Actinide', '[Rn]5f¹⁰7s²'],
  99: ['Es', 'Einsteinium', 252, 'Actinide', '[Rn]5f¹¹7s²'], 100: ['Fm', 'Fermium', 257, 'Actinide', '[Rn]5f¹²7s²'],
  101: ['Md', 'Mendelevium', 258, 'Actinide', '[Rn]5f¹³7s²'], 102: ['No', 'Nobelium', 259, 'Actinide', '[Rn]5f¹⁴7s²'],
  103: ['Lr', 'Lawrencium', 266, 'Actinide', '[Rn]5f¹⁴7s²7p¹'], 104: ['Rf', 'Rutherfordium', 267, 'Transition metal', '[Rn]5f¹⁴6d²7s²'],
  105: ['Db', 'Dubnium', 268, 'Transition metal', '[Rn]5f¹⁴6d³7s²'], 106: ['Sg', 'Seaborgium', 269, 'Transition metal', '[Rn]5f¹⁴6d⁴7s²'],
  107: ['Bh', 'Bohrium', 270, 'Transition metal', '[Rn]5f¹⁴6d⁵7s²'], 108: ['Hs', 'Hassium', 269, 'Transition metal', '[Rn]5f¹⁴6d⁶7s²'],
  109: ['Mt', 'Meitnerium', 278, 'Unknown', '[Rn]5f¹⁴6d⁷7s²'], 110: ['Ds', 'Darmstadtium', 281, 'Unknown', '[Rn]5f¹⁴6d⁸7s²'],
  111: ['Rg', 'Roentgenium', 282, 'Unknown', '[Rn]5f¹⁴6d⁹7s²'], 112: ['Cn', 'Copernicium', 285, 'Transition metal', '[Rn]5f¹⁴6d¹⁰7s²'],
  113: ['Nh', 'Nihonium', 286, 'Unknown', '[Rn]5f¹⁴6d¹⁰7s²7p¹'], 114: ['Fl', 'Flerovium', 289, 'Unknown', '[Rn]5f¹⁴6d¹⁰7s²7p²'],
  115: ['Mc', 'Moscovium', 290, 'Unknown', '[Rn]5f¹⁴6d¹⁰7s²7p³'], 116: ['Lv', 'Livermorium', 293, 'Unknown', '[Rn]5f¹⁴6d¹⁰7s²7p⁴'],
  117: ['Ts', 'Tennessine', 294, 'Unknown', '[Rn]5f¹⁴6d¹⁰7s²7p⁵'], 118: ['Og', 'Oganesson', 294, 'Unknown', '[Rn]5f¹⁴6d¹⁰7s²7p⁶']
};

handlers.periodic = async (ctx) => {
  const q = textOf(ctx).trim();
  if (!q) {
    return reply(ctx, box('⚛️ PERIODIC TABLE', [
      'Element ka naam, symbol ya atomic number dein:',
      '',
      `*${ctx.prefix}periodic Fe*`,
      `*${ctx.prefix}periodic 26*`,
      `*${ctx.prefix}periodic Gold*`
    ]));
  }
  let el = null, num = null;
  if (/^\d+$/.test(q)) { num = parseInt(q, 10); el = ELEMENTS[num]; }
  if (!el) {
    for (const [n, e] of Object.entries(ELEMENTS)) {
      if (e[0].toLowerCase() === q.toLowerCase() || e[1].toLowerCase() === q.toLowerCase() || e[1].toLowerCase().startsWith(q.toLowerCase())) {
        el = e; num = parseInt(n, 10); break;
      }
    }
  }
  if (!el) return reply(ctx, `❌ Element "${q}" nahi mila.`);
  return reply(ctx, box(`⚛️ ${el[1].toUpperCase()}`, [
    `🔤 *Symbol:* ${el[0]}`,
    `🔢 *Atomic number:* ${num}`,
    `⚖️ *Atomic mass:* ${el[2]} u`,
    `🏷️ *Category:* ${el[3]}`,
    `🧬 *Electron config:* ${el[4]}`,
    `📊 *Group:* ${groupOf(num)} | *Period:* ${periodOf(num)}`,
    '',
    `_${ctx.prefix}periodic <element>_`
  ]));
};

function periodOf(n) {
  if (n <= 2) return 1; if (n <= 10) return 2; if (n <= 18) return 3; if (n <= 36) return 4;
  if (n <= 54) return 5; if (n <= 86) return 6; return 7;
}
function groupOf(n) {
  const g = { 1: 1, 2: 18, 3: 1, 4: 2, 5: 13, 6: 14, 7: 15, 8: 16, 9: 17, 10: 18 };
  if (n <= 10) return g[n];
  if (n <= 18) return n - 10;
  if (n <= 36) return n - 18;
  if (n <= 54) return n - 36;
  if (n <= 86) return n - 54;
  return n - 86;
}

/* ---- Math solver ------------------------------------------------- */
handlers.mathsolve = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🧮 *Usage:* ${ctx.prefix}mathsolve 2x + 5 = 15\n${ctx.prefix}mathsolve integrate x^2`);
  // try direct arithmetic first
  if (/^[\d\s+\-*/().^%]+$/.test(q)) {
    try {
      const expr = q.replace(/\^/g, '**');
      // eslint-disable-next-line no-new-func
      const val = Function(`"use strict";return (${expr})`)();
      if (typeof val === 'number' && isFinite(val)) {
        return reply(ctx, box('🧮 MATH', [`📝 *Expression:* ${q}`, `✅ *Result:* *${val}*`]));
      }
    } catch (e) { /* fall through to AI */ }
  }
  const t = await ai(ctx, `Solve this math problem step by step: "${q}". Show each step clearly, then the final answer in bold. Use plain text math notation. Keep under 250 words.`, 'You are a patient mathematics tutor. Show every step.');
  return reply(ctx, `🧮 *MATH SOLUTION*\n\n${t || 'Solve nahi ho saka.'}`);
};

/* ---- Physics ---------------------------------------------------- */
handlers.physics = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `⚛️ *Usage:* ${ctx.prefix}physics force = mass 5kg acceleration 2m/s2\n${ctx.prefix}physics what is entropy`);
  const t = await ai(ctx, `Physics question: "${q}". Explain the concept and, if numerical, solve it step by step with units. State the formula used. Max 250 words.`, 'You are a physics teacher. Always include units and formulas.');
  return reply(ctx, `⚛️ *PHYSICS*\n\n${t || 'Explain nahi ho saka.'}`);
};

/* ---- Astronomy -------------------------------------------------- */
handlers.astronomy = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🔭 *Usage:* ${ctx.prefix}astronomy Jupiter\n${ctx.prefix}astronomy tonight`);
  if (/tonight|sky|now/i.test(q)) {
    try {
      const d = await getJson('https://api.le-systeme-solaire.net/rest/bodies?filter[]=isPlanet,eq,true');
      const names = d.bodies.map((b) => b.englishName).join(', ');
      return reply(ctx, box('🔭 ASTRONOMY TONIGHT', [
        `🪐 *Planets:* ${names}`,
        '',
        '🌌 *Visible now depends on your location & time.*',
        '🔗 Sky map: https://stellarium-web.org/',
        '🔗 ISS tracker: https://spotthestation.nasa.gov/',
        '',
        `_${ctx.prefix}astronomy <object>_`
      ]));
    } catch (e) { /* ignore */ }
  }
  try {
    const d = await getJson(`https://api.le-systeme-solaire.net/rest/bodies/${encodeURIComponent(q.toLowerCase())}`);
    if (d && d.englishName) {
      return reply(ctx, box(`🔭 ${d.englishName.toUpperCase()}`, [
        `🪐 *Type:* ${d.bodyType}`,
        `⚖️ *Mass:* ${d.mass ? `${d.mass.massValue} × 10^${d.mass.massExponent} kg` : 'N/A'}`,
        `📏 *Radius:* ${d.meanRadius ? `${d.meanRadius} km` : 'N/A'}`,
        `🌡️ *Avg temp:* ${d.avgTemp ? `${(d.avgTemp - 273.15).toFixed(1)} °C` : 'N/A'}`,
        `🌍 *Gravity:* ${d.gravity ? `${d.gravity} m/s²` : 'N/A'}`,
        `🔄 *Day length:* ${d.sideralRotation ? `${Math.abs(d.sideralRotation).toFixed(1)} h` : 'N/A'}`,
        `📅 *Orbital period:* ${d.sideralOrbit ? `${d.sideralOrbit.toFixed(0)} days` : 'N/A'}`,
        `🌙 *Moons:* ${d.moons ? d.moons.length : 0}`,
        d.discoveryDate ? `🔍 *Discovered:* ${d.discoveryDate}` : '',
        d.discoveredBy ? `👤 *By:* ${d.discoveredBy}` : ''
      ].filter(Boolean)));
    }
  } catch (e) { /* fall through */ }
  const t = await ai(ctx, `Explain astronomy topic: "${q}". Give a clear, engaging explanation with key facts and numbers. Max 220 words.`, 'You are an astronomy educator.');
  return reply(ctx, `🔭 *ASTRONOMY*\n\n${t || 'Nahi mila.'}`);
};

/* ---- History ---------------------------------------------------- */
handlers.history = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `📜 *Usage:* ${ctx.prefix}history 1947 partition\n${ctx.prefix}history Mughal Empire`);
  const t = await ai(ctx, `Give a well-structured historical summary of: "${q}". Include dates, key figures, causes, consequences, and one interesting lesser-known fact. Max 280 words. Be factual and balanced.`, 'You are a historian. Be accurate, cite approximate dates, and stay neutral on contested topics.');
  return reply(ctx, `📜 *HISTORY — ${q.toUpperCase()}*\n\n${t || 'Nahi mila.'}`);
};

/* ---- Dictionary ------------------------------------------------- */
handlers.dictionary = async (ctx) => {
  const q = textOf(ctx).split(/\s+/)[0];
  if (!q) return reply(ctx, `📖 *Usage:* ${ctx.prefix}dictionary serendipity`);
  try {
    const d = await getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(q)}`);
    if (!Array.isArray(d) || !d.length) throw new Error('not found');
    const w = d[0];
    const lines = [`📖 *${w.word}*${w.phonetic ? `  ${w.phonetic}` : ''}`];
    for (const m of w.meanings.slice(0, 4)) {
      lines.push('', `*${m.partOfSpeech}*`);
      m.definitions.slice(0, 3).forEach((def, i) => lines.push(`${i + 1}. ${def.definition}${def.example ? `\n   _e.g. ${def.example}_` : ''}`));
      if (m.synonyms && m.synonyms.length) lines.push(`🔁 Synonyms: ${m.synonyms.slice(0, 6).join(', ')}`);
    }
    return reply(ctx, lines.join('\n'));
  } catch (e) {
    const t = await ai(ctx, `Define the English word "${q}" with part of speech, 2 definitions, 2 example sentences, and 4 synonyms.`, 'You are a dictionary.');
    return reply(ctx, `📖 *${q.toUpperCase()}*\n\n${t || 'Word nahi mila.'}`);
  }
};

/* ---- Thesaurus -------------------------------------------------- */
handlers.thesaurus = async (ctx) => {
  const q = textOf(ctx).split(/\s+/)[0];
  if (!q) return reply(ctx, `📚 *Usage:* ${ctx.prefix}thesaurus happy`);
  try {
    const d = await getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(q)}`);
    const syn = new Set(), ant = new Set();
    for (const w of d) for (const m of w.meanings) {
      (m.synonyms || []).forEach((s) => syn.add(s));
      (m.antonyms || []).forEach((a) => ant.add(a));
    }
    if (!syn.size && !ant.size) throw new Error('empty');
    return reply(ctx, box(`📚 THESAURUS — ${q.toUpperCase()}`, [
      `🔁 *Synonyms (${syn.size}):*`,
      [...syn].slice(0, 25).join(', ') || '—',
      '',
      `↔️ *Antonyms (${ant.size}):*`,
      [...ant].slice(0, 15).join(', ') || '—'
    ]));
  } catch (e) {
    const t = await ai(ctx, `Give 12 synonyms and 6 antonyms for the English word "${q}". Output two labelled lines.`, 'You are a thesaurus.');
    return reply(ctx, `📚 *THESAURUS — ${q.toUpperCase()}*\n\n${t || 'Nahi mila.'}`);
  }
};

/* ---- Unit converter --------------------------------------------- */
const UNITS = {
  length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254, nmi: 1852 },
  mass: { kg: 1, g: 0.001, mg: 0.000001, t: 1000, lb: 0.453592, oz: 0.0283495, st: 6.35029 },
  volume: { l: 1, ml: 0.001, m3: 1000, gal: 3.78541, qt: 0.946353, pt: 0.473176, cup: 0.236588, floz: 0.0295735 },
  speed: { 'm/s': 1, 'km/h': 0.277778, mph: 0.44704, knot: 0.514444, 'ft/s': 0.3048 },
  area: { m2: 1, km2: 1e6, cm2: 1e-4, ha: 10000, acre: 4046.86, ft2: 0.092903, yd2: 0.836127 },
  data: { b: 1, kb: 1024, mb: 1048576, gb: 1073741824, tb: 1099511627776 },
  time: { s: 1, min: 60, h: 3600, d: 86400, wk: 604800, mo: 2629800, yr: 31557600 }
};

handlers.unitconvert = async (ctx) => {
  // .unitconvert 5 km to mi
  const q = textOf(ctx).replace(/,/g, ' ').trim();
  const m = q.match(/^(-?\d+\.?\d*)\s*([a-zA-Z\/0-9²]+)\s*(?:to|in|->)\s*([a-zA-Z\/0-9²]+)$/);
  if (!m) {
    return reply(ctx, box('📐 UNIT CONVERTER', [
      'Format: `<value> <from> to <to>`',
      '',
      `*${ctx.prefix}unitconvert 5 km to mi*`,
      `*${ctx.prefix}unitconvert 100 f to c*`,
      `*${ctx.prefix}unitconvert 2 gb to mb*`,
      '',
      '*Supported:* length, mass, volume, speed, area, data, time, temperature'
    ]));
  }
  const val = parseFloat(m[1]);
  const from = m[2].toLowerCase();
  const to = m[3].toLowerCase();

  // temperature
  const temps = ['c', 'f', 'k', '°c', '°f'];
  if (temps.includes(from) && temps.includes(to)) {
    const f0 = from.replace('°', ''), t0 = to.replace('°', '');
    let c = f0 === 'c' ? val : f0 === 'f' ? (val - 32) * 5 / 9 : val - 273.15;
    const out = t0 === 'c' ? c : t0 === 'f' ? c * 9 / 5 + 32 : c + 273.15;
    return reply(ctx, box('🌡️ TEMPERATURE', [`${val}°${f0.toUpperCase()} = *${out.toFixed(2)}°${t0.toUpperCase()}*`]));
  }

  for (const [cat, map] of Object.entries(UNITS)) {
    if (map[from] !== undefined && map[to] !== undefined) {
      const out = (val * map[from]) / map[to];
      return reply(ctx, box('📐 UNIT CONVERSION', [
        `🔢 *Input:* ${val} ${from}`,
        `✅ *Result:* *${out.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${to}*`,
        `📂 *Category:* ${cat}`
      ]));
    }
  }
  return reply(ctx, `❌ "${from}" → "${to}" conversion support nahi hai. ${ctx.prefix}unitconvert se list dekhein.`);
};

/* ---- Periodic quiz ---------------------------------------------- */
const pq = new Map();
handlers.periodicquiz = async (ctx) => {
  const key = ctx.m.chat || 'anon';
  const arg = textOf(ctx).trim();
  const st = pq.get(key);
  if (st && arg) {
    pq.delete(key);
    const ok = arg.toLowerCase() === st.answer.toLowerCase();
    return reply(ctx, ok ? `✅ *Sahi!* ${st.answer}` : `❌ *Ghalat.* Sahi jawab: *${st.answer}*`);
  }
  const nums = Object.keys(ELEMENTS);
  const n = pick(nums);
  const e = ELEMENTS[n];
  const askSymbol = Math.random() > 0.5;
  const question = askSymbol ? `Element *${e[1]}* ka symbol kya hai?` : `Symbol *${e[0]}* kis element ka hai?`;
  const answer = askSymbol ? e[0] : e[1];
  pq.set(key, { answer, at: Date.now() });
  setTimeout(() => pq.delete(key), 90000);
  return reply(ctx, box('⚛️ PERIODIC QUIZ', [question, '', `_${ctx.prefix}periodicquiz <answer>_`]));
};

/* ---- Citation --------------------------------------------------- */
handlers.citation = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `📝 *Usage:* ${ctx.prefix}citation The Great Gatsby, F. Scott Fitzgerald, 1925`);
  const t = await ai(ctx, `Generate citations for: "${q}". Provide APA 7, MLA 9, Chicago, and Harvard formats. If it's a website, use a placeholder URL. Output only the four labelled citations.`, 'You are a citation formatter.');
  return reply(ctx, `📝 *CITATIONS*\n\n${t || 'Format nahi ho saka.'}`);
};

/* ---- Formula ---------------------------------------------------- */
handlers.formula = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🧪 *Usage:* ${ctx.prefix}formula area of circle\n${ctx.prefix}formula Ohm's law`);
  const t = await ai(ctx, `Give the formula for: "${q}". Include: the formula itself, what each variable means with units, one worked example, and 2 common mistakes. Max 200 words.`, 'You are a science and math formula reference.');
  return reply(ctx, `🧪 *FORMULA — ${q.toUpperCase()}*\n\n${t || 'Nahi mila.'}`);
};

/* ---- Dinosaurs -------------------------------------------------- */
handlers.dino = async (ctx) => {
  const q = textOf(ctx);
  if (!q) {
    return reply(ctx, box('🦖 DINOSAURS', [
      'Kisi bhi dinosaur ka naam dein:',
      '',
      `*${ctx.prefix}dino T-Rex*`,
      `*${ctx.prefix}dino Triceratops*`,
      `*${ctx.prefix}dino Velociraptor*`
    ]));
  }
  const t = await ai(ctx, `Give a fact file on the dinosaur "${q}": name meaning, period it lived (with million years), size (length/height/weight), diet, where fossils found, 2 cool facts. Max 200 words with emojis.`, 'You are a palaeontologist.');
  return reply(ctx, `🦖 *${q.toUpperCase()}*\n\n${t || 'Nahi mila.'}`);
};

/* ---- Mythology -------------------------------------------------- */
handlers.mythology = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🏛️ *Usage:* ${ctx.prefix}mythology Zeus\n${ctx.prefix}mythology Norse`);
  const t = await ai(ctx, `Explain the mythology topic "${q}": origin culture, key story, important figures, symbolism, and modern influence. Max 250 words.`, 'You are a comparative mythologist.');
  return reply(ctx, `🏛️ *MYTHOLOGY — ${q.toUpperCase()}*\n\n${t || 'Nahi mila.'}`);
};

/* ---- Constellation ---------------------------------------------- */
handlers.constellation = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `✨ *Usage:* ${ctx.prefix}constellation Orion\n${ctx.prefix}constellation Ursa Major`);
  const t = await ai(ctx, `Describe the constellation "${q}": meaning of name, brightest stars, best viewing season and hemisphere, mythology behind it, and how to find it in the sky. Max 220 words.`, 'You are an amateur astronomy guide.');
  return reply(ctx, `✨ *${q.toUpperCase()}*\n\n${t || 'Nahi mila.'}`);
};

/* ---- Anatomy ---------------------------------------------------- */
handlers.anatomy = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🫀 *Usage:* ${ctx.prefix}anatomy heart\n${ctx.prefix}anatomy femur`);
  const t = await ai(ctx, `Explain the human anatomy of "${q}": location, structure, function, key facts/numbers, common problems, and one health tip. Max 220 words.`, 'You are an anatomy professor.');
  return reply(ctx, `🫀 *ANATOMY — ${q.toUpperCase()}*\n\n${t || 'Nahi mila.'}`);
};

/* ---- Earthquakes ------------------------------------------------ */
handlers.earthquake = async (ctx) => {
  const q = textOf(ctx);
  try {
    if (q && /^\d+\.?\d*$/.test(q)) {
      const d = await getJson(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=${q}&limit=10&orderby=time`);
      const feats = d.features || [];
      if (!feats.length) return reply(ctx, `🌍 Magnitude ${q}+ ka koi recent earthquake nahi mila.`);
      const lines = feats.map((f) => {
        const p = f.properties;
        return `• *M${p.mag}* — ${p.place}\n   🕐 ${new Date(p.time).toUTCString()}`;
      });
      return reply(ctx, box(`🌍 EARTHQUAKES M${q}+`, lines));
    }
    const d = await getJson('https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&limit=10&orderby=time&minmagnitude=4');
    const feats = d.features || [];
    const lines = feats.map((f) => {
      const p = f.properties;
      return `• *M${p.mag}* — ${p.place}\n   🕐 ${new Date(p.time).toUTCString()}`;
    });
    return reply(ctx, box('🌍 RECENT EARTHQUAKES (M4+)', lines.concat(['', `_${ctx.prefix}earthquake <min magnitude>_`])));
  } catch (e) {
    return reply(ctx, `❌ Earthquake data fail: ${e.message}`);
  }
};

/* ---- Volcanoes -------------------------------------------------- */
handlers.volcano = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🌋 *Usage:* ${ctx.prefix}volcano Mount Etna\n${ctx.prefix}volcano active`);
  const t = await ai(ctx, `Explain the volcano "${q}": location, type, height, last eruption, notable eruptions, hazard level, and 2 fascinating facts. Max 220 words.`, 'You are a volcanologist.');
  return reply(ctx, `🌋 *${q.toUpperCase()}*\n\n${t || 'Nahi mila.'}`);
};

/* ---- Spaceflight ------------------------------------------------ */
handlers.spaceflight = async (ctx) => {
  try {
    const d = await getJson('https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=8&mode=list');
    const results = d.results || [];
    if (!results.length) throw new Error('empty');
    const lines = results.map((l) => `🚀 *${l.name}*\n   🏢 ${l.launch_service_provider ? l.launch_service_provider.name : '—'}\n   🕐 ${new Date(l.net).toUTCString()}\n   📍 ${l.pad ? l.pad.location.name : '—'}`);
    return reply(ctx, box('🚀 UPCOMING LAUNCHES', lines));
  } catch (e) {
    const t = await ai(ctx, 'List 5 upcoming or recent notable space missions/launches with dates and agencies. Max 150 words.', 'You are a spaceflight reporter.');
    return reply(ctx, `🚀 *SPACEFLIGHT*\n\n${t || 'Data unavailable.'}`);
  }
};

/* ---- Philosophy ------------------------------------------------- */
handlers.philosophy = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🤔 *Usage:* ${ctx.prefix}philosophy stoicism\n${ctx.prefix}philosophy free will`);
  const t = await ai(ctx, `Explain the philosophical topic "${q}": core idea, key thinkers, main arguments for and against, a famous quote, and a practical takeaway. Max 280 words.`, 'You are a philosophy professor.');
  return reply(ctx, `🤔 *PHILOSOPHY — ${q.toUpperCase()}*\n\n${t || 'Nahi mila.'}`);
};

/* ---- Literature ------------------------------------------------- */
handlers.literature = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `📚 *Usage:* ${ctx.prefix}literature Hamlet\n${ctx.prefix}literature Iqbal`);
  const t = await ai(ctx, `Write a literature guide on "${q}": author/context, plot or theme summary, main characters or motifs, literary devices, key quotes, and why it matters. Max 280 words.`, 'You are a literature professor.');
  return reply(ctx, `📚 *LITERATURE — ${q.toUpperCase()}*\n\n${t || 'Nahi mila.'}`);
};

module.exports = { handlers, ELEMENTS, UNITS };
