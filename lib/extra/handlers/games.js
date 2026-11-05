'use strict';
/**
 * Gaming command handlers (19 commands).
 * steam, minecraft, valorant, pubg, trivia, hangman, tictactoe, rps,
 * magic8ball, fortnite, apex, chess, connect4, wordle, battleship,
 * sudoku, akinator, memorygame, leaderboard
 */
const U = require('../util');

const { textOf, need, reply, ai, box, getJson, pick, randInt } = U;

const handlers = {};

/* ------------------------------------------------------------------ */
/* Game state                                                          */
/* ------------------------------------------------------------------ */
const games = new Map();     // chat -> game object
const scores = new Map();    // sender -> { wins, played }

function addScore(sender, win) {
  const s = scores.get(sender) || { wins: 0, played: 0, name: '' };
  s.played += 1;
  if (win) s.wins += 1;
  scores.set(sender, s);
}

/* ---- Steam ------------------------------------------------------- */
handlers.steam = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🔎 *Usage:* ${ctx.prefix}steam <game name>\nExample: ${ctx.prefix}steam Elden Ring`);
  try {
    const res = await getJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=english&cc=US`);
    if (!res.items || !res.items.length) return reply(ctx, `❌ Steam par "${q}" nahi mila.`);
    const it = res.items[0];
    const det = await getJson(`https://store.steampowered.com/api/appdetails?appids=${it.id}&l=english`);
    const d = det[it.id] && det[it.id].data;
    if (!d) return reply(ctx, `❌ Details nahi mile.`);
    const price = d.is_free ? 'FREE' : (d.price_overview ? d.price_overview.final_formatted : 'N/A');
    const lines = [
      `🎮 *${d.name}*`,
      `🆔 App ID: ${it.id}`,
      `💵 Price: ${price}`,
      `📅 Release: ${d.release_date ? d.release_date.date : 'N/A'}`,
      `🏢 Developer: ${(d.developers || []).join(', ') || 'N/A'}`,
      `📤 Publisher: ${(d.publishers || []).join(', ') || 'N/A'}`,
      `⭐ Metacritic: ${d.metacritic ? d.metacritic.score : 'N/A'}`,
      `🏷️ Genres: ${(d.genres || []).map((g) => g.description).join(', ')}`,
      '',
      `📝 ${String(d.short_description || '').slice(0, 400)}`,
      '',
      `🔗 https://store.steampowered.com/app/${it.id}`
    ];
    if (d.header_image) {
      return ctx.sock.sendMessage(ctx.m.chat, { image: { url: d.header_image }, caption: lines.join('\n') }, { quoted: ctx.m });
    }
    return reply(ctx, box('🎮 STEAM', lines));
  } catch (e) {
    return reply(ctx, `❌ Steam lookup fail: ${e.message}`);
  }
};

/* ---- Minecraft server -------------------------------------------- */
handlers.minecraft = async (ctx) => {
  const host = textOf(ctx).split(/\s+/)[0];
  if (!host) return reply(ctx, `🔎 *Usage:* ${ctx.prefix}minecraft play.hypixel.net`);
  try {
    const d = await getJson(`https://api.mcsrvstat.us/3/${encodeURIComponent(host)}`);
    if (!d.online) return reply(ctx, `🔴 *${host}* offline hai ya exist nahi karta.`);
    return reply(ctx, box('⛏️ MINECRAFT SERVER', [
      `🌐 *Host:* ${d.hostname || host}`,
      `🟢 *Status:* Online`,
      `👥 *Players:* ${d.players ? `${d.players.online}/${d.players.max}` : 'N/A'}`,
      `🧩 *Version:* ${d.version || 'N/A'}`,
      `🗺️ *Software:* ${d.software || 'N/A'}`,
      `📝 *MOTD:* ${d.motd ? d.motd.clean.join(' ') : 'N/A'}`,
      `🔌 *Port:* ${d.port || 25565}`,
      d.icon ? '' : ''
    ].filter(Boolean)));
  } catch (e) {
    return reply(ctx, `❌ Server info fail: ${e.message}`);
  }
};

/* ---- Valorant ---------------------------------------------------- */
handlers.valorant = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🔎 *Usage:* ${ctx.prefix}valorant <name#tag>`);
  const m = q.match(/^(.+?)#(\d+)$/);
  if (!m) return reply(ctx, `❌ Format: *Name#TAG*  e.g. ${ctx.prefix}valorant TenZ#NA1`);
  try {
    const d = await getJson(`https://api.henrikdev.xyz/valorant/v1/account/${encodeURIComponent(m[1])}/${m[2]}`);
    const a = d.data;
    return reply(ctx, box('🎯 VALORANT', [
      `👤 *Name:* ${a.name}#${a.tag}`,
      `🏅 *Level:* ${a.account_level}`,
      `🌍 *Region:* ${a.region}`,
      `🖼️ *Card:* ${a.card ? a.card.small : 'N/A'}`,
      `🆔 *PUUID:* ${String(a.puuid).slice(0, 18)}...`
    ]));
  } catch (e) {
    return reply(ctx, `❌ Player nahi mila ya API limit. (${e.message})`);
  }
};

/* ---- PUBG -------------------------------------------------------- */
handlers.pubg = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🔎 *Usage:* ${ctx.prefix}pubg <player name>`);
  const t = await ai(ctx, `The user wants PUBG Mobile stats for player "${q}". You cannot access live PUBG API. Give a short helpful reply (4-6 lines) explaining how to check stats officially (pubgmobile.com, in-game profile, third-party trackers like pubg-mobile.op.gg) and list what stats matter (K/D, win rate, avg damage, rank). Be friendly and concise.`, 'You are a gaming assistant.');
  return reply(ctx, t || `🎮 PUBG stats ke liye: https://pubgmobile.com ya in-game profile check karein.`);
};

/* ---- Trivia ------------------------------------------------------ */
const TRIVIA = [
  { q: 'Duniya ka sab se bara samandar kaunsa hai?', a: 'Pacific Ocean' },
  { q: 'Pakistan ka sab se lamba darya kaunsa hai?', a: 'Indus River' },
  { q: 'K2 ki height kitni hai?', a: '8611 meters' },
  { q: 'Sab se pehla computer programmer kaun tha?', a: 'Ada Lovelace' },
  { q: 'HTML ka full form kya hai?', a: 'HyperText Markup Language' },
  { q: 'Duniya ka sab se bara desert kaunsa hai?', a: 'Sahara (hot desert) / Antarctica (cold)' },
  { q: 'Light ki speed kitni hai?', a: '299,792,458 m/s' },
  { q: 'Sab se zyada population wala mulk kaunsa hai?', a: 'India' },
  { q: 'Pakistan ka qaumi phool kaunsa hai?', a: 'Jasmine (Chambeli)' },
  { q: 'Duniya ki sab se unchi building kaunsi hai?', a: 'Burj Khalifa' },
  { q: 'Water ka chemical formula kya hai?', a: 'H2O' },
  { q: 'Sab se chota mulk kaunsa hai?', a: 'Vatican City' },
  { q: 'Duniya ka sab se bara janwar kaunsa hai?', a: 'Blue Whale' },
  { q: 'Pakistan ki currency ka naam kya hai?', a: 'Pakistani Rupee' },
  { q: 'Moon par pehla insaan kaun gaya?', a: 'Neil Armstrong' },
  { q: 'Sab se lambi nadi kaunsi hai?', a: 'Nile (or Amazon, debated)' },
  { q: 'Duniya ka sab se bara mulk (area) kaunsa hai?', a: 'Russia' },
  { q: 'CPU ka full form kya hai?', a: 'Central Processing Unit' },
  { q: 'Pakistan ka sab se bara shehar kaunsa hai?', a: 'Karachi' },
  { q: 'Duniya mein kitne continents hain?', a: '7' },
  { q: 'Sab se pehla mobile phone kis ne banaya?', a: 'Martin Cooper' },
  { q: 'Bitcoin kab launch hua?', a: '2009' },
  { q: 'Duniya ka sab se ameer aadmi (2024)?', a: 'Elon Musk' },
  { q: 'Sab se zyada boli jane wali zaban kaunsi hai?', a: 'Mandarin Chinese' },
  { q: 'Duniya ka sab se bara phool kaunsa hai?', a: 'Rafflesia arnoldii' }
];

handlers.trivia = async (ctx) => {
  const key = ctx.m.chat || 'anon';
  const arg = textOf(ctx);
  const st = games.get(key);
  if (st && st.type === 'trivia' && arg) {
    games.delete(key);
    const ok = arg.toLowerCase().replace(/[^a-z0-9 ]/g, '').includes(st.a.toLowerCase().split(' ')[0].replace(/[^a-z0-9]/g, ''));
    addScore(ctx.m.sender, ok);
    return reply(ctx, ok
      ? `✅ *Sahi jawab!* ${st.a}\n\n🎉 Shabash!`
      : `❌ *Ghalat.* Sahi jawab: *${st.a}*`);
  }
  const t = pick(TRIVIA);
  games.set(key, { type: 'trivia', a: t.a, at: Date.now() });
  setTimeout(() => { const g = games.get(key); if (g && g.type === 'trivia') games.delete(key); }, 90000);
  return reply(ctx, box('🧠 TRIVIA', [
    `❓ ${t.q}`,
    '',
    `_Jawab likh kar bhejein (${ctx.prefix}trivia <answer>)_`
  ]));
};

/* ---- Hangman ----------------------------------------------------- */
const HANG_WORDS = ['PINEAPPLE', 'ELEPHANT', 'COMPUTER', 'PAKISTAN', 'MOUNTAIN', 'CHOCOLATE', 'BUTTERFLY', 'UNIVERSE', 'KEYBOARD', 'SANDWICH', 'ADVENTURE', 'TELESCOPE', 'PYRAMID', 'DOLPHIN', 'VOLCANO'];

handlers.hangman = async (ctx) => {
  const key = ctx.m.chat || 'anon';
  const arg = textOf(ctx).trim();
  let st = games.get(key);

  if (!st || st.type !== 'hangman' || arg.toLowerCase() === 'new' || arg.toLowerCase() === 'start') {
    const word = pick(HANG_WORDS);
    st = { type: 'hangman', word, guessed: [], wrong: 0, max: 6, at: Date.now() };
    games.set(key, st);
    return reply(ctx, renderHangman(st, ctx.prefix));
  }

  if (!arg) return reply(ctx, renderHangman(st, ctx.prefix));

  const letter = arg.toLowerCase().replace(/[^a-z]/g, '').slice(0, 1);
  if (!letter) return reply(ctx, '❓ Sirf ek letter bhejein (a-z).');

  if (st.guessed.includes(letter)) return reply(ctx, `⚠️ "${letter}" pehle guess ho chuka hai.`);

  st.guessed.push(letter);
  if (!st.word.toLowerCase().includes(letter)) st.wrong += 1;

  const won = st.word.toLowerCase().split('').every((c) => st.guessed.includes(c));
  if (won) {
    games.delete(key);
    addScore(ctx.m.sender, true);
    return reply(ctx, `🎉 *JEET GAYE!* Word tha: *${st.word}*`);
  }
  if (st.wrong >= st.max) {
    games.delete(key);
    addScore(ctx.m.sender, false);
    return reply(ctx, `💀 *Haar gaye!* Word tha: *${st.word}*`);
  }
  games.set(key, st);
  return reply(ctx, renderHangman(st, ctx.prefix));
};

function renderHangman(st, prefix) {
  const stages = [
    '```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========```',
    '```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========```',
    '```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========```',
    '```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========```',
    '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========```',
    '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========```',
    '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========```'
  ];
  const display = st.word.split('').map((c) => (st.guessed.includes(c.toLowerCase()) ? c : '_')).join(' ');
  return [
    `🪢 *HANGMAN*  (${st.wrong}/${st.max} galat)`,
    '',
    stages[Math.min(st.wrong, 6)],
    '',
    `📝 *Word:* ${display}`,
    `🔤 *Guessed:* ${st.guessed.join(' ') || '—'}`,
    '',
    `_${prefix}hangman <letter>_  |  _${prefix}hangman new_`
  ].join('\n');
}

/* ---- Tic-tac-toe ------------------------------------------------- */
function tttBoard(b) {
  const s = (i) => b[i] || ' ';
  return [
    '```',
    ` ${s(0)} | ${s(1)} | ${s(2)} `,
    '---+---+---',
    ` ${s(3)} | ${s(4)} | ${s(5)} `,
    '---+---+---',
    ` ${s(6)} | ${s(7)} | ${s(8)} `,
    '```'
  ].join('\n');
}

function tttWinner(b) {
  const L = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  for (const [a, c, d] of L) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every((x) => x) ? 'draw' : null;
}

function tttBest(b) {
  // simple minimax
  const winner = tttWinner(b);
  if (winner === 'O') return { score: 10 };
  if (winner === 'X') return { score: -10 };
  if (winner === 'draw') return { score: 0 };
  let best = { score: -Infinity, idx: -1 };
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = 'O';
    const r = tttBest(b);
    b[i] = null;
    if (-r.score > best.score) best = { score: -r.score, idx: i };
  }
  return best;
}

handlers.tictactoe = async (ctx) => {
  const key = ctx.m.chat || 'anon';
  const arg = textOf(ctx).trim();
  let st = games.get(key);

  if (!st || st.type !== 'ttt' || arg.toLowerCase() === 'new' || arg.toLowerCase() === 'start') {
    st = { type: 'ttt', board: Array(9).fill(null), at: Date.now() };
    games.set(key, st);
    return reply(ctx, `🎮 *TIC-TAC-TOE* — Aap **X**, bot **O**\n\n${tttBoard(st.board)}\n\n_${ctx.prefix}tictactoe <1-9>_`);
  }
  if (!arg) return reply(ctx, `🎮\n${tttBoard(st.board)}\n\n_${ctx.prefix}tictactoe <1-9>_`);

  const pos = parseInt(arg, 10) - 1;
  if (isNaN(pos) || pos < 0 || pos > 8) return reply(ctx, '❓ 1 se 9 ke darmiyan number dein.');
  if (st.board[pos]) return reply(ctx, '⚠️ Yeh khana pehle se bhara hua hai.');

  st.board[pos] = 'X';
  let w = tttWinner(st.board);
  if (w) {
    games.delete(key);
    addScore(ctx.m.sender, w === 'X');
    return reply(ctx, `🎮\n${tttBoard(st.board)}\n\n${w === 'X' ? '🎉 *Aap jeet gaye!*' : w === 'draw' ? '🤝 *Draw!*' : '🤖 *Bot jeet gaya!*'}`);
  }

  const best = tttBest(st.board.slice());
  if (best.idx >= 0) st.board[best.idx] = 'O';
  w = tttWinner(st.board);
  if (w) {
    games.delete(key);
    addScore(ctx.m.sender, w === 'X');
    return reply(ctx, `🎮\n${tttBoard(st.board)}\n\n${w === 'X' ? '🎉 *Aap jeet gaye!*' : w === 'draw' ? '🤝 *Draw!*' : '🤖 *Bot jeet gaya!*'}`);
  }
  games.set(key, st);
  return reply(ctx, `🎮\n${tttBoard(st.board)}\n\n_${ctx.prefix}tictactoe <1-9>_`);
};

/* ---- Rock paper scissors ----------------------------------------- */
handlers.rps = async (ctx) => {
  const choice = textOf(ctx).toLowerCase();
  const valid = ['rock', 'paper', 'scissors', 'r', 'p', 's'];
  if (!valid.includes(choice)) {
    return reply(ctx, `✊ *ROCK PAPER SCISSORS*\n\n*${ctx.prefix}rps rock* | *${ctx.prefix}rps paper* | *${ctx.prefix}rps scissors*`);
  }
  const norm = { r: 'rock', p: 'paper', s: 'scissors' }[choice] || choice;
  const bot = pick(['rock', 'paper', 'scissors']);
  const emoji = { rock: '✊', paper: '✋', scissors: '✌️' };
  let result;
  if (norm === bot) result = '🤝 *Draw!*';
  else if ((norm === 'rock' && bot === 'scissors') || (norm === 'paper' && bot === 'rock') || (norm === 'scissors' && bot === 'paper')) {
    result = '🎉 *Aap jeet gaye!*';
    addScore(ctx.m.sender, true);
  } else {
    result = '🤖 *Bot jeet gaya!*';
    addScore(ctx.m.sender, false);
  }
  return reply(ctx, `✊ *RPS*\n\n👤 Aap: ${emoji[norm]} ${norm}\n🤖 Bot: ${emoji[bot]} ${bot}\n\n${result}`);
};

/* ---- Magic 8 ball ------------------------------------------------ */
const EIGHT = [
  '✅ Bilkul haan.', '✅ Yaqeenan.', '✅ Bina shak ke.', '✅ Haan — magar sabr se.',
  '✅ Ishaara achi taraf hai.', '✅ Mumkin hai.', '🤔 Mushkil hai magar namumkin nahi.',
  '🤔 Abhi batana mushkil hai.', '🤔 Thora intezar karein.', '🤔 Dobara poochein.',
  '❌ Nahi.', '❌ Bilkul nahi.', '❌ Umeed mat rakhein.', '❌ Ishaara bura hai.',
  '❌ Meri salah nahi hai.', '🤷 Sawal phir se poochein.', '🤷 Mujhe nahi pata.',
  '🤷 Aap khud behtar jaante hain.'
];

handlers.magic8ball = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🎱 *MAGIC 8 BALL*\n\nApna sawal likhein:\n*${ctx.prefix}magic8ball Kya main pass ho jaunga?*`);
  return reply(ctx, `🎱 *MAGIC 8 BALL*\n\n❓ *Sawal:* ${q}\n\n💫 *Jawab:* ${pick(EIGHT)}`);
};

/* ---- Fortnite ---------------------------------------------------- */
handlers.fortnite = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🔎 *Usage:* ${ctx.prefix}fortnite <epic username>`);
  try {
    const d = await getJson(`https://fortnite-api.com/v2/stats/br/v2?name=${encodeURIComponent(q)}`);
    if (d.status !== 200 || !d.data) throw new Error('not found');
    const s = d.data.stats.all.overall;
    return reply(ctx, box('🏝️ FORTNITE STATS', [
      `👤 *Player:* ${d.data.account.name}`,
      `🏆 *Wins:* ${s.wins}`,
      `🎮 *Matches:* ${s.matches}`,
      `💀 *Kills:* ${s.kills}`,
      `📊 *K/D:* ${s.kd.toFixed(2)}`,
      `🎯 *Win Rate:* ${s.winRate.toFixed(1)}%`,
      `⭐ *Score:* ${s.score.toLocaleString()}`
    ]));
  } catch (e) {
    return reply(ctx, `❌ Player "${q}" nahi mila ya stats private hain.`);
  }
};

/* ---- Apex -------------------------------------------------------- */
handlers.apex = async (ctx) => {
  const q = textOf(ctx);
  if (!q) return reply(ctx, `🔎 *Usage:* ${ctx.prefix}apex <player name>`);
  const t = await ai(ctx, `User wants Apex Legends stats for "${q}". We can't access live API. Give a concise helpful reply (4-6 lines) telling them to use apex.tracker.gg or in-game profile, and list key stats to watch (K/D, damage, wins, rank).`, 'You are a gaming assistant.');
  return reply(ctx, t || `🎮 Apex stats: https://apex.tracker.gg/apex/profile/origin/${encodeURIComponent(q)}/overview`);
};

/* ---- Chess (move list) ------------------------------------------- */
handlers.chess = async (ctx) => {
  const q = textOf(ctx);
  if (!q) {
    return reply(ctx, box('♟️ CHESS', [
      'FEN position dein ya "start" likhein:',
      '',
      `*${ctx.prefix}chess start*`,
      `*${ctx.prefix}chess rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1*`,
      '',
      '_Aap ko position ka analysis aur behtar moves milenge._'
    ]));
  }
  const fen = q === 'start' ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' : q;
  const t = await ai(ctx, `Analyze this chess position (FEN): ${fen}\n\nGive: 1) whose turn, 2) material balance, 3) 2-3 good candidate moves in SAN with one-line reason each, 4) any tactical threat. Keep under 200 words.`, 'You are a chess engine and coach. Be precise and use standard SAN notation.');
  return reply(ctx, t || `♟️ Chess analysis unavailable. FEN: ${fen}`);
};

/* ---- Connect 4 --------------------------------------------------- */
handlers.connect4 = async (ctx) => {
  const key = ctx.m.chat || 'anon';
  const arg = textOf(ctx).trim();
  let st = games.get(key);
  const COLS = 7, ROWS = 6;

  const empty = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const render = (b) => '```\n' + b.map((r) => r.map((c) => (c === 'X' ? '🔴' : c === 'O' ? '🟡' : '⚫')).join('')).join('\n') + '\n1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣\n```';

  const drop = (b, col, p) => {
    for (let r = ROWS - 1; r >= 0; r--) if (!b[r][col]) { b[r][col] = p; return r; }
    return -1;
  };
  const win = (b, p) => {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (b[r][c] !== p) continue;
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        let n = 0;
        for (let k = 0; k < 4; k++) {
          const rr = r + dr * k, cc = c + dc * k;
          if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || b[rr][cc] !== p) break;
          n++;
        }
        if (n === 4) return true;
      }
    }
    return false;
  };

  if (!st || st.type !== 'c4' || arg.toLowerCase() === 'new') {
    st = { type: 'c4', board: empty(), at: Date.now() };
    games.set(key, st);
    return reply(ctx, `🔴 *CONNECT 4* — Aap 🔴, bot 🟡\n\n${render(st.board)}\n_${ctx.prefix}connect4 <1-7>_`);
  }
  if (!arg) return reply(ctx, `🔴\n${render(st.board)}\n_${ctx.prefix}connect4 <1-7>_`);

  const col = parseInt(arg, 10) - 1;
  if (isNaN(col) || col < 0 || col > 6) return reply(ctx, '❓ 1 se 7 ke darmiyan column dein.');
  if (drop(st.board, col, 'X') === -1) return reply(ctx, '⚠️ Yeh column bhar chuka hai.');

  if (win(st.board, 'X')) { games.delete(key); addScore(ctx.m.sender, true); return reply(ctx, `🔴\n${render(st.board)}\n\n🎉 *Aap jeet gaye!*`); }

  // bot: pick best by simple heuristic
  let bestCol = -1, bestScore = -Infinity;
  for (let c = 0; c < COLS; c++) {
    const test = st.board.map((r) => r.slice());
    if (drop(test, c, 'O') === -1) continue;
    let sc = 0;
    if (win(test, 'O')) sc = 1000;
    else {
      const test2 = test.map((r) => r.slice());
      // block check
      for (let c2 = 0; c2 < COLS; c2++) {
        const t3 = test.map((r) => r.slice());
        if (drop(t3, c2, 'X') !== -1 && win(t3, 'X')) sc -= 500;
      }
      sc += Math.random() * 10 + (c === 3 ? 5 : 0);
    }
    if (sc > bestScore) { bestScore = sc; bestCol = c; }
  }
  if (bestCol >= 0) drop(st.board, bestCol, 'O');

  if (win(st.board, 'O')) { games.delete(key); addScore(ctx.m.sender, false); return reply(ctx, `🟡\n${render(st.board)}\n\n🤖 *Bot jeet gaya!*`); }
  if (st.board[0].every((x) => x)) { games.delete(key); return reply(ctx, `🔴\n${render(st.board)}\n\n🤝 *Draw!*`); }

  games.set(key, st);
  return reply(ctx, `🔴\n${render(st.board)}\n_${ctx.prefix}connect4 <1-7>_`);
};

/* ---- Wordle ------------------------------------------------------ */
const WORDLE_WORDS = ['APPLE', 'BRAVE', 'CRANE', 'DREAM', 'EAGLE', 'FLAME', 'GRAPE', 'HOUSE', 'JUICE', 'KNIFE', 'LEMON', 'MONEY', 'NIGHT', 'OCEAN', 'PIANO', 'QUEEN', 'RIVER', 'SNAKE', 'TIGER', 'UMBRA', 'VOICE', 'WATER', 'XENON', 'YOUTH', 'ZEBRA'];

handlers.wordle = async (ctx) => {
  const key = ctx.m.chat || 'anon';
  const guess = textOf(ctx).toUpperCase().replace(/[^A-Z]/g, '');
  let st = games.get(key);

  if (!st || st.type !== 'wordle' || guess === 'NEW') {
    const word = pick(WORDLE_WORDS);
    st = { type: 'wordle', word, tries: [], at: Date.now() };
    games.set(key, st);
    return reply(ctx, `🟩 *WORDLE* — 5 letter word, 6 tries\n\n_${ctx.prefix}wordle <5-letter word>_`);
  }
  if (!guess) return reply(ctx, `🟩 *WORDLE* — ${st.tries.length}/6 tries used\n\n_${ctx.prefix}wordle <5-letter word>_`);
  if (guess.length !== 5) return reply(ctx, '❓ 5 letter ka word dein.');

  const w = st.word;
  const marks = [];
  const remaining = w.split('');
  for (let i = 0; i < 5; i++) {
    if (guess[i] === w[i]) { marks[i] = '🟩'; remaining[i] = null; }
  }
  for (let i = 0; i < 5; i++) {
    if (marks[i]) continue;
    const idx = remaining.indexOf(guess[i]);
    if (idx >= 0) { marks[i] = '🟨'; remaining[idx] = null; }
    else marks[i] = '⬛';
  }
  st.tries.push({ guess, marks });

  if (guess === w) {
    games.delete(key);
    addScore(ctx.m.sender, true);
    return reply(ctx, `🎉 *SAHI!* Word tha *${w}*\n\n` + st.tries.map((t) => `${t.marks.join('')} ${t.guess}`).join('\n'));
  }
  if (st.tries.length >= 6) {
    games.delete(key);
    addScore(ctx.m.sender, false);
    return reply(ctx, `💀 *6 tries khatam!* Word tha *${w}*\n\n` + st.tries.map((t) => `${t.marks.join('')} ${t.guess}`).join('\n'));
  }
  games.set(key, st);
  return reply(ctx, `🟩 *WORDLE* — ${st.tries.length}/6\n\n` + st.tries.map((t) => `${t.marks.join('')} ${t.guess}`).join('\n'));
};

/* ---- Battleship -------------------------------------------------- */
handlers.battleship = async (ctx) => {
  const key = ctx.m.chat || 'anon';
  const arg = textOf(ctx).trim();
  let st = games.get(key);

  const N = 6;
  const render = (shots) => {
    let out = '```\n  1 2 3 4 5 6\n';
    for (let r = 0; r < N; r++) {
      out += `${'ABCDEF'[r]} `;
      for (let c = 0; c < N; c++) {
        const k = `${'ABCDEF'[r]}${c + 1}`;
        out += shots[k] === 'hit' ? 'X ' : shots[k] === 'miss' ? 'o ' : '~ ';
      }
      out += '\n';
    }
    return out + '```';
  };

  if (!st || st.type !== 'bship' || arg.toLowerCase() === 'new') {
    const ships = new Set();
    while (ships.size < 5) ships.add(`${'ABCDEF'[randInt(0, 5)]}${randInt(1, 6)}`);
    st = { type: 'bship', ships: [...ships], shots: {}, at: Date.now() };
    games.set(key, st);
    return reply(ctx, `🚢 *BATTLESHIP* — 5 ships chhupe hain\n\n${render(st.shots)}\n_${ctx.prefix}battleship A3_`);
  }
  if (!arg) return reply(ctx, `🚢\n${render(st.shots)}\n_${ctx.prefix}battleship A3_`);

  const m = arg.toUpperCase().match(/^([A-F])([1-6])$/);
  if (!m) return reply(ctx, '❓ Format: A1 se F6 (e.g. B4).');
  const k = `${m[1]}${m[2]}`;
  if (st.shots[k]) return reply(ctx, '⚠️ Yeh khana pehle try ho chuka hai.');

  const hit = st.ships.includes(k);
  st.shots[k] = hit ? 'hit' : 'miss';
  const hits = Object.keys(st.shots).filter((x) => st.shots[x] === 'hit').length;

  if (hits >= 5) {
    games.delete(key);
    addScore(ctx.m.sender, true);
    return reply(ctx, `🚢\n${render(st.shots)}\n\n🎉 *Saare ships tabah!* Aap jeet gaye!`);
  }
  games.set(key, st);
  return reply(ctx, `🚢\n${render(st.shots)}\n\n${hit ? '💥 *HIT!*' : '💧 *Miss.*'}  (${hits}/5)`);
};

/* ---- Sudoku ------------------------------------------------------ */
const SUDOKU_PUZZLES = [
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
  '003020600900305001001806400008102900700000008006708200002609500800203009005010300',
  '200080300060070084030500209000105408000000000402706000301007040720040060004010003'
];

handlers.sudoku = async (ctx) => {
  const p = pick(SUDOKU_PUZZLES);
  let out = '🧩 *SUDOKU*  (0 = khali)\n```\n';
  for (let r = 0; r < 9; r++) {
    if (r % 3 === 0 && r > 0) out += '------+-------+------\n';
    for (let c = 0; c < 9; c++) {
      if (c % 3 === 0 && c > 0) out += '| ';
      out += p[r * 9 + c] + ' ';
    }
    out += '\n';
  }
  out += '```';
  await reply(ctx, out);
  const sol = await ai(ctx, `Solve this sudoku. Return ONLY the 9 rows of digits, one per line, no spaces, no explanation:\n${p.match(/.{9}/g).join('\n')}`, 'You are a sudoku solver. Output only digits.');
  if (sol) await reply(ctx, `✅ *Solution:*\n\`\`\`\n${sol.replace(/[^0-9\n]/g, '').slice(0, 100)}\n\`\`\``);
};

/* ---- Akinator ---------------------------------------------------- */
handlers.akinator = async (ctx) => {
  const q = textOf(ctx);
  if (!q) {
    return reply(ctx, box('🧞 AKINATOR', [
      'Kisi bhi cheez/insaan ka naam socho aur likhein:',
      '',
      `*${ctx.prefix}akinator Shah Rukh Khan*`,
      `*${ctx.prefix}akinator Eiffel Tower*`,
      '',
      '_Main guess karunga ke aap kya soch rahe hain._'
    ]));
  }
  const t = await ai(ctx, `The user typed "${q}" as a hint in an Akinator-style guessing game. Play the role of Akinator: make a confident, playful guess about what famous person/character/thing they are thinking of based on the hint. Reply in 3-5 lines: a dramatic "I am thinking..." line, then your guess in bold, then a fun fact. If the hint is too vague, ask one yes/no question instead.`, 'You are Akinator, the playful genie who guesses what people think of.');
  return reply(ctx, t || `🧞 Main soch raha hoon... kya aap *${q}* ki baat kar rahe hain?`);
};

/* ---- Memory game ------------------------------------------------- */
handlers.memorygame = async (ctx) => {
  const arg = textOf(ctx).trim();
  const key = ctx.m.chat || 'anon';
  let st = games.get(key);

  if (!st || st.type !== 'memory' || arg.toLowerCase() === 'new') {
    const emojis = ['🍎', '🍌', '🍇', '🍓', '🍑', '🍍', '🥝', '🍒'];
    const deck = [...emojis, ...emojis].sort(() => Math.random() - 0.5);
    st = { type: 'memory', deck, revealed: [], matched: [], flips: 0, at: Date.now() };
    games.set(key, st);
    return reply(ctx, renderMemory(st, ctx.prefix));
  }
  if (!arg) return reply(ctx, renderMemory(st, ctx.prefix));

  const pos = parseInt(arg, 10) - 1;
  if (isNaN(pos) || pos < 0 || pos > 15) return reply(ctx, '❓ 1 se 16 ke darmiyan number dein.');
  if (st.matched.includes(pos) || st.revealed.includes(pos)) return reply(ctx, '⚠️ Yeh card pehle khula hai.');

  st.revealed.push(pos);
  st.flips += 1;

  if (st.revealed.length === 2) {
    const [a, b] = st.revealed;
    if (st.deck[a] === st.deck[b]) {
      st.matched.push(a, b);
      st.revealed = [];
      if (st.matched.length === 16) {
        games.delete(key);
        addScore(ctx.m.sender, true);
        return reply(ctx, `🎉 *Saare pairs mil gaye!* Flips: ${st.flips}`);
      }
      games.set(key, st);
      return reply(ctx, `✅ *Match!* ${st.deck[a]}\n\n${renderMemory(st, ctx.prefix)}`);
    }
    games.set(key, st);
    const txt = `❌ *No match.* ${st.deck[a]} vs ${st.deck[b]}\n\n${renderMemory(st, ctx.prefix)}`;
    st.revealed = [];
    games.set(key, st);
    return reply(ctx, txt);
  }
  games.set(key, st);
  return reply(ctx, renderMemory(st, ctx.prefix));
};

function renderMemory(st, prefix) {
  let out = '🧠 *MEMORY GAME*\n```\n';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const i = r * 4 + c;
      const shown = st.matched.includes(i) || st.revealed.includes(i);
      out += shown ? st.deck[i] + ' ' : `[${String(i + 1).padStart(2, ' ')}] `;
    }
    out += '\n';
  }
  out += '```';
  return `${out}\n🔢 Flips: ${st.flips}  |  ✅ Pairs: ${st.matched.length / 2}/8\n_${prefix}memorygame <1-16>_`;
}

/* ---- Leaderboard ------------------------------------------------- */
handlers.leaderboard = async (ctx) => {
  if (!scores.size) return reply(ctx, '🏆 Abhi tak koi game nahi khela gaya. Pehle koi game khelein!');
  const arr = [...scores.entries()]
    .map(([id, s]) => ({ id, ...s, rate: s.played ? (s.wins / s.played) * 100 : 0 }))
    .sort((a, b) => b.wins - a.wins || b.rate - a.rate)
    .slice(0, 10);
  const medals = ['🥇', '🥈', '🥉'];
  const lines = arr.map((p, i) => `${medals[i] || `${i + 1}.`} @${String(p.id).split('@')[0]} — *${p.wins}* wins / ${p.played} played (${p.rate.toFixed(0)}%)`);
  return reply(ctx, box('🏆 GAME LEADERBOARD', lines.concat(['', '_Games: trivia, hangman, tictactoe, rps, connect4, wordle, battleship, memorygame_'])));
};

module.exports = { handlers, games, scores, TRIVIA };
