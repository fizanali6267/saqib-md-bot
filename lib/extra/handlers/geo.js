'use strict';
/**
 * Geolocation handlers (18 commands).
 * geocode, reversegeo, timezone, flighttrack, distancematrix, countryinfo,
 * sunrise, airquality, hotelsearch, traveledvisory, radar, cityguide,
 * embassy, roadconditions, timegap, zipcode, elevation, geolocation
 */
const U = require('../util');

const { textOf, need, reply, ai, box, getJson, getText, pick } = U;

const handlers = {};

/* ---- Geocode ----------------------------------------------------- */
handlers.geocode = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🔎 *Usage:* ${ctx.prefix}geocode Lahore, Pakistan`);
  try {
    const r = await getJson(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1`, {
      headers: { 'User-Agent': 'SAQIB-MD-Bot/1.0' }
    });
    if (!r.length) return reply(ctx, `❌ "${q}" ka location nahi mila.`);
    const lines = r.map((x, i) => `${i + 1}. 📍 *${x.display_name}*\n   📌 Lat: ${x.lat} | Lon: ${x.lon}\n   🏷️ Type: ${x.type || 'N/A'}`);
    return reply(ctx, box(`🗺️ GEOCODE — ${q.toUpperCase()}`, lines));
  } catch (e) {
    return reply(ctx, `❌ Geocode fail: ${e.message}`);
  }
};

/* ---- Reverse geocode --------------------------------------------- */
handlers.reversegeo = async (ctx) => {
  const q = textOf(ctx).replace(/\s+/g, ' ');
  const m = q.match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/);
  if (!m) return reply(ctx, `🔎 *Usage:* ${ctx.prefix}reversegeo 31.5204,74.3587`);
  const lat = m[1], lon = m[2];
  try {
    const r = await getJson(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&zoom=18`, {
      headers: { 'User-Agent': 'SAQIB-MD-Bot/1.0' }
    });
    if (!r || !r.address) return reply(ctx, `❌ Is coordinate ka address nahi mila.`);
    const a = r.address;
    return reply(ctx, box('📍 REVERSE GEOCODE', [
      `🌍 *Full:* ${r.display_name}`,
      `🏠 *House:* ${a.house_number || '—'}`,
      `🛣️ *Road:* ${a.road || '—'}`,
      `🏘️ *Area:* ${a.suburb || a.neighbourhood || '—'}`,
      `🏙️ *City:* ${a.city || a.town || a.village || '—'}`,
      `🗺️ *District:* ${a.county || '—'}`,
      `📍 *State:* ${a.state || '—'}`,
      `🌐 *Country:* ${a.country || '—'} (${a.country_code ? a.country_code.toUpperCase() : '—'})`,
      `📮 *Postcode:* ${a.postcode || '—'}`,
      `🧭 *Coords:* ${lat}, ${lon}`
    ]));
  } catch (e) {
    return reply(ctx, `❌ Reverse geocode fail: ${e.message}`);
  }
};

/* ---- Timezone ---------------------------------------------------- */
handlers.timezone = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🔎 *Usage:* ${ctx.prefix}timezone Karachi`);
  try {
    const geo = await getJson(`https://geocode.maps.co/search?q=${encodeURIComponent(q)}`);
    if (!geo.length) return reply(ctx, `❌ "${q}" nahi mila.`);
    const { lat, lon } = geo[0];
    const tz = await getJson(`https://api.timezonedb.com/v2.1/get-time-zone?key=DEMO&format=json&by=position&lat=${lat}&lng=${lon}`);
    if (tz.status !== 'OK') throw new Error(tz.message || 'tz fail');
    return reply(ctx, box('🕐 TIMEZONE', [
      `📍 *Place:* ${String(geo[0].display_name).split(',').slice(0, 3).join(',')}`,
      `🌍 *Zone:* ${tz.zoneName}`,
      `⏰ *Local time:* ${tz.formatted}`,
      `🔢 *UTC offset:* ${(tz.gmtOffset / 3600).toFixed(1)} hours`,
      `☀️ *DST:* ${tz.dst === '1' ? 'Active' : 'Inactive'}`,
      `📅 *Abbrev:* ${tz.abbreviation}`
    ]));
  } catch (e) {
    // fallback with Intl
    try {
      const geo = await getJson(`https://geocode.maps.co/search?q=${encodeURIComponent(q)}`);
      const { lat, lon } = geo[0];
      const tzr = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&timezone=auto`);
      return reply(ctx, box('🕐 TIMEZONE', [
        `📍 ${String(geo[0].display_name).split(',').slice(0, 3).join(',')}`,
        `🌍 *Zone:* ${tzr.timezone}`,
        `⏰ *Local time:* ${tzr.current.time}`,
        `🔢 *UTC offset:* ${tzr.utc_offset_seconds / 3600} hours`
      ]));
    } catch (e2) {
      return reply(ctx, `❌ Timezone fail: ${e.message}`);
    }
  }
};

/* ---- Flight tracking --------------------------------------------- */
handlers.flighttrack = async (ctx) => {
  const q = textOf(ctx).toUpperCase().replace(/\s+/g, '');
  if (!q) return reply(ctx, `✈️ *Usage:* ${ctx.prefix}flighttrack PK301`);
  try {
    const d = await getJson(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(q)}`);
    if (!d.response || !d.response.flightroute) throw new Error('not found');
    const r = d.response.flightroute;
    return reply(ctx, box(`✈️ FLIGHT ${q}`, [
      `🛫 *From:* ${r.origin.iata_code} — ${r.origin.name} (${r.origin.municipality})`,
      `🛬 *To:* ${r.destination.iata_code} — ${r.destination.name} (${r.destination.municipality})`,
      `🏢 *Airline:* ${r.airline ? r.airline.name : 'N/A'}`,
      `🌍 *Country:* ${r.origin.country_name} → ${r.destination.country_name}`,
      '',
      `_Live position ke liye flightradar24.com/${q} dekhein._`
    ]));
  } catch (e) {
    return reply(ctx, `❌ Flight "${q}" nahi mila. Callsign format check karein (e.g. PK301, EK624).`);
  }
};

/* ---- Distance matrix --------------------------------------------- */
function haversine(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

handlers.distancematrix = async (ctx) => {
  const q = textOf(ctx);
  const parts = q.split(/\s+to\s+|\s*\|\s*|\s*->\s*/i);
  if (parts.length < 2) return reply(ctx, `📏 *Usage:* ${ctx.prefix}distancematrix Lahore to Karachi`);
  try {
    const [g1, g2] = await Promise.all(parts.slice(0, 2).map((p) => getJson(`https://geocode.maps.co/search?q=${encodeURIComponent(p.trim())}`)));
    if (!g1.length || !g2.length) return reply(ctx, `❌ Ek ya dono jagah nahi mili.`);
    const A = { lat: parseFloat(g1[0].lat), lon: parseFloat(g1[0].lon) };
    const B = { lat: parseFloat(g2[0].lat), lon: parseFloat(g2[0].lon) };
    const km = haversine(A, B);
    return reply(ctx, box('📏 DISTANCE', [
      `📍 *A:* ${String(g1[0].display_name).split(',').slice(0, 2).join(',')}`,
      `📍 *B:* ${String(g2[0].display_name).split(',').slice(0, 2).join(',')}`,
      `📐 *Straight line:* ${km.toFixed(1)} km (${(km * 0.621371).toFixed(1)} miles)`,
      `🚗 *Road (approx):* ${(km * 1.25).toFixed(0)} km`,
      `✈️ *Flight time:* ~${Math.max(0.5, km / 800).toFixed(1)} hours`,
      `🚶 *Walking:* ~${(km / 5).toFixed(0)} hours`
    ]));
  } catch (e) {
    return reply(ctx, `❌ Distance fail: ${e.message}`);
  }
};

/* ---- Country info ------------------------------------------------ */
handlers.countryinfo = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🌍 *Usage:* ${ctx.prefix}countryinfo Pakistan`);
  try {
    const d = await getJson(`https://restcountries.com/v3.1/name/${encodeURIComponent(q)}?fullText=false`);
    const c = d[0];
    const curr = c.currencies ? Object.entries(c.currencies).map(([k, v]) => `${v.name} (${k} ${v.symbol || ''})`).join(', ') : 'N/A';
    const langs = c.languages ? Object.values(c.languages).join(', ') : 'N/A';
    return reply(ctx, box(`🌍 ${c.name.common.toUpperCase()}`, [
      `🏛️ *Official:* ${c.name.official}`,
      `🏙️ *Capital:* ${(c.capital || ['N/A'])[0]}`,
      `🌐 *Region:* ${c.region} — ${c.subregion || ''}`,
      `👥 *Population:* ${c.population.toLocaleString()}`,
      `📐 *Area:* ${c.area.toLocaleString()} km²`,
      `💵 *Currency:* ${curr}`,
      `🗣️ *Languages:* ${langs}`,
      `🕐 *Timezones:* ${(c.timezones || []).join(', ')}`,
      `📞 *Calling code:* +${(c.idd.root || '').replace('+', '')}${(c.idd.suffixes || [''])[0]}`,
      `🚗 *Driving side:* ${c.car ? c.car.side : 'N/A'}`,
      `🔤 *TLD:* ${(c.tld || []).join(', ')}`,
      `🗺️ *Maps:* ${c.maps ? c.maps.googleMaps : ''}`,
      c.coatOfArms && c.coatOfArms.png ? '' : ''
    ].filter(Boolean)));
  } catch (e) {
    return reply(ctx, `❌ Country "${q}" nahi mila.`);
  }
};

/* ---- Sunrise / sunset -------------------------------------------- */
handlers.sunrise = async (ctx) => {
  const q = textOf(ctx) || 'Karachi';
  try {
    const geo = await getJson(`https://geocode.maps.co/search?q=${encodeURIComponent(q)}`);
    if (!geo.length) return reply(ctx, `❌ "${q}" nahi mila.`);
    const { lat, lon } = geo[0];
    const d = await getJson(`https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&formatted=0`);
    const r = d.results;
    const f = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
    return reply(ctx, box('🌅 SUN TIMES', [
      `📍 *Place:* ${String(geo[0].display_name).split(',').slice(0, 2).join(',')}`,
      `🌅 *Sunrise:* ${f(r.sunrise)} UTC`,
      `🌇 *Sunset:* ${f(r.sunset)} UTC`,
      `☀️ *Solar noon:* ${f(r.solar_noon)} UTC`,
      `⏳ *Day length:* ${Math.floor(r.day_length / 3600)}h ${Math.floor((r.day_length % 3600) / 60)}m`,
      `🌄 *Civil twilight:* ${f(r.civil_twilight_begin)} — ${f(r.civil_twilight_end)} UTC`,
      `🌌 *Nautical:* ${f(r.nautical_twilight_begin)} — ${f(r.nautical_twilight_end)} UTC`,
      `🔭 *Astronomical:* ${f(r.astronomical_twilight_begin)} — ${f(r.astronomical_twilight_end)} UTC`
    ]));
  } catch (e) {
    return reply(ctx, `❌ Sun times fail: ${e.message}`);
  }
};

/* ---- Air quality ------------------------------------------------- */
handlers.airquality = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🌫️ *Usage:* ${ctx.prefix}airquality Lahore`);
  try {
    const geo = await getJson(`https://geocode.maps.co/search?q=${encodeURIComponent(q)}`);
    if (!geo.length) return reply(ctx, `❌ "${q}" nahi mila.`);
    const { lat, lon } = geo[0];
    const d = await getJson(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi,european_aqi`);
    const c = d.current;
    const aqi = c.us_aqi;
    const level = aqi <= 50 ? '🟢 Good' : aqi <= 100 ? '🟡 Moderate' : aqi <= 150 ? '🟠 Unhealthy (sensitive)' : aqi <= 200 ? '🔴 Unhealthy' : aqi <= 300 ? '🟣 Very Unhealthy' : '⚫ Hazardous';
    return reply(ctx, box('🌫️ AIR QUALITY', [
      `📍 *Place:* ${String(geo[0].display_name).split(',').slice(0, 2).join(',')}`,
      `📊 *US AQI:* *${aqi}* — ${level}`,
      `🇪🇺 *EU AQI:* ${c.european_aqi}`,
      '',
      `💨 *PM2.5:* ${c.pm2_5} µg/m³`,
      `💨 *PM10:* ${c.pm10} µg/m³`,
      `☠️ *CO:* ${c.carbon_monoxide} µg/m³`,
      `🌫️ *NO₂:* ${c.nitrogen_dioxide} µg/m³`,
      `🌫️ *SO₂:* ${c.sulphur_dioxide} µg/m³`,
      `🌫️ *O₃:* ${c.ozone} µg/m³`
    ]));
  } catch (e) {
    return reply(ctx, `❌ Air quality fail: ${e.message}`);
  }
};

/* ---- Hotel search ------------------------------------------------ */
handlers.hotelsearch = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🏨 *Usage:* ${ctx.prefix}hotelsearch Murree`);
  try {
    const geo = await getJson(`https://geocode.maps.co/search?q=${encodeURIComponent(q)}`);
    if (!geo.length) return reply(ctx, `❌ "${q}" nahi mila.`);
    const { lat, lon } = geo[0];
    const ov = await getJson(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(`[out:json][timeout:20];node["tourism"="hotel"](around:8000,${lat},${lon});out body 15;`)}`);
    const els = (ov.elements || []).slice(0, 12);
    if (!els.length) return reply(ctx, `🏨 "${q}" ke qareeb koi hotel OSM par nahi mila.`);
    const lines = els.map((e, i) => {
      const t = e.tags || {};
      return `${i + 1}. 🏨 *${t.name || 'Unnamed hotel'}*\n   ⭐ ${t.stars || t['stars'] || '—'} | 📞 ${t.phone || '—'} | 🌐 ${t.website ? t.website.replace(/^https?:\/\//, '').slice(0, 40) : '—'}`;
    });
    return reply(ctx, box(`🏨 HOTELS NEAR ${q.toUpperCase()}`, lines.concat(['', '_Source: OpenStreetMap_'])));
  } catch (e) {
    return reply(ctx, `❌ Hotel search fail: ${e.message}`);
  }
};

/* ---- Travel advisory --------------------------------------------- */
handlers.traveledvisory = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `✈️ *Usage:* ${ctx.prefix}traveledvisory Pakistan`);
  const t = await ai(ctx, `Give a concise travel advisory for ${q} (6-10 bullet points): safety level, areas to avoid, health precautions, visa notes, local customs, emergency numbers, best time to visit, and money/connectivity tips. Be factual and neutral; note that official advisories should be checked.`, 'You are a travel safety advisor.');
  return reply(ctx, t || `✈️ Official advisories: travel.state.gov (US), gov.uk/foreign-travel-advice (UK), mofa.gov.pk (Pakistan).`);
};

/* ---- Radar ------------------------------------------------------- */
handlers.radar = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `📡 *Usage:* ${ctx.prefix}radar Lahore`);
  try {
    const geo = await getJson(`https://geocode.maps.co/search?q=${encodeURIComponent(q)}`);
    if (!geo.length) return reply(ctx, `❌ "${q}" nahi mila.`);
    const { lat, lon } = geo[0];
    const url = `https://static.rainviewer.com/maps/radar/latest.png`;
    const caption = `📡 *WEATHER RADAR*\n\n📍 ${String(geo[0].display_name).split(',').slice(0, 2).join(',')}\n🧭 ${lat}, ${lon}\n\n🔗 Live radar: https://www.rainviewer.com/map.html#7/${lat}/${lon}&amp;o&amp;c=6\n🔗 Windy: https://www.windy.com/${lat}/${lon}`;
    try {
      return await ctx.sock.sendMessage(ctx.m.chat, { image: { url }, caption }, { quoted: ctx.m });
    } catch (e) {
      return reply(ctx, caption);
    }
  } catch (e) {
    return reply(ctx, `❌ Radar fail: ${e.message}`);
  }
};

/* ---- City guide -------------------------------------------------- */
handlers.cityguide = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🏙️ *Usage:* ${ctx.prefix}cityguide Istanbul`);
  const t = await ai(ctx, `Write a compact city guide for ${q} (max 250 words). Include: 1-line intro, top 5 must-see places, 3 local foods to try, best neighbourhoods to stay, getting around, best season to visit, and one local etiquette tip. Use short bullet points with emojis.`, 'You are a knowledgeable local travel guide.');
  return reply(ctx, t || `🏙️ City guide unavailable.`);
};

/* ---- Embassy ----------------------------------------------------- */
handlers.embassy = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🏛️ *Usage:* ${ctx.prefix}embassy Pakistan in UAE`);
  try {
    const d = await getJson(`https://restcountries.com/v3.1/name/${encodeURIComponent(q.split(/\s+in\s+/i)[0])}?fields=name,embassies`);
    const c = d[0];
    const emb = (c.embassies || []).slice(0, 20).map((e) => `• ${e}`).join('\n');
    return reply(ctx, box(`🏛️ EMBASSIES OF ${c.name.common.toUpperCase()}`, [
      emb || 'Koi embassy data nahi mila.',
      '',
      `_${ctx.prefix}embassy <country>_`
    ]));
  } catch (e) {
    return reply(ctx, `❌ Embassy lookup fail: ${e.message}`);
  }
};

/* ---- Road conditions --------------------------------------------- */
handlers.roadconditions = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🛣️ *Usage:* ${ctx.prefix}roadconditions Murree`);
  const t = await ai(ctx, `Give current-style road condition guidance for ${q} in Pakistan (or generic if unclear): likely traffic, weather hazards by season, road quality, checkpoints, fuel availability, and safety tips. 6-8 short bullets. Note that live conditions should be verified with local authorities (NHA, Motorway Police 130).`, 'You are a road-trip safety advisor for Pakistan.');
  return reply(ctx, t || `🛣️ Live road info: Motorway Police 130, NHA helpline.`);
};

/* ---- Time gap ---------------------------------------------------- */
handlers.timegap = async (ctx) => {
  const q = textOf(ctx);
  const parts = q.split(/\s+to\s+|\s*\|\s*|\s*->\s*/i);
  if (parts.length < 2) return reply(ctx, `🕐 *Usage:* ${ctx.prefix}timegap Karachi to London`);
  try {
    const tzs = await Promise.all(parts.slice(0, 2).map(async (p) => {
      const geo = await getJson(`https://geocode.maps.co/search?q=${encodeURIComponent(p.trim())}`);
      if (!geo.length) throw new Error(`"${p}" not found`);
      const { lat, lon } = geo[0];
      const w = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&timezone=auto`);
      return { name: p.trim(), tz: w.timezone, offset: w.utc_offset_seconds / 3600 };
    }));
    const diff = tzs[1].offset - tzs[0].offset;
    return reply(ctx, box('🕐 TIME GAP', [
      `📍 *${tzs[0].name}:* ${tzs[0].tz} (UTC${tzs[0].offset >= 0 ? '+' : ''}${tzs[0].offset})`,
      `📍 *${tzs[1].name}:* ${tzs[1].tz} (UTC${tzs[1].offset >= 0 ? '+' : ''}${tzs[1].offset})`,
      '',
      `⏱️ *Difference:* ${Math.abs(diff)} hours`,
      diff === 0 ? '✅ Dono jagah ka waqt same hai.' : `${tzs[1].name} ${diff > 0 ? 'aage' : 'peeche'} hai ${tzs[0].name} se.`
    ]));
  } catch (e) {
    return reply(ctx, `❌ Time gap fail: ${e.message}`);
  }
};

/* ---- Zip code ---------------------------------------------------- */
handlers.zipcode = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `📮 *Usage:* ${ctx.prefix}zipcode 54000\n${ctx.prefix}zipcode 10001 US`);
  const parts = q.split(/\s+/);
  const code = parts[0];
  const country = (parts[1] || '').toUpperCase();
  try {
    if (country === 'US' || /^\d{5}$/.test(code)) {
      const d = await getJson(`https://api.zippopotam.us/us/${code}`);
      const p = d.places[0];
      return reply(ctx, box('📮 ZIP CODE', [
        `📮 *ZIP:* ${d['post code']}`,
        `🏙️ *Place:* ${p['place name']}`,
        `📍 *State:* ${p.state} (${p['state abbreviation']})`,
        `🧭 *Coords:* ${p.latitude}, ${p.longitude}`
      ]));
    }
    throw new Error('unsupported');
  } catch (e) {
    // fallback: geocode the postal code
    try {
      const g = await getJson(`https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(code)}&format=json&limit=5&addressdetails=1`, { headers: { 'User-Agent': 'SAQIB-MD-Bot/1.0' } });
      if (!g.length) return reply(ctx, `❌ Postal code "${code}" nahi mila.`);
      const lines = g.map((x, i) => `${i + 1}. ${x.display_name}\n   🧭 ${x.lat}, ${x.lon}`);
      return reply(ctx, box(`📮 POSTAL CODE ${code}`, lines));
    } catch (e2) {
      return reply(ctx, `❌ Zip lookup fail: ${e.message}`);
    }
  }
};

/* ---- Elevation --------------------------------------------------- */
handlers.elevation = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `⛰️ *Usage:* ${ctx.prefix}elevation K2\n${ctx.prefix}elevation 35.88,74.47`);
  const m = q.match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/);
  let lat, lon, label = q;
  if (m) {
    lat = m[1]; lon = m[2];
  } else {
    try {
      const g = await getJson(`https://geocode.maps.co/search?q=${encodeURIComponent(q)}`);
      if (!g.length) return reply(ctx, `❌ "${q}" nahi mila.`);
      lat = g[0].lat; lon = g[0].lon;
      label = String(g[0].display_name).split(',').slice(0, 2).join(',');
    } catch (e) {
      return reply(ctx, `❌ Elevation fail: ${e.message}`);
    }
  }
  try {
    const d = await getJson(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`);
    const el = d.results[0].elevation;
    return reply(ctx, box('⛰️ ELEVATION', [
      `📍 *Place:* ${label}`,
      `🧭 *Coords:* ${lat}, ${lon}`,
      `⛰️ *Elevation:* *${el} m* (${(el * 3.28084).toFixed(0)} ft)`,
      '',
      el > 4000 ? '🏔️ Bohat uncha — high altitude!' : el > 1000 ? '⛰️ Pahari ilaqa.' : el < 0 ? '🌊 Sea level se neeche.' : '🌱 Plain area.'
    ]));
  } catch (e) {
    return reply(ctx, `❌ Elevation API fail: ${e.message}`);
  }
};

/* ---- Geolocation (IP based) -------------------------------------- */
handlers.geolocation = async (ctx) => {
  const q = textOf(ctx).trim();
  try {
    const url = q ? `http://ip-api.com/json/${encodeURIComponent(q)}?fields=status,message,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,query` : `http://ip-api.com/json/?fields=status,message,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,query`;
    const d = await getJson(url);
    if (d.status !== 'success') return reply(ctx, `❌ IP lookup fail: ${d.message || 'unknown'}`);
    return reply(ctx, box('🌐 IP GEOLOCATION', [
      `🔢 *IP:* ${d.query}`,
      `🌍 *Country:* ${d.country} (${d.countryCode})`,
      `📍 *Region:* ${d.regionName}`,
      `🏙️ *City:* ${d.city}`,
      `📮 *ZIP:* ${d.zip || '—'}`,
      `🧭 *Coords:* ${d.lat}, ${d.lon}`,
      `🕐 *Timezone:* ${d.timezone}`,
      `📡 *ISP:* ${d.isp}`,
      `🏢 *Org:* ${d.org}`,
      `🔗 *AS:* ${d.as}`
    ]));
  } catch (e) {
    return reply(ctx, `❌ Geolocation fail: ${e.message}`);
  }
};

module.exports = { handlers, haversine };
