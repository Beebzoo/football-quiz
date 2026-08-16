/* Guess the Kit bank check: the deck is well formed, every shirt has its
   picture and its credit, and no two shirts in it are so alike that naming
   one and being told you are wrong would be unfair.

     node _tests/kit-test.js

   The look-alike check is the point of this file. Kits carry far less
   information than crests: a plain red shirt is Manchester United, Benfica
   and Bayern at once, so the bank has to be policed for collisions in a way
   the badge bank never does. */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const KITS = path.join(ROOT, "assets/kits");
let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- " + JSON.stringify(x))); if (!c) fails++; };

// --- the bank itself ------------------------------------------------------
const bank = JSON.parse(fs.readFileSync(path.join(KITS, "index.json"), "utf8"));
const TIERS = ["easy", "normal", "hard", "ball"];
const all = TIERS.flatMap(t => (bank[t] || []).map(k => ({ ...k, tier: t })));
const pngs = new Set(fs.readdirSync(KITS).filter(f => f.endsWith(".png")).map(f => f.slice(0, -4)));

console.log(`--- the bank (${all.length} kits) ---`);
check("all four tiers present", TIERS.every(t => Array.isArray(bank[t]) && bank[t].length), TIERS.map(t => (bank[t] || []).length));
check("every kit has a slug and a name", all.every(k => k.s && k.n), all.find(k => !k.s || !k.n));
check("every kit has a picture on disk", all.every(k => pngs.has(k.s)), all.find(k => !pngs.has(k.s)));
check("every base colour is a hex triplet", all.every(k => /^#[0-9A-Fa-f]{6}$/.test(k.c)), all.find(k => !/^#[0-9A-Fa-f]{6}$/.test(k.c)));
check("the shirt mask is present", pngs.has("_base"));
const slugs = all.map(k => k.s), names = all.map(k => k.n.toLowerCase());
check("no duplicate slugs", new Set(slugs).size === slugs.length, slugs.find((s, i) => slugs.indexOf(s) !== i));
check("no duplicate club names", new Set(names).size === names.length, names.find((n, i) => names.indexOf(n) !== i));
check("no leftover Wikipedia article tails in names",
  !all.some(k => /national (association )?(football|soccer) team|men's|F\.C\.$|\(football\)/i.test(k.n)),
  all.find(k => /national (association )?(football|soccer) team|men's|F\.C\.$|\(football\)/i.test(k.n))?.n);

// --- credits --------------------------------------------------------------
console.log("\n--- credits ---");
const csv = fs.readFileSync(path.join(KITS, "ATTRIBUTION.csv"), "utf8").trim().split("\n").map(l => l.replace(/\r$/, ""));
const rows = csv.slice(1).map(l => l.split(";"));
check("no blank or short rows", rows.every(r => r.length >= 6 && r[0].trim()), rows.find(r => r.length < 6));
const credited = new Set(rows.map(r => r[0].replace(/\.png$/, "")));
check("every kit is credited", all.every(k => credited.has(k.s)), all.find(k => !credited.has(k.s))?.s);
const FREE = /^(CC0|CC BY-SA|CC BY|Public domain)/i;
check("every licence is one we may redistribute", rows.every(r => FREE.test(r[3] || "")),
  rows.find(r => !FREE.test(r[3] || ""))?.slice(0, 4));
check("every credit links to its Commons source", rows.every(r => /^https:\/\/commons\.wikimedia\.org\//.test(r[5] || "")),
  rows.find(r => !/^https:\/\/commons\.wikimedia\.org\//.test(r[5] || ""))?.[0]);

// --- can these shirts actually be told apart? -----------------------------
function rgba(buf) {
  let pos = 8, w = 0, h = 0, ctype = 6, plte = null, trns = null; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString("ascii", pos + 4, pos + 8);
    const d = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ctype = d[9]; if (d[8] !== 8 || d[12]) return null; }
    else if (type === "PLTE") plte = d;
    else if (type === "tRNS") trns = d;
    else if (type === "IDAT") idat.push(d);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const CH = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!CH) return null;
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * CH, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= CH ? cur[i - CH] : 0, b = prev[i], c = i >= CH ? prev[i - CH] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[i] = v & 255;
    }
  }
  return { w, h, out, CH, ctype, plte, trns };
}
// one pixel as [r,g,b,a], whichever colour type the file happens to use
function px(p, i) {
  const s = i * p.CH;
  if (p.ctype === 6) return [p.out[s], p.out[s + 1], p.out[s + 2], p.out[s + 3]];
  if (p.ctype === 2) return [p.out[s], p.out[s + 1], p.out[s + 2], 255];
  if (p.ctype === 0) return [p.out[s], p.out[s], p.out[s], 255];
  if (p.ctype === 4) return [p.out[s], p.out[s], p.out[s], p.out[s + 1]];
  const ix = p.out[s];                       // palette
  return [p.plte[ix * 3], p.plte[ix * 3 + 1], p.plte[ix * 3 + 2],
          p.trns && ix < p.trns.length ? p.trns[ix] : 255];
}
function signature(file) {
  const p = rgba(fs.readFileSync(file));
  if (!p) return null;
  const GX = 6, GY = 9, sig = [];
  for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = Math.floor(gy * p.h / GY); y < Math.floor((gy + 1) * p.h / GY); y++)
      for (let x = Math.floor(gx * p.w / GX); x < Math.floor((gx + 1) * p.w / GX); x++) {
        const [pr, pg, pb, pa] = px(p, y * p.w + x);
        if (pa < 128) continue;
        r += pr; g += pg; b += pb; n++;
      }
    sig.push(n ? [r / n, g / n, b / n] : [-1, -1, -1]);
  }
  return sig;
}
const dist = (a, b) => {
  let s = 0, n = 0;
  for (let i = 0; i < a.length; i++) { if (a[i][0] < 0 || b[i][0] < 0) continue; s += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1], a[i][2] - b[i][2]); n++; }
  return n ? s / n : 999;
};

console.log("\n--- can the shirts be told apart? ---");
const sigs = all.map(k => ({ ...k, sig: signature(path.join(KITS, k.s + ".png")) })).filter(k => k.sig);
check("every kit decodes as an image", sigs.length === all.length, all.length - sigs.length);

const MIN = 16;                       // the floor the expansion was built to

/* The 80 kits the deck shipped with, before it was expanded from Commons.
   Several of them are indistinguishable from each other and always were:
   Valencia and Marseille are both plain white and score 5.8 apart. Those are
   Martijn's to keep or cut, so they are recorded rather than failed. What
   must not happen is a NEWLY added shirt colliding with anything, because the
   expansion selects against exactly that. */
const LEGACY = new Set(["ajax","feyenoord","psv","las-palmas","barcelona","real-madrid","atletico-madrid",
  "sevilla","valencia","manchester-united","liverpool","arsenal","chelsea","manchester-city","tottenham",
  "bayern-munich","borussia-dortmund","inter","paris-saint-germain","juventus","ac-milan","az","twente",
  "fc-utrecht","fc-groningen","cd-tenerife","athletic-club","real-sociedad","real-betis","villarreal",
  "everton","newcastle","leicester","aston-villa","schalke-04","roma","napoli","fiorentina","marseille",
  "lyon","monaco","benfica","porto","sporting-cp","club-brugge","anderlecht","celtic","rangers",
  "galatasaray","fenerbahce","hamburger-sv","bayer-leverkusen","go-ahead-eagles","nec","sparta-rotterdam",
  "fortuna-sittard","pec-zwolle","heracles","rkc-waalwijk","nac-breda","ado-den-haag","cambuur",
  "fc-volendam","excelsior","espanyol","celta-vigo","rayo-vallecano","getafe","osasuna","mallorca",
  "alaves","real-zaragoza","deportivo-la-coruna","sporting-gijon","real-valladolid","heerenveen",
  "mvv-maastricht","roda-jc","fc-den-bosch","de-graafschap"]);

const clashes = [];
for (let i = 0; i < sigs.length; i++)
  for (let j = i + 1; j < sigs.length; j++) {
    const d = dist(sigs[i].sig, sigs[j].sig);
    if (d < MIN) clashes.push({ a: sigs[i], b: sigs[j], d });
  }
clashes.sort((x, y) => x.d - y.d);
const inherited = clashes.filter(c => LEGACY.has(c.a.s) && LEGACY.has(c.b.s));
const introduced = clashes.filter(c => !LEGACY.has(c.a.s) || !LEGACY.has(c.b.s));

check(`no added kit is closer than ${MIN} to another`, introduced.length === 0,
  introduced.slice(0, 6).map(c => `${c.a.n} ~ ${c.b.n} (${c.d.toFixed(1)})`));
check("the legacy 80 are all still in the bank", [...LEGACY].every(s => slugs.includes(s)),
  [...LEGACY].filter(s => !slugs.includes(s)));

console.log(`\n  inherited look-alike pairs among the original 80: ${inherited.length}`);
inherited.slice(0, 8).forEach(c => console.log(`    ${c.d.toFixed(1).padStart(5)}  ${c.a.n} (${c.a.tier})  vs  ${c.b.n} (${c.b.tier})`));
if (inherited.length > 8) console.log(`    ... and ${inherited.length - 8} more`);

// --- and does the game actually deal from it? -----------------------------
const vm = require("vm");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
eval(harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"))
  .replace(/^const (fs|vm|path|zlib) = require\(.*\);$/gm, ""));
const ev = (c, e) => vm.runInContext("(" + e + ")", c);
const run = (c, s) => vm.runInContext(s, c);
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log("\n--- the mode deals from the bank ---");
  const app = makeInstance("solo");
  await wait(80);
  run(app, "KIT = " + JSON.stringify(bank) + ";");
  run(app, 'S = freshState(["A","B"], false, "kit", 0);');
  for (const tier of TIERS) {
    run(app, `pickTier("${tier}")`);
    await wait(40);
    const q = JSON.parse(ev(app, "JSON.stringify(q())"));
    const stage = app.__els["stage"] ? app.__els["stage"].innerHTML : "";
    const named = bank[tier].some(k => k.n === q.a);
    check(`${tier}: deals a kit from that tier`, named, q.a);
    check(`${tier}: card renders the shirt`, /kitbox/.test(stage) && /kitshirt/.test(stage) && /kitpat/.test(stage), stage.slice(0, 80));
    check(`${tier}: shirt points at a real file`, pngs.has(q.kit.img.replace("assets/kits/", "").replace(/\.png$/, "")), q.kit.img);
  }

  console.log(fails ? `\n${fails} FAILED` : "\nall green");
  process.exit(fails ? 1 : 0);
})();
