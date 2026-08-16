/* Top up the Hard and BALL packs with questions built from data the app
   already ships and Martijn already curates, so the answer cannot be wrong:
   the career deck, the historical line-ups, the verified nationality one-offs
   and the stadium index.

     node _tools/build-deep.js

   SAFE TO RE-RUN. Everything already in assets/deep/index.json is kept exactly
   as it is, handwritten questions included, and this only adds what is needed
   to reach the target. It will never overwrite a question you wrote by hand.

   Every shape is capped. The bank already had one shape at 10% of the whole
   thing ("which club plays its home ground at X") and that is the flaw we are
   trying not to repeat. */
const fs = require("fs");
const REPO = require("path").join(__dirname, "..") + "/";
const CAP = 34;                        // no single shape may exceed this per tier

const badges = JSON.parse(fs.readFileSync(REPO + "assets/badges/index.json", "utf8"));
const NAME = {}, FAME = {};
["easy", "hard", "ball"].forEach(t => badges[t].forEach(b => { NAME[b.s] = b.n; FAME[b.s] = t; }));

const html = fs.readFileSync(REPO + "index.html", "utf8");
const block = html.slice(html.indexOf("const CAREERS = ["), html.indexOf("const SAVE_KEY"));
const CAREERS = eval(block.slice(block.indexOf("["), block.lastIndexOf("]") + 1));
const XI = JSON.parse(fs.readFileSync(REPO + "assets/xi/index.json", "utf8"));
const NAT = JSON.parse(fs.readFileSync(REPO + "assets/nations/index.json", "utf8"));
const STAD = JSON.parse(fs.readFileSync(REPO + "assets/stadiums/index.json", "utf8"));

/* what is already in the bank, so we never generate a question it already has */
const facts = JSON.parse(fs.readFileSync(REPO + "assets/facts/index.json", "utf8"));
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const existing = new Set();
["easy", "normal", "hard", "extreme", "ball"].forEach(t => (facts[t] || []).forEach(q => existing.add(norm(q.q))));
(html.match(/^ \{q:"(?:[^"\\]|\\.)*"/gm) || []).forEach(m => existing.add(norm(m.slice(5, -1))));

const out = { hard: [], ball: [] };
const used = new Set();
const shapeCount = {};
function add(tier, shape, q, a) {
  const k = shape + "|" + tier;
  if ((shapeCount[k] || 0) >= CAP) return false;
  const n = norm(q);
  if (used.has(n) || existing.has(n)) return false;
  used.add(n);
  shapeCount[k] = (shapeCount[k] || 0) + 1;
  out[tier].push({ q, a });
  return true;
}
// deterministic spread so we don't take the first N of everything
const spread = (arr, seed) => arr.map((v, i) => [v, (i * 2654435761 + seed) % 1000003]).sort((a, b) => a[1] - b[1]).map(x => x[0]);

/* ---------- 1. career transitions ---------- */
for (const p of spread(CAREERS, 11)) {
  const c = p.c.filter(s => NAME[s]);
  if (c.length < 3) continue;
  const i = 1 + (p.n.length % (c.length - 1));
  const from = c[i - 1], to = c[i];
  if (from === to) continue;
  add(FAME[to] === "easy" ? "hard" : "ball", "transition",
      `Which club did ${p.n} join after leaving ${NAME[from]}?`, NAME[to]);
}

/* ---------- 2. where an obscure career began ---------- */
for (const p of spread(CAREERS, 23)) {
  const c = p.c.filter(s => NAME[s]);
  if (c.length < 3 || FAME[c[0]] === "easy") continue;
  add("ball", "start", `Which club did ${p.n} start his senior career at?`, NAME[c[0]]);
}

/* ---------- 3. where a long career ended ---------- */
for (const p of spread(CAREERS, 37)) {
  const c = p.c.filter(s => NAME[s]);
  if (c.length < 5 || FAME[c[c.length - 1]] === "easy") continue;
  add("hard", "finish", `Which club did ${p.n} play for last, after leaving ${NAME[c[c.length - 2]]}?`, NAME[c[c.length - 1]]);
}

/* ---------- 4. the club sandwiched between two big ones ---------- */
for (const p of spread(CAREERS, 53)) {
  const c = p.c.filter(s => NAME[s]);
  for (let i = 1; i < c.length - 1; i++) {
    if (FAME[c[i - 1]] === "easy" && FAME[c[i + 1]] === "easy" && FAME[c[i]] !== "easy") {
      add("ball", "between", `Which club did ${p.n} play for between ${NAME[c[i - 1]]} and ${NAME[c[i + 1]]}?`, NAME[c[i]]);
      break;
    }
  }
}

/* ---------- 5. which club he left to join a giant ---------- */
for (const p of spread(CAREERS, 67)) {
  const c = p.c.filter(s => NAME[s]);
  for (let i = 1; i < c.length; i++) {
    if (FAME[c[i]] === "easy" && FAME[c[i - 1]] !== "easy") {
      add("hard", "leftfor", `Which club did ${p.n} leave to sign for ${NAME[c[i]]}?`, NAME[c[i - 1]]);
      break;
    }
  }
}

/* ---------- 6. historical line-ups ---------- */
for (const line of spread(XI, 91)) {
  const where = line.title.replace(" · ", ", ");
  const cap = line.players.find(pl => pl.cap);
  if (cap) add("ball", "xi-cap", `Who wore the armband for ${where}?`, cap.n);
  const gk = line.players.find(pl => pl.num === 1);
  if (gk) add("ball", "xi-gk", `Who kept goal for ${where}?`, gk.n);
  const ten = line.players.find(pl => pl.num === 10);
  if (ten) add("hard", "xi-ten", `Who wore number 10 for ${where}?`, ten.n);
  add("hard", "xi-form", `${where} lined up in which formation?`, line.formation);
  // three names, name the side: the whole table shouts at this one
  const trio = line.players.filter(pl => pl.num >= 4 && pl.num <= 11).slice(0, 3).map(pl => pl.n);
  if (trio.length === 3) add("ball", "xi-trio", `Which side lined up with ${trio[0]}, ${trio[1]} and ${trio[2]}?`, where);
}

/* ---------- 7. the only player of their country at a club ---------- */
for (const tier of ["hard", "ball"]) {
  const src = tier === "hard" ? (NAT.easy || []).concat(NAT.normal || []) : (NAT.hard || []).concat(NAT.ball || []);
  for (const r of spread(src, tier === "hard" ? 101 : 103)) {
    add(tier, "oneoff", `${r.player} is the only player from which country ever to appear for ${r.club}?`, r.country);
  }
}

/* ---------- 8. grounds: capacity and country, not "who plays there" ---------- */
const big = STAD.filter(s => s.capacity && s.city).sort((a, b) => b.capacity - a.capacity);
for (const s of spread(big.slice(0, 120), 131)) {
  add(s.sitelinks > 40 ? "hard" : "ball", "stad-city", `In which city would you find ${s.name}?`, `${s.city}, ${s.country}`);
}

/* ---------- keep everything that is already there, then top up ---------- */
const TARGET = Number(process.argv[2]) || 200;
const LIVE = REPO + 'assets/deep/index.json';
let deep = { hard: [], ball: [] };
try { deep = JSON.parse(fs.readFileSync(LIVE, 'utf8')); } catch (e) {}

for (const tier of ['hard', 'ball']) {
  const have = deep[tier] || [];
  const haveKeys = new Set(have.map(q => norm(q.q)));
  const fresh = out[tier].filter(q => !haveKeys.has(norm(q.q)));
  const need = Math.max(0, TARGET - have.length);
  deep[tier] = have.concat(fresh.slice(0, need));
  console.log(`${tier.padEnd(5)} kept ${have.length} (handwritten included) + added ${Math.min(need, fresh.length)} = ${deep[tier].length}`);
}
fs.mkdirSync(REPO + 'assets/deep', { recursive: true });
fs.writeFileSync(LIVE, JSON.stringify(deep, null, 1));
console.log('wrote assets/deep/index.json');
console.log('now run: node _tests/bank-test.js');
