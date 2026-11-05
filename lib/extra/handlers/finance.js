/**
 * FINANCE & CRYPTOCURRENCY handlers (24 commands).
 * Uses free public endpoints (CoinGecko, Yahoo, open.er-api, Binance, alternative.me).
 */

const U = require('../util');

const num = (v) => Number(String(v).replace(/[^0-9.\-]/g, ''));

async function coinPrice(id, vs = 'usd') {
  const d = await U.getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=${vs}&include_24hr_change=true&include_market_cap=true`);
  return d[id];
}

async function findCoin(query) {
  const list = await U.getJson('https://api.coingecko.com/api/v3/coins/list');
  const q = query.toLowerCase().trim();
  return list.find((c) => c.id === q) || list.find((c) => c.symbol === q) || list.find((c) => c.name.toLowerCase() === q) || list.find((c) => c.name.toLowerCase().includes(q));
}

async function fxRates(base) {
  const d = await U.getJson(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`);
  if (d.result !== 'success') throw new Error('FX lookup failed');
  return d.rates;
}

function chartUrl(config) {
  return `https://quickchart.io/chart?width=700&height=380&c=${encodeURIComponent(JSON.stringify(config))}`;
}

const handlers = {
  async stock(ctx) {
    const q = await U.need(ctx, 'stock <ticker>  e.g. AAPL');
    if (!q) return;
    const sym = q.trim().toUpperCase();
    try {
      const d = await U.getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=5m`);
      const r = d.chart.result[0];
      const meta = r.meta;
      const price = meta.regularMarketPrice;
      const prev = meta.chartPreviousClose || meta.previousClose;
      const chg = price - prev;
      const pct = (chg / prev) * 100;
      await ctx.m.reply(U.box(`📈 ${sym}`, [
        `💰 Price: ${meta.currency} ${price.toFixed(2)}`,
        `${chg >= 0 ? '🟢' : '🔴'} Change: ${chg.toFixed(2)} (${pct.toFixed(2)}%)`,
        `📊 Day high: ${meta.regularMarketDayHigh || '—'}`,
        `📉 Day low: ${meta.regularMarketDayLow || '—'}`,
        `🏛️ Exchange: ${meta.exchangeName || '—'}`,
        `🕐 ${new Date().toUTCString()}`
      ]));
    } catch (e) {
      await ctx.m.reply(`❌ Could not fetch ${sym}. Check the ticker symbol.`);
    }
  },

  async crypto(ctx) {
    const q = (U.textOf(ctx) || 'bitcoin').split(/\s+/)[0];
    const vs = (U.textOf(ctx).split(/\s+/)[1] || 'usd').toLowerCase();
    try {
      const coin = await findCoin(q);
      if (!coin) return ctx.m.reply(`❌ Coin not found: ${q}`);
      const p = await coinPrice(coin.id, vs);
      if (!p) return ctx.m.reply('❌ No price data.');
      const chg = p[`${vs}_24h_change`];
      await ctx.m.reply(U.box(`🪙 ${coin.name} (${coin.symbol.toUpperCase()})`, [
        `💵 Price: ${vs.toUpperCase()} ${p[vs]}`,
        `${chg >= 0 ? '🟢' : '🔴'} 24h: ${chg ? chg.toFixed(2) : '—'}%`,
        `🏦 Market cap: ${p[`${vs}_market_cap`] ? p[`${vs}_market_cap`].toLocaleString() : '—'}`,
        `🔗 coingecko.com/en/coins/${coin.id}`
      ]));
    } catch (e) {
      await ctx.m.reply(`❌ Crypto lookup failed: ${e.message}`);
    }
  },

  async gasfee(ctx) {
    try {
      const d = await U.getJson('https://api.owlracle.info/v4/eth/gas?apikey=&blocks=5', { timeout: 12000 });
      const s = d.speeds && d.speeds[0];
      await ctx.m.reply(U.box('⛽ ETH GAS', [
        `🐢 Slow: ${s.low} gwei`,
        `🚗 Average: ${s.avg} gwei`,
        `🚀 Fast: ${s.high} gwei`,
        `📦 Block: ${d.block || '—'}`
      ]));
    } catch (e) {
      await ctx.m.reply('❌ Gas oracle unavailable right now.');
    }
  },

  async nftfloor(ctx) {
    const q = await U.need(ctx, 'nftfloor <collection>');
    if (!q) return;
    try {
      const list = await U.getJson('https://api.coingecko.com/api/v3/nfts/list?per_page=250');
      const hit = list.find((n) => n.name.toLowerCase().includes(q.toLowerCase()) || n.id.includes(q.toLowerCase()));
      if (!hit) return ctx.m.reply('❌ Collection not found on CoinGecko.');
      const d = await U.getJson(`https://api.coingecko.com/api/v3/nfts/${hit.id}`);
      await ctx.m.reply(U.box(`🖼️ ${d.name}`, [
        `🏷️ Floor: ${d.floor_price ? d.floor_price.native_currency + ' ' + (d.native_currency_symbol || '') : '—'}`,
        `💵 USD: ${d.floor_price ? d.floor_price.usd : '—'}`,
        `📊 24h volume: ${d.volume_24h ? d.volume_24h.usd : '—'}`,
        `🔗 ${d.links && d.links.homepage ? d.links.homepage : ''}`
      ]));
    } catch (e) {
      await ctx.m.reply(`❌ NFT lookup failed: ${e.message}`);
    }
  },

  async converter(ctx) {
    const raw = U.textOf(ctx).split(/\s+/);
    if (raw.length < 3) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}converter <amount> <from> <to>\nExample: ${ctx.prefix}converter 100 USD PKR`);
    const amount = num(raw[0]);
    const from = raw[1].toUpperCase();
    const to = raw[2].toUpperCase();
    try {
      const rates = await fxRates(from);
      const rate = rates[to];
      if (!rate) return ctx.m.reply(`❌ Unknown currency: ${to}`);
      await ctx.m.reply(`💱 *${amount} ${from} = ${(amount * rate).toFixed(2)} ${to}*\n\n📊 Rate: 1 ${from} = ${rate} ${to}\n🕐 ${new Date().toUTCString()}`);
    } catch (e) {
      await ctx.m.reply(`❌ Conversion failed: ${e.message}`);
    }
  },

  async forex(ctx) {
    const raw = U.textOf(ctx).split(/\s+/);
    if (raw.length < 2) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}forex <from> <to>`);
    const from = raw[0].toUpperCase();
    const to = raw[1].toUpperCase();
    try {
      const rates = await fxRates(from);
      if (!rates[to]) return ctx.m.reply(`❌ Unknown pair ${from}/${to}`);
      await ctx.m.reply(`💱 *1 ${from} = ${rates[to]} ${to}*\n🕐 ${new Date().toUTCString()}`);
    } catch (e) {
      await ctx.m.reply(`❌ Forex lookup failed: ${e.message}`);
    }
  },

  async currencybycountry(ctx) {
    const q = await U.need(ctx, 'currencybycountry <country>');
    if (!q) return;
    await U.aiReply(ctx, q, 'State the official currency of this country (name, ISO code, symbol) and 3 useful exchange-rate facts. Keep it under 8 lines.');
  },

  async loancalc(ctx) {
    const a = U.textOf(ctx).split(/\s+/).map(num);
    if (a.length < 3) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}loancalc <principal> <annual rate %> <years>`);
    const [p, r, y] = a;
    const i = r / 100 / 12;
    const n = y * 12;
    const emi = i === 0 ? p / n : (p * i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
    await ctx.m.reply(U.box('🏦 LOAN CALCULATOR', [
      `Principal: ${U.money(p)}`,
      `Rate: ${r}% per year`,
      `Tenure: ${y} years (${n} months)`,
      `📅 Monthly EMI: ${U.money(emi)}`,
      `💵 Total payable: ${U.money(emi * n)}`,
      `📈 Total interest: ${U.money(emi * n - p)}`
    ]));
  },

  async mortgage(ctx) { return handlers.loancalc(ctx); },

  async compound(ctx) {
    const a = U.textOf(ctx).split(/\s+/).map(num);
    if (a.length < 3) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}compound <principal> <annual rate %> <years> [times/year]`);
    const [p, r, y, t = 1] = a;
    const amount = p * Math.pow(1 + r / 100 / t, t * y);
    await ctx.m.reply(U.box('📈 COMPOUND INTEREST', [
      `Principal: ${U.money(p)}`,
      `Rate: ${r}% · ${y} years · ${t}x/year`,
      `💰 Maturity: ${U.money(amount)}`,
      `✨ Interest earned: ${U.money(amount - p)}`
    ]));
  },

  async savings(ctx) {
    const a = U.textOf(ctx).split(/\s+/).map(num);
    if (a.length < 3) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}savings <monthly deposit> <annual rate %> <years>`);
    const [m, r, y] = a;
    const i = r / 100 / 12;
    const n = y * 12;
    const fv = i === 0 ? m * n : m * ((Math.pow(1 + i, n) - 1) / i);
    await ctx.m.reply(U.box('🏦 SAVINGS PLAN', [
      `Monthly: ${U.money(m)}`,
      `Rate: ${r}% · ${y} years`,
      `💰 Future value: ${U.money(fv)}`,
      `📥 Total deposited: ${U.money(m * n)}`,
      `✨ Interest: ${U.money(fv - m * n)}`
    ]));
  },

  async dividend(ctx) {
    const a = U.textOf(ctx).split(/\s+/).map(num);
    if (a.length < 3) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}dividend <shares> <price per share> <annual dividend per share>`);
    const [sh, price, dps] = a;
    const invested = sh * price;
    const annual = sh * dps;
    await ctx.m.reply(U.box('💵 DIVIDEND YIELD', [
      `Shares: ${sh} @ ${U.money(price)}`,
      `Invested: ${U.money(invested)}`,
      `Annual dividend: ${U.money(annual)}`,
      `📈 Yield: ${((annual / invested) * 100).toFixed(2)}%`,
      `📅 Monthly income: ${U.money(annual / 12)}`
    ]));
  },

  async 'break-even'(ctx) {
    const a = U.textOf(ctx).split(/\s+/).map(num);
    if (a.length < 2) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}break-even <fixed costs> <contribution per unit>`);
    const [fixed, per] = a;
    await ctx.m.reply(`⚖️ *Break-even*\n\nUnits needed: *${Math.ceil(fixed / per)}*\nFixed costs: ${U.money(fixed)}\nContribution/unit: ${U.money(per)}`);
  },

  async roi(ctx) {
    const a = U.textOf(ctx).split(/\s+/).map(num);
    if (a.length < 2) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}roi <invested> <returned>`);
    const [inv, ret] = a;
    const profit = ret - inv;
    await ctx.m.reply(`📊 *ROI*\n\nInvested: ${U.money(inv)}\nReturned: ${U.money(ret)}\nProfit: ${U.money(profit)}\n📈 ROI: *${((profit / inv) * 100).toFixed(2)}%*`);
  },

  async tipcalc(ctx) {
    const a = U.textOf(ctx).split(/\s+/).map(num);
    if (!a.length || !a[0]) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}tipcalc <bill> [tip %]`);
    const bill = a[0];
    const tip = a[1] || 10;
    const tipAmt = bill * tip / 100;
    await ctx.m.reply(`🍽️ *Tip Calculator*\n\nBill: ${U.money(bill)}\nTip (${tip}%): ${U.money(tipAmt)}\nTotal: *${U.money(bill + tipAmt)}*`);
  },

  async retirement(ctx) {
    const a = U.textOf(ctx).split(/\s+/).map(num);
    if (a.length < 3) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}retirement <current age> <retire age> <monthly saving> [return %]`);
    const [age, retire, monthly, rate = 8] = a;
    const years = retire - age;
    const i = rate / 100 / 12;
    const n = years * 12;
    const fv = i === 0 ? monthly * n : monthly * ((Math.pow(1 + i, n) - 1) / i);
    await ctx.m.reply(U.box('🏖️ RETIREMENT PROJECTION', [
      `Years to save: ${years}`,
      `Monthly: ${U.money(monthly)}`,
      `Expected return: ${rate}%`,
      `💰 Corpus at ${retire}: ${U.money(fv)}`,
      `📅 Monthly pension (4% rule): ${U.money(fv * 0.04 / 12)}`
    ]));
  },

  async portfolio(ctx) {
    const raw = await U.need(ctx, 'portfolio <coin:amount, coin:amount>');
    if (!raw) return;
    const items = raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    const lines = [];
    let total = 0;
    for (const item of items) {
      const [name, amt] = item.split(/[:=]/).map((s) => (s || '').trim());
      const amount = num(amt);
      if (!name || !amount) continue;
      try {
        const coin = await findCoin(name);
        if (!coin) { lines.push(`❌ ${name}: not found`); continue; }
        const p = await coinPrice(coin.id);
        const value = p.usd * amount;
        total += value;
        lines.push(`• ${coin.symbol.toUpperCase()}: ${amount} × $${p.usd} = $${value.toFixed(2)}`);
      } catch (_) { lines.push(`❌ ${name}: lookup failed`); }
    }
    lines.push('', `💰 *Total: $${total.toFixed(2)}*`);
    await ctx.m.reply(`📊 *Portfolio*\n\n${lines.join('\n')}`);
  },

  async marketcap(ctx) {
    const q = (U.textOf(ctx) || 'bitcoin').trim();
    try {
      const coin = await findCoin(q);
      if (!coin) return ctx.m.reply('❌ Coin not found.');
      const p = await coinPrice(coin.id);
      await ctx.m.reply(U.box(`🏦 ${coin.name}`, [
        `Market cap: $${p.usd_market_cap ? p.usd_market_cap.toLocaleString() : '—'}`,
        `Price: $${p.usd}`,
        `24h: ${p.usd_24h_change ? p.usd_24h_change.toFixed(2) : '—'}%`,
        `Rank data: coingecko.com/en/coins/${coin.id}`
      ]));
    } catch (e) {
      await ctx.m.reply(`❌ Failed: ${e.message}`);
    }
  },

  async inflation(ctx) {
    const a = U.textOf(ctx).split(/\s+/).map(num);
    if (a.length < 3) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}inflation <amount> <annual inflation %> <years>`);
    const [amount, rate, years] = a;
    const future = amount / Math.pow(1 + rate / 100, years);
    await ctx.m.reply(`📉 *Inflation impact*\n\n${U.money(amount)} today will be worth *${U.money(future)}* in ${years} years at ${rate}% inflation.`);
  },

  async goldprice(ctx) {
    try {
      const d = await U.getJson('https://data-asg.goldprice.org/dbXRates/USD', { timeout: 12000 });
      const item = d.items && d.items[0];
      if (!item) throw new Error('no data');
      await ctx.m.reply(U.box('🥇 GOLD PRICE', [
        `USD/oz: $${item.xauPrice}`,
        `USD/g: $${(item.xauPrice / 31.1035).toFixed(2)}`,
        `Silver/oz: $${item.xagPrice}`,
        `🕐 ${d.ts || ''}`
      ]));
    } catch (e) {
      await ctx.m.reply('❌ Gold price feed unavailable.');
    }
  },

  async cryptochart(ctx) {
    const q = (U.textOf(ctx) || 'bitcoin').trim();
    try {
      const coin = await findCoin(q);
      if (!coin) return ctx.m.reply('❌ Coin not found.');
      const d = await U.getJson(`https://api.coingecko.com/api/v3/coins/${coin.id}/market_chart?vs_currency=usd&days=7`);
      const prices = d.prices.map((p) => p[1]);
      const labels = d.prices.map((p) => new Date(p[0]).toISOString().slice(5, 10));
      const cfg = {
        type: 'line',
        data: { labels, datasets: [{ label: `${coin.symbol.toUpperCase()} 7d`, data: prices, borderColor: '#f7931a', fill: false }] },
        options: { plugins: { legend: { display: true } } }
      };
      await ctx.sock.sendMessage(ctx.m.chat, { image: { url: chartUrl(cfg) }, caption: `📈 *${coin.name}* — 7 day chart` }, { quoted: ctx.m });
    } catch (e) {
      await ctx.m.reply(`❌ Chart failed: ${e.message}`);
    }
  },

  async stockchart(ctx) {
    const q = await U.need(ctx, 'stockchart <ticker>');
    if (!q) return;
    const sym = q.trim().toUpperCase();
    try {
      const d = await U.getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1mo&interval=1d`);
      const r = d.chart.result[0];
      const closes = r.indicators.quote[0].close.filter((x) => x != null);
      const labels = r.timestamp.map((t) => new Date(t * 1000).toISOString().slice(5, 10));
      const cfg = {
        type: 'line',
        data: { labels, datasets: [{ label: sym, data: closes, borderColor: '#0f9d58', fill: false }] },
        options: { plugins: { legend: { display: true } } }
      };
      await ctx.sock.sendMessage(ctx.m.chat, { image: { url: chartUrl(cfg) }, caption: `📈 *${sym}* — 1 month` }, { quoted: ctx.m });
    } catch (e) {
      await ctx.m.reply(`❌ Chart failed: ${e.message}`);
    }
  },

  async orderbook(ctx) {
    const q = (U.textOf(ctx) || 'BTCUSDT').trim().toUpperCase();
    try {
      const d = await U.getJson(`https://api.binance.com/api/v3/depth?symbol=${encodeURIComponent(q)}&limit=8`);
      const bids = d.bids.map(([p, a]) => `🟢 ${Number(p).toFixed(2)} × ${Number(a).toFixed(4)}`);
      const asks = d.asks.map(([p, a]) => `🔴 ${Number(p).toFixed(2)} × ${Number(a).toFixed(4)}`);
      await ctx.m.reply(`📚 *Order book ${q}*\n\n*Bids*\n${bids.join('\n')}\n\n*Asks*\n${asks.join('\n')}`);
    } catch (e) {
      await ctx.m.reply(`❌ Order book failed. Use a Binance pair like BTCUSDT.`);
    }
  },

  async feargreed(ctx) {
    try {
      const d = await U.getJson('https://api.alternative.me/fng/?limit=7');
      const now = d.data[0];
      const hist = d.data.slice(1).map((x) => `• ${new Date(Number(x.timestamp) * 1000).toISOString().slice(0, 10)}: ${x.value} (${x.value_classification})`);
      await ctx.m.reply(`😱 *Crypto Fear & Greed*\n\nToday: *${now.value} — ${now.value_classification}*\n\n${hist.join('\n')}`);
    } catch (e) {
      await ctx.m.reply('❌ Fear & Greed index unavailable.');
    }
  },

  async bondyield(ctx) {
    const q = U.textOf(ctx) || 'US 10Y';
    await U.aiReply(ctx, q, 'Give current typical government bond yields for this maturity/country, explain what the yield means and what an inverted curve signals. Add a disclaimer that yields change daily and this is educational, not live trading data.');
  },

  async taxcalc(ctx) {
    const a = U.textOf(ctx).split(/\s+/).map(num);
    if (a.length < 2) return ctx.m.reply(`⚠️ Usage: ${ctx.prefix}taxcalc <income> <tax rate %>`);
    const [income, rate] = a;
    const tax = income * rate / 100;
    await ctx.m.reply(U.box('🧾 TAX ESTIMATE', [
      `Income: ${U.money(income)}`,
      `Rate: ${rate}%`,
      `Tax: ${U.money(tax)}`,
      `Net income: ${U.money(income - tax)}`
    ]));
  }
};

module.exports = { handlers };
