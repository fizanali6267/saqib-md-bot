'use strict';
/**
 * E-commerce / shopping handlers (15 commands).
 * barcode, shipping, discount, unitprice, inventory, coupon, pricehistory,
 * pricealert, comparison, wishlist, sizechart, warranty, storefinder,
 * dutycalc, returnpolicy
 */
const U = require('../util');

const { textOf, need, reply, ai, box, getJson, pick, randInt } = U;

const handlers = {};

const wishlists = new Map(); // sender -> [items]
const alerts = new Map();    // sender -> [{item, target}]

function num(s) {
  const n = parseFloat(String(s).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
}

/* ---- Barcode ----------------------------------------------------- */
handlers.barcode = async (ctx) => {
  const q = textOf(ctx).replace(/\s+/g, '');
  if (!q) return reply(ctx, `📊 *Usage:* ${ctx.prefix}barcode 8901234567890`);
  try {
    const d = await getJson(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(q)}.json`);
    if (d.status !== 1 || !d.product) throw new Error('not found');
    const p = d.product;
    const n = p.nutriments || {};
    return reply(ctx, box('📊 PRODUCT INFO', [
      `🏷️ *Name:* ${p.product_name || 'N/A'}`,
      `🏢 *Brand:* ${p.brands || 'N/A'}`,
      `📦 *Qty:* ${p.quantity || 'N/A'}`,
      `🔢 *Barcode:* ${q}`,
      `🌍 *Countries:* ${(p.countries || '').slice(0, 80) || 'N/A'}`,
      '',
      `🔥 *Energy:* ${n['energy-kcal_100g'] || '—'} kcal/100g`,
      `🥩 *Protein:* ${n.proteins_100g || '—'} g`,
      `🍚 *Carbs:* ${n.carbohydrates_100g || '—'} g`,
      `🧈 *Fat:* ${n.fat_100g || '—'} g`,
      `🍬 *Sugar:* ${n.sugars_100g || '—'} g`,
      `🧂 *Salt:* ${n.salt_100g || '—'} g`,
      '',
      `🏷️ *Labels:* ${(p.labels || '').slice(0, 100) || 'N/A'}`
    ]));
  } catch (e) {
    // try UPC lookup
    try {
      const u = await getJson(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(q)}`);
      if (u.code === 'OK' && u.items && u.items.length) {
        const it = u.items[0];
        return reply(ctx, box('📊 PRODUCT INFO', [
          `🏷️ *Name:* ${it.title}`,
          `🏢 *Brand:* ${it.brand || 'N/A'}`,
          `🏬 *Category:* ${it.category || 'N/A'}`,
          `💵 *Lowest:* ${it.lowest_recorded_price || '—'}`,
          `💵 *Highest:* ${it.highest_recorded_price || '—'}`,
          `🔢 *Barcode:* ${q}`
        ]));
      }
    } catch (e2) { /* ignore */ }
    return reply(ctx, `❌ Barcode "${q}" ka product data nahi mila.`);
  }
};

/* ---- Shipping cost ---------------------------------------------- */
handlers.shipping = async (ctx) => {
  const q = textOf(ctx).replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  if (q.length < 2) {
    return reply(ctx, box('📦 SHIPPING ESTIMATE', [
      'Format: `<weight kg> <zone>`',
      '',
      `*${ctx.prefix}shipping 2 domestic*`,
      `*${ctx.prefix}shipping 2.5 international*`,
      '',
      '_Zones: local, domestic, regional, international_'
    ]));
  }
  const w = num(q[0]);
  const zone = (q[1] || 'domestic').toLowerCase();
  if (!w) return reply(ctx, `❌ Weight sahi dein.`);
  const rates = {
    local: { base: 150, perKg: 50, days: '1-2' },
    domestic: { base: 250, perKg: 120, days: '2-5' },
    regional: { base: 900, perKg: 450, days: '5-10' },
    international: { base: 2500, perKg: 1200, days: '10-21' }
  };
  const r = rates[zone] || rates.domestic;
  const cost = r.base + r.perKg * Math.max(0, w - 0.5);
  return reply(ctx, box('📦 SHIPPING ESTIMATE', [
    `⚖️ *Weight:* ${w} kg`,
    `🌍 *Zone:* ${zone}`,
    `💵 *Estimated cost:* *PKR ${Math.round(cost).toLocaleString()}*`,
    `📅 *Delivery:* ${r.days} working days`,
    '',
    `_Base PKR ${r.base} + PKR ${r.perKg}/kg beyond 0.5kg. Courier rates vary — TCS, Leopards, DHL._`
  ]));
};

/* ---- Discount --------------------------------------------------- */
handlers.discount = async (ctx) => {
  const q = textOf(ctx).replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  const price = num(q[0]);
  const pct = num(q[1]);
  if (!price || !pct) return reply(ctx, `🏷️ *Usage:* ${ctx.prefix}discount 5000 25\n(price, discount %)`);
  const save = price * (pct / 100);
  const final = price - save;
  return reply(ctx, box('🏷️ DISCOUNT', [
    `💰 *Original:* ${price.toLocaleString()}`,
    `📉 *Discount:* ${pct}%`,
    `💸 *You save:* *${save.toLocaleString(undefined, { maximumFractionDigits: 2 })}*`,
    `✅ *Final price:* *${final.toLocaleString(undefined, { maximumFractionDigits: 2 })}*`,
    '',
    pct >= 50 ? '🔥 Yeh bara discount hai!' : pct >= 25 ? '👍 Acha deal hai.' : '🙂 Reasonable discount.'
  ]));
};

/* ---- Unit price ------------------------------------------------- */
handlers.unitprice = async (ctx) => {
  const q = textOf(ctx).replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  const price = num(q[0]);
  const qty = num(q[1]);
  const unit = q[2] || 'g';
  if (!price || !qty) return reply(ctx, `🧮 *Usage:* ${ctx.prefix}unitprice 450 500 g\n(price, quantity, unit)`);
  const per = price / qty;
  const per100 = per * 100;
  const perKg = unit === 'g' ? per * 1000 : null;
  return reply(ctx, box('🧮 UNIT PRICE', [
    `💵 *Price:* ${price}`,
    `📦 *Quantity:* ${qty} ${unit}`,
    '',
    `📊 *Per ${unit}:* *${per.toFixed(4)}*`,
    `📊 *Per 100${unit}:* ${per100.toFixed(2)}`,
    perKg ? `📊 *Per kg:* ${perKg.toFixed(2)}` : '',
    '',
    `_Compare karein doosre brands se — per-unit price sab se acha comparison hai._`
  ].filter(Boolean)));
};

/* ---- Inventory -------------------------------------------------- */
handlers.inventory = async (ctx) => {
  const key = ctx.m.sender || 'anon';
  const q = textOf(ctx);
  if (!q) return reply(ctx, `📋 *Usage:*\n${ctx.prefix}inventory add Rice 10kg\n${ctx.prefix}inventory list\n${ctx.prefix}inventory clear`);
  const inv = wishlists.get('inv:' + key) || [];
  const [action, ...rest] = q.split(/\s+/);
  const item = rest.join(' ');
  if (action === 'add' && item) { inv.push({ item, at: Date.now() }); wishlists.set('inv:' + key, inv); return reply(ctx, `✅ Added: *${item}*\n📦 Total items: ${inv.length}`); }
  if (action === 'remove' && item) {
    const i = inv.findIndex((x) => x.item.toLowerCase().includes(item.toLowerCase()));
    if (i === -1) return reply(ctx, `❌ "${item}" nahi mila.`);
    inv.splice(i, 1); wishlists.set('inv:' + key, inv);
    return reply(ctx, `🗑️ Removed: *${item}*`);
  }
  if (action === 'clear') { wishlists.delete('inv:' + key); return reply(ctx, '🗑️ Inventory clear ho gayi.'); }
  if (!inv.length) return reply(ctx, `📋 Inventory khali hai. *${ctx.prefix}inventory add <item>*`);
  return reply(ctx, box(`📋 INVENTORY (${inv.length})`, inv.map((x, i) => `${i + 1}. ${x.item}`)));
};

/* ---- Coupon ----------------------------------------------------- */
handlers.coupon = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🎟️ *Usage:* ${ctx.prefix}coupon Amazon\n${ctx.prefix}coupon Daraz`);
  const t = await ai(ctx, `Suggest realistic-sounding coupon code patterns and discount strategies for "${q}". Note clearly that actual working codes change daily and must be verified on the site. Give 5 example code patterns (e.g. SAVE20), 3 places to find real codes, and 3 tips to maximise savings. Max 200 words.`, 'You are a shopping savings expert. Never claim a code definitely works.');
  return reply(ctx, `🎟️ *COUPONS — ${q.toUpperCase()}*\n\n${t || 'Nahi mila.'}`);
};

/* ---- Price history ---------------------------------------------- */
handlers.pricehistory = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `📈 *Usage:* ${ctx.prefix}pricehistory iPhone 15`);
  const t = await ai(ctx, `Give general price history guidance for "${q}": typical launch price, how it usually depreciates over 6/12/24 months, best time of year to buy, and whether buying now vs waiting is wiser. Note that live price tracking needs sites like camelcamelcamel/pricehistoryapp. Max 200 words.`, 'You are a consumer price analyst.');
  return reply(ctx, `📈 *PRICE HISTORY — ${q.toUpperCase()}*\n\n${t || 'Nahi mila.'}`);
};

/* ---- Price alert ------------------------------------------------ */
handlers.pricealert = async (ctx) => {
  const key = ctx.m.sender || 'anon';
  const q = textOf(ctx);
  const list = alerts.get(key) || [];
  if (!q) {
    if (!list.length) return reply(ctx, `🔔 Koi alert set nahi hai.\n\n*${ctx.prefix}pricealert iPhone 15 @ 200000*`);
    return reply(ctx, box(`🔔 PRICE ALERTS (${list.length})`, list.map((a, i) => `${i + 1}. ${a.item} @ ${a.target}`)));
  }
  if (q.toLowerCase() === 'clear') { alerts.delete(key); return reply(ctx, '🗑️ Saare alerts clear.'); }
  const m = q.match(/^(.+?)\s*@\s*(\d+\.?\d*)$/);
  if (!m) return reply(ctx, `🔔 Format: ${ctx.prefix}pricealert <item> @ <target price>`);
  list.push({ item: m[1].trim(), target: parseFloat(m[2]), at: Date.now() });
  alerts.set(key, list);
  return reply(ctx, `✅ *Alert set!*\n\n📦 ${m[1].trim()}\n🎯 Target: ${m[2]}\n\n_Note: bot live price check nahi karta — yeh aap ki personal watchlist hai._`);
};

/* ---- Comparison ------------------------------------------------- */
handlers.comparison = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `⚖️ *Usage:* ${ctx.prefix}comparison iPhone 15 vs Galaxy S24`);
  const parts = q.split(/\s+vs\.?\s+|\s*\|\s*/i);
  if (parts.length < 2) return reply(ctx, `⚖️ Format: ${ctx.prefix}comparison <A> vs <B>`);
  const t = await ai(ctx, `Compare "${parts[0]}" vs "${parts[1]}". Give a table-like comparison across 6-8 criteria (price, performance, battery, camera, build, software, value), then a clear "who should buy which" verdict. Max 300 words.`, 'You are a tech product reviewer. Be balanced and specific.');
  return reply(ctx, `⚖️ *${parts[0].toUpperCase()} vs ${parts[1].toUpperCase()}*\n\n${t || 'Nahi mila.'}`);
};

/* ---- Wishlist --------------------------------------------------- */
handlers.wishlist = async (ctx) => {
  const key = ctx.m.sender || 'anon';
  const q = textOf(ctx);
  const list = wishlists.get(key) || [];
  if (!q) {
    if (!list.length) return reply(ctx, `💝 Wishlist khali hai.\n\n*${ctx.prefix}wishlist add iPhone 15*`);
    return reply(ctx, box(`💝 WISHLIST (${list.length})`, list.map((x, i) => `${i + 1}. ${x.item}`).concat(['', `_${ctx.prefix}wishlist remove <item>_`])));
  }
  const [action, ...rest] = q.split(/\s+/);
  const item = rest.join(' ');
  if (action === 'add' && item) { list.push({ item, at: Date.now() }); wishlists.set(key, list); return reply(ctx, `💝 Added to wishlist: *${item}*`); }
  if (action === 'remove' && item) {
    const i = list.findIndex((x) => x.item.toLowerCase().includes(item.toLowerCase()));
    if (i === -1) return reply(ctx, `❌ "${item}" wishlist mein nahi hai.`);
    list.splice(i, 1); wishlists.set(key, list);
    return reply(ctx, `🗑️ Removed: *${item}*`);
  }
  if (action === 'clear') { wishlists.delete(key); return reply(ctx, '🗑️ Wishlist clear.'); }
  return reply(ctx, `❓ ${ctx.prefix}wishlist add|remove|clear <item>`);
};

/* ---- Size chart ------------------------------------------------- */
const SIZE_CHARTS = {
  men_shirt: [['S', 36, 38, 28], ['M', 38, 40, 29], ['L', 40, 42, 30], ['XL', 42, 44, 31], ['XXL', 44, 46, 32]],
  women_shirt: [['XS', 32, 34, 26], ['S', 34, 36, 27], ['M', 36, 38, 28], ['L', 38, 40, 29], ['XL', 40, 42, 30]],
  shoes_men: [['6', 24, 'EU 39'], ['7', 25, 'EU 40'], ['8', 26, 'EU 41'], ['9', 27, 'EU 42'], ['10', 28, 'EU 43'], ['11', 29, 'EU 44']]
};

handlers.sizechart = async (ctx) => {
  const q = textOf(ctx).toLowerCase();
  const key = q.includes('women') || q.includes('female') ? 'women_shirt' : q.includes('shoe') ? 'shoes_men' : 'men_shirt';
  const rows = SIZE_CHARTS[key];
  const header = key === 'shoes_men' ? 'Size | CM | EU' : 'Size | Chest(in) | Waist(in) | Length(in)';
  const lines = rows.map((r) => r.join(' | '));
  return reply(ctx, box(`📏 SIZE CHART — ${key.replace('_', ' ').toUpperCase()}`, [
    header,
    '---',
    ...lines,
    '',
    `_Options: ${ctx.prefix}sizechart men | women | shoes_`,
    '_Hamesha brand-specific chart check karein._'
  ]));
};

/* ---- Warranty --------------------------------------------------- */
handlers.warranty = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🛡️ *Usage:* ${ctx.prefix}warranty iPhone 15`);
  const t = await ai(ctx, `Explain typical warranty coverage for "${q}": standard warranty length, what's covered, what's not, how to claim, extended warranty worth-it analysis, and consumer rights in Pakistan. Max 220 words.`, 'You are a consumer rights advisor.');
  return reply(ctx, `🛡️ *WARRANTY — ${q.toUpperCase()}*\n\n${t || 'Nahi mila.'}`);
};

/* ---- Store finder ----------------------------------------------- */
handlers.storefinder = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🏬 *Usage:* ${ctx.prefix}storefinder Pizza Hut Lahore`);
  const parts = q.split(/\s+/);
  const brand = parts.slice(0, -1).join(' ') || parts[0];
  const place = parts.length > 1 ? parts[parts.length - 1] : 'Karachi';
  try {
    const geo = await getJson(`https://geocode.maps.co/search?q=${encodeURIComponent(place)}`);
    if (!geo.length) throw new Error('place not found');
    const { lat, lon } = geo[0];
    const ov = await getJson(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(`[out:json][timeout:20];node["name"~"${brand}",i](around:15000,${lat},${lon});out body 10;`)}`);
    const els = (ov.elements || []).slice(0, 8);
    if (!els.length) return reply(ctx, `🏬 "${brand}" ke stores "${place}" ke qareeb nahi mile.`);
    const lines = els.map((e, i) => `${i + 1}. 🏬 *${e.tags.name || brand}*\n   📍 ${e.tags['addr:street'] || ''} ${e.tags['addr:city'] || ''}\n   🧭 ${e.lat.toFixed(5)}, ${e.lon.toFixed(5)}${e.tags.phone ? `\n   📞 ${e.tags.phone}` : ''}`);
    return reply(ctx, box(`🏬 ${brand.toUpperCase()} IN ${place.toUpperCase()}`, lines));
  } catch (e) {
    return reply(ctx, `❌ Store finder fail: ${e.message}`);
  }
};

/* ---- Duty / customs calculator ---------------------------------- */
handlers.dutycalc = async (ctx) => {
  const q = textOf(ctx).replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  const value = num(q[0]);
  const category = (q[1] || 'electronics').toLowerCase();
  if (!value) return reply(ctx, `🛃 *Usage:* ${ctx.prefix}dutycalc 50000 electronics\n\nCategories: electronics, clothing, cosmetics, food, books, jewelry, auto`);
  const rates = {
    electronics: { cd: 0.10, st: 0.17, rd: 0.03 },
    clothing: { cd: 0.20, st: 0.17, rd: 0.03 },
    cosmetics: { cd: 0.25, st: 0.17, rd: 0.03 },
    food: { cd: 0.05, st: 0.17, rd: 0.00 },
    books: { cd: 0.00, st: 0.00, rd: 0.00 },
    jewelry: { cd: 0.30, st: 0.17, rd: 0.03 },
    auto: { cd: 0.50, st: 0.17, rd: 0.03 }
  };
  const r = rates[category] || rates.electronics;
  const cd = value * r.cd;
  const st = (value + cd) * r.st;
  const rd = (value + cd) * r.rd;
  const total = value + cd + st + rd;
  return reply(ctx, box('🛃 DUTY CALCULATOR', [
    `💵 *Assessed value:* PKR ${value.toLocaleString()}`,
    `📦 *Category:* ${category}`,
    '',
    `🛃 *Customs duty (${(r.cd * 100).toFixed(0)}%):* ${cd.toLocaleString()}`,
    `📊 *Sales tax (${(r.st * 100).toFixed(0)}%):* ${st.toLocaleString()}`,
    `📊 *Regulatory duty (${(r.rd * 100).toFixed(0)}%):* ${rd.toLocaleString()}`,
    '',
    `✅ *Total landed cost:* *PKR ${total.toLocaleString()}*`,
    '',
    `_Indicative only. Actual rates FBR tariff se confirm karein._`
  ]));
};

/* ---- Return policy ---------------------------------------------- */
handlers.returnpolicy = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🔄 *Usage:* ${ctx.prefix}returnpolicy Daraz`);
  const t = await ai(ctx, `Explain typical return/refund policy for "${q}": return window, condition requirements, non-returnable items, refund timeline, how to initiate, and 3 tips to make returns smooth. Note that policies change — check the site. Max 220 words.`, 'You are a consumer protection advisor.');
  return reply(ctx, `🔄 *RETURN POLICY — ${q.toUpperCase()}*\n\n${t || 'Nahi mila.'}`);
};

module.exports = { handlers, wishlists, alerts };
