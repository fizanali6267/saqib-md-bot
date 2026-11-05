/**
 * SAQIB-MD — Command Information Registry
 * --------------------------------------
 * Single source of truth for the `.details <command>` feature.
 *
 * Resolution order:
 *   1. Master catalog (owner's uploaded list)  -> rich description + category
 *   2. Legacy map (commands that existed before the master list)
 *   3. Alias map                                -> resolves to the real command
 *   4. Fuzzy suggestions                        -> "did you mean ...?"
 */

const { BY_CMD, CATALOG, CATEGORIES } = require('./commandCatalog');
const LEGACY = require('./legacyInfo');
const { aliases } = require('./aliasMap');

const OWNER_ONLY = new Set([
  'eval', 'exec', 'loadplugin', 'unloadplugin', 'reload', 'setprefix', 'setbotname',
  'setbio', 'maintenance', 'broadcast', 'bc', 'setavatar', 'backup', 'restore',
  'shutdown', 'update', 'restart', 'clearlogs', 'nuke', 'logcleaner', 'reboot',
  'killpid', 'docker', 'pm2', 'service', 'memorydump', 'cpuprofile', 'cluster',
  'shred', 'selfdestruct', 'vault', 'incognito', 'setcookies'
]);

const GROUP_ONLY = new Set([
  'tagall', 'hidetag', 'tagadmin', 'listadmin', 'kick', 'add', 'promote', 'demote',
  'setname', 'setdesc', 'setgpp', 'mutechat', 'unmutechat', 'link', 'revoke',
  'antilink', 'warn', 'resetwarn', 'ghost', 'kickinactive', 'groupinfo',
  'setephemeral', 'invite', 'broadcastgroup', 'poll', 'vote', 'rules', 'setrules',
  'pin', 'unpin', 'purge', 'slowmode', 'captcha', 'lockchat', 'unlockchat',
  'antispam', 'wordblacklist', 'filters', 'stopfilter', 'warnlimit', 'autoapprove',
  'welcomemsg', 'goodbyemsg', 'membercount', 'staff', 'auditlog', 'roleassign',
  'tempban', 'bansystem', 'cleanbots', 'inactive', 'mentionall', 'nsfwblock',
  'welcometoggle', 'goodbyetoggle', 'antidelete', 'antiviewonce', 'autovv'
]);

// Commands that need a quoted message / attachment to work.
const NEEDS_QUOTE = new Set([
  'sticker', 's', 'take', 'steal', 'toimg', 'tovideo', 'tomp3', 'ocr', 'vvphoto',
  'vvvideo', 'forward', 'quoted', 'del', 'dlt', 'bass', 'nightcore', 'slowed',
  'reverb', 'reverse', 'mute', 'compress', 'circle', 'round', 'emojimix', 'save',
  'pdfmerge', 'pdfsplit', 'pdfcompress', 'imgcompress', 'webpconv', 'svgtopng',
  'audiofilter', 'audiotrim', 'videocrop', 'watermark', 'gifmaker', 'extractaudio',
  'resizepic', 'bgremove', 'rotate', 'framerate', 'metadata', 'stripexif',
  'giftomp4', 'slowmo', 'fastforward', 'audioboost', 'encrypt', 'decrypt',
  'stegano', 'desteg', 'pitch', 'tempo', 'flanger', 'distortion', 'chorus',
  'equalizer', 'normalize', 'audio3d', 'vocalremover', 'karaoke', 'audiojoin',
  'heic2jpg', 'epub2pdf', 'cbr2pdf', 'rtf2txt', 'svgtoico', 'mp3towav',
  'ogg2mp3', 'wav2flac', 'mid2wav', 'topdf', 'toexcel', 'txttofile',
  'visionai', 'whisper', 'voicetotext', 'chatpdf', 'summarizefile', 'excel',
  'csvparse', 'spellcheck', 'wordcount'
]);

const USAGE_OVERRIDES = {
  details: '<command>',
  song: '<song name | YouTube link>',
  video: '<YouTube link>',
  play: '<song name>',
  block: '<number | @mention | reply>',
  unblock: '<number | @mention | reply>',
  join: '<group invite link>',
  leave: '[group jid]',
  mode: 'public | private',
  translate: '<text> [lang]  (or reply to a message)',
  tr: '<text> [lang]  (or reply to a message)',
  hidetag: '<message>  (or reply to a message)',
  forward: '(reply to a message) [target jid]',
  warn: '<@mention | reply> [reason]',
  poll: '<question> | <option1> | <option2> ...',
  remind: '<time e.g. 10m> <text>',
  setname: '<new group name>',
  setdesc: '<new description>',
  broadcast: '<message>',
  weather: '<city>',
  crypto: '<coin> [currency]',
  qr: '<text or link>',
  define: '<word>',
  calc: '<expression>',
  imagine: '<prompt>',
  ai: '<question>',
  gpt: '<question>',
  summarize: '<text> (or reply)',
  tts: '<text>',
  say: '<text>',
  take: '<packname> | <author>  (reply to sticker)',
  eval: '<javascript expression>',
  exec: '<shell command>',
  passgen: '[length]',
  encrypt: '<text>  (or reply to media)',
  decrypt: '<text>',
  base64enc: '<text>',
  base64dec: '<text>',
  sha256: '<text>',
  md5: '<text>',
  regexgen: '<description of the pattern>',
  sqlgen: '<plain-language query>',
  unitconvert: '<value> <from> <to>',
  currency: '<amount> <from> <to>',
  bmi: '<weight kg> <height cm>',
  caloriecalc: '<weight kg> <height cm> <age> <male|female>',
  zakat: '<amount>',
  quran: '<surah:ayah>  e.g. 2:255',
  surah: '<surah number or name>',
  prayer: '[city]',
  qibla: '[city]',
  hijri: '[dd-mm-yyyy]',
  geocode: '<place name>',
  reversegeo: '<lat> <lon>',
  timezone: '<city or country>',
  distancematrix: '<from> | <to>',
  countryinfo: '<country>',
  sunrise: '<city>',
  airquality: '<city>',
  stock: '<ticker>',
  forex: '<from> <to>',
  converter: '<amount> <from> <to>',
  loancalc: '<principal> <annual rate %> <years>',
  mortgage: '<principal> <rate %> <years>',
  compound: '<principal> <rate %> <years>',
  savings: '<monthly> <rate %> <years>',
  roi: '<invested> <returned>',
  tipcalc: '<bill> [tip %]',
  bodyfat: '<weight kg> <height cm> <age> <male|female>',
  'one-rm': '<weight> <reps>',
  waterintake: '<weight kg>',
  macrocalc: '<weight kg> <goal: cut|maintain|bulk>',
  periodic: '<element name or symbol>',
  mathsolve: '<expression or problem>',
  physics: '<problem or formula>',
  astronomy: '<object or question>',
  history: '<topic>',
  dictionary: '<word>',
  thesaurus: '<word>',
  citation: '<title> | <author> | <year>',
  formula: '<topic>',
  discount: '<price> <discount %>',
  unitprice: '<price> <quantity>',
  dutycalc: '<value> <country>',
  shipping: '<weight kg> <destination>',
  hashtag: '<topic>',
  caption: '<topic>',
  bio: '<topic or vibe>',
  ytags: '<video topic>',
  utmbuilder: '<url> <source> <medium> <campaign>',
  threadmaker: '<topic>',
  pollmaker: '<question> | <option1> | <option2>',
  banner: '<text>',
  schedule: '<topic>',
  linkinbio: '<name> | <link1> <link2>',
  shorturl: '<url>',
  unshorten: '<short url>',
  dig: '<domain> [record type]',
  dnslookup: '<domain>',
  whois: '<domain>',
  sslcheck: '<domain>',
  httpheader: '<url>',
  portscan: '<host>',
  subnet: '<ip/cidr>',
  maclookup: '<mac address>',
  ipinfo: '<ip or blank>',
  traceroute: '<host>',
  pinghost: '<host>',
  webarchive: '<url>',
  responsive: '<url>',
  techstack: '<url>',
  brokenlinks: '<url>',
  redirects: '<url>',
  pageweight: '<url>',
  sitemap: '<domain>',
  robots: '<domain>',
  securitytxt: '<domain>',
  threatcheck: '<domain or ip>',
  blacklist: '<domain or ip>',
  reverseip: '<ip>',
  cssvalidate: '<css code or url>',
  jsvalidate: '<js code>',
  headers: '<url>',
  barcode: '<number>',
  pricehistory: '<product name>',
  pricealert: '<product> <target price>',
  comparison: '<product1> | <product2>',
  coupon: '<store>',
  sizechart: '<category>',
  warranty: '<product>',
  storefinder: '<store> | <city>',
  returnpolicy: '<store>',
  inventory: '<product> <quantity>',
  steam: '<game name or appid>',
  minecraft: '<username>',
  valorant: '<riot id#tag>',
  pubg: '<player name>',
  fortnite: '<username>',
  apex: '<username>',
  chess: '[move]',
  wordle: '<5 letter guess>',
  sudoku: '[difficulty]',
  akinator: '<yes|no|maybe|idk>',
  hangman: '<letter>',
  tictactoe: '<1-9>',
  rps: '<rock|paper|scissors>',
  magic8ball: '<question>',
  roll: '[NdN]',
  trivia: '[category]',
  truth: '',
  dare: '',
  ship: '<@user1> <@user2>',
  roast: '<@user>',
  pickup: '<@user>',
  fortune: '',
  insult: '<@user>',
  compliment: '<@user>',
  advice: '',
  dadjoke: '',
  memeidea: '<topic>',
  quote: '',
  fact: '',
  paheli: '',
  emojimerge: '<emoji1> <emoji2>',
  fontpreview: '<text>',
  gradient: '<color1> <color2>',
  palette: '<color or image>',
  qrlogo: '<text> | <logo url>',
  meme: '<top text> | <bottom text>',
  aspectratio: '<width> <height>',
  goldenratio: '<number>',
  dither: '<image reply>',
  duotone: '<color1> <color2>',
  blur: '<radius>',
  sharpen: '<amount>',
  pixelate: '<size>',
  invert: '',
  sepia: '',
  vintage: '',
  photocollage: '<2-4 images>',
  pantone: '<color name or hex>',
  iconsearch: '<query>',
  mockup: '<product type>',
  emojimix: '<emoji1> <emoji2>',
  stickertele: '<emoji>',
  fancy: '<text>',
  poll: '<question> | <option1> | <option2>',
  remind: '<time> <text>',
  birthday: '<name> <dd-mm>',
  horoscope: '<zodiac sign>',
  customtitle: '<title>',
  reputation: '<@user>',
  signature: '<text>',
  afk: '[reason]',
  unafk: '',
  rank: '[@user]',
  leveltop: '',
  card: '[@user]',
  getpp: '[@user | number]',
  setpp: '(reply to image)',
  profile: '[@user]',
  ttsound: '<text>',
  igstory: '<text>',
  twitlength: '<text>',
  commentgen: '<post topic>',
  influencer: '<niche>',
  repost: '<url>',
  clickbait: '<topic>',
  engagement: '<post text>',
  analytics: '<@channel or topic>',
  contentidea: '<niche>',
  slowmode: '<seconds>',
  captcha: 'on | off',
  purge: '[count]',
  pin: '(reply to message)',
  unpin: '',
  rules: '',
  setrules: '<text>',
  tempban: '<@user> <duration>',
  roleassign: '<@user> <role>',
  auditlog: 'on | off',
  membercount: '',
  staff: '',
  cleanbots: '',
  wordblacklist: '<add|remove|list> [word]',
  filters: '<add|remove|list> [trigger] | [reply]',
  stopfilter: '<trigger>',
  warnlimit: '<number>',
  autoapprove: 'on | off',
  welcomemsg: '<text>',
  goodbyemsg: '<text>',
  lockchat: '',
  unlockchat: '',
  antispam: 'on | off',
  mentionall: '<message>',
  groupinfo: '',
  setephemeral: '<24h|7d|90d|off>',
  invite: '',
  broadcastgroup: '<message>',
  leavegroup: '<group jid>',
  joinlink: '<invite link>',
  blockuser: '<number>',
  unblockuser: '<number>',
  setbotname: '<name>',
  setbio: '<text>',
  setprefix: '<new prefix>',
  maintenance: 'on | off',
  setavatar: '(reply to image)',
  backup: '',
  restore: '(reply to backup file)',
  stats: '',
  update: '',
  shutdown: '',
  eval: '<js>',
  exec: '<shell>',
  loadplugin: '<plugin file name>',
  unloadplugin: '<plugin name>',
  reload: '',
  session: '',
  cluster: '',
  envcheck: '',
  healthcheck: '',
  pingdb: '',
  dbstats: '',
  cacheclear: '',
  errlog: '',
  apistatus: '',
  memorydump: '',
  cpuprofile: '',
  bandwidth: '',
  nodeversion: '',
  checkupdate: '',
  version: '',
  system: '',
  runtime: '',
  alive: '',
  ping: '',
  menu: '',
  help: '',
  commanddetails: '',
  commands: '',
  cmd: '',
  cmdinfo: ''
};

function normalize(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/^[.!/#]/, '')
    .replace(/\s+/g, '')
    .trim();
}

function reverseAliases(cmd) {
  const out = [];
  for (const [alias, target] of Object.entries(aliases)) {
    if (target === cmd && alias !== cmd) out.push(alias);
  }
  return out.sort();
}

function usageFor(cmd) {
  if (Object.prototype.hasOwnProperty.call(USAGE_OVERRIDES, cmd)) {
    const u = USAGE_OVERRIDES[cmd];
    return u ? `${cmd} ${u}` : cmd;
  }
  if (NEEDS_QUOTE.has(cmd)) return `${cmd}  (reply to a message / attach media)`;
  return cmd;
}

function permissionFor(cmd) {
  if (OWNER_ONLY.has(cmd)) return 'Owner only';
  if (GROUP_ONLY.has(cmd)) return 'Group admins / owner';
  return 'Everyone';
}

/**
 * Look up everything we know about a command.
 * @returns {{found:boolean, cmd:string, desc:string, cat:string, module:string|null,
 *            usage:string, permission:string, aliases:string[], aliasOf?:string,
 *            suggestions?:string[]}}
 */
function lookup(raw) {
  const input = normalize(raw);
  if (!input) return { found: false, cmd: '', suggestions: [] };

  // 1. direct catalog hit
  const cat = BY_CMD.get(input);
  if (cat) {
    return {
      found: true,
      cmd: input,
      desc: cat.desc,
      cat: cat.cat,
      module: null,
      usage: usageFor(input),
      permission: permissionFor(input),
      aliases: reverseAliases(input)
    };
  }

  // 2. legacy hit
  const legacy = LEGACY[input];
  if (legacy) {
    return {
      found: true,
      cmd: input,
      desc: legacy[1],
      cat: '⚙️ CORE / LEGACY COMMANDS',
      module: legacy[0],
      usage: usageFor(input),
      permission: permissionFor(input),
      aliases: reverseAliases(input)
    };
  }

  // 3. alias -> real command
  const target = aliases[input];
  if (target && target !== input) {
    const real = lookup(target);
    if (real.found) {
      return { ...real, aliasOf: target, requested: input };
    }
  }

  // 4. fuzzy suggestions
  const pool = [...CATALOG.map((e) => e.cmd), ...Object.keys(LEGACY), ...Object.keys(aliases)];
  const scored = [];
  for (const c of new Set(pool)) {
    if (Math.abs(c.length - input.length) > 3) continue;
    scored.push([c, levenshtein(input, c)]);
  }
  scored.sort((a, b) => a[1] - b[1]);
  const suggestions = scored.filter((s) => s[1] <= 3).slice(0, 5).map((s) => s[0]);

  return { found: false, cmd: input, suggestions };
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i += 1) {
    const cur = [i];
    for (let j = 1; j <= n; j += 1) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

/** All commands, grouped by category (catalog first, then legacy). */
function grouped() {
  const map = new Map();
  for (const e of CATALOG) {
    if (!map.has(e.cat)) map.set(e.cat, []);
    map.get(e.cat).push(e);
  }
  const legacy = Object.entries(LEGACY).map(([cmd, v]) => ({ cmd, cat: '⚙️ CORE / LEGACY COMMANDS', desc: v[1] }));
  if (legacy.length) map.set('⚙️ CORE / LEGACY COMMANDS', legacy);
  return map;
}

module.exports = {
  lookup,
  grouped,
  usageFor,
  permissionFor,
  normalize,
  reverseAliases,
  CATALOG,
  CATEGORIES,
  LEGACY
};
