/* Build assets/eredivisie/index.json from the checked question files.

   Reads every checked-*.json in this folder (or raw-*.json with --raw, for a
   look before the fact-checkers have been through), keeps the rows whose
   verdict is ok or fixed, enforces the card limits, drops anything that
   repeats the Classic bank or itself, and writes the five-tier pack.

   First build only. Once the pack has shipped, APPEND: S.used holds indexes
   into each tier, so a rebuild that reorders a tier points every parked
   match at the wrong questions. Use --append to add new checked files onto
   the shipping pack instead of regenerating it.

     node build-ere.js [--raw] [--append] [--write]  */
const fs = require("fs"), path = require("path"), vm = require("vm");
const HERE = __dirname;
const REPO = path.resolve(HERE, "..", "..", "..");
const OUT = path.join(REPO, "assets/eredivisie/index.json");
const TIERS = ["easy", "normal", "hard", "extreme", "ball"];
const MAXQ = 150, MAXA = 110, MAXS = 110;

const args = process.argv.slice(2);
const write = args.includes("--write"), raw = args.includes("--raw"), append = args.includes("--append");
const rd = f => JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, ""));

/* ---- the Classic bank as the app loads it, so nothing here repeats it ---- */
const src = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const start = src.indexOf("const BANK"), open = src.indexOf("{", start);
let depth = 0, end = -1, inStr = null;
for (let i = open; i < src.length; i++) {
  const c = src[i], p = src[i - 1];
  if (inStr) { if (c === inStr && p !== "\\") inStr = null; continue; }
  if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
  if (c === "{") depth++; else if (c === "}") { depth--; if (!depth) { end = i + 1; break; } }
}
const BANK = vm.runInNewContext("(" + src.slice(open, end) + ")");
const packList = vm.runInNewContext("(" + src.slice(src.indexOf("[", src.indexOf("const PACKS")),
  src.indexOf("]", src.indexOf("const PACKS")) + 1) + ")");
for (const p of packList) {
  const extra = rd(path.join(REPO, p));
  for (const [t, rows] of Object.entries(extra)) if (BANK[t] && rows) BANK[t].push(...rows);
}

const STOP = new Set(["the","a","an","which","who","what","in","at","of","for","to","did","does","was","were","is","club","team","player","season","eredivisie","dutch"]);
const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w && !STOP.has(w)).sort().join(" ");
const nums = s => JSON.stringify([...new Set(String(s).match(/\d+/g) || [])].sort());
const OVERLAP = 0.7;

const seenQ = new Set(), byAns = new Map();
function remember(r, where) {
  seenQ.add(norm(r.q));
  const k = norm(r.a);
  if (!byAns.has(k)) byAns.set(k, []);
  byAns.get(k).push({ where, words: new Set(norm(r.q).split(" ")), q: r.q });
}
for (const t of TIERS) for (const r of BANK[t]) remember(r, "classic");
function nearDupe(r) {
  if (seenQ.has(norm(r.q))) return { q: r.q, where: "exact" };
  const mine = new Set(norm(r.q).split(" ")), mynums = nums(r.q);
  for (const cand of byAns.get(norm(r.a)) || []) {
    if (nums(cand.q) !== mynums) continue;
    let shared = 0;
    for (const w of mine) if (cand.words.has(w)) shared++;
    if (shared / Math.max(mine.size, cand.words.size) >= OVERLAP) return cand;
  }
  return null;
}

/* ---- the shipping pack, when appending ---- */
const pack = Object.fromEntries(TIERS.map(t => [t, []]));
if (append && fs.existsSync(OUT)) {
  const cur = rd(OUT);
  for (const t of TIERS) { pack[t] = cur[t] || []; for (const r of pack[t]) remember(r, "shipping"); }
}

/* ---- the candidates ---- */
const files = fs.readdirSync(HERE).filter(f => (raw ? /^raw-.*\.json$/ : /^checked-.*\.json$/).test(f)).sort();
if (!files.length) { console.log("no input files"); process.exit(1); }
const rejects = [];
const clean = s => String(s).replace(/[‒–—―]/g, "-").replace(/\s+/g, " ").trim();
let kept = 0;
for (const f of files) {
  const rows = rd(path.join(HERE, f));
  for (const r of rows) {
    const why = [];
    const verdict = (r.verdict || "ok").toLowerCase();
    if (!raw && !["ok", "fixed"].includes(verdict)) why.push("verdict " + verdict);
    const tier = String(r.tier || "").toLowerCase();
    if (!TIERS.includes(tier)) why.push("tier " + tier);
    const q = clean(r.q || ""), a = clean(r.a || ""), sub = r.sub ? clean(r.sub) : "";
    if (!q || !a) why.push("empty");
    if (q.length > MAXQ) why.push("q " + q.length);
    if (a.length > MAXA) why.push("a " + a.length);
    if (sub.length > MAXS) why.push("sub " + sub.length);
    if (/[{}|\[\]]/.test(q + a)) why.push("brackets");
    if (!/[?.!]$/.test(q)) why.push("no terminal punctuation");
    if (/\b(currently|all[- ]time|still holds?|to date|as of (today|now)|the current|most capped|record holder)\b/i.test(q)) why.push("live record");
    if (!why.length) { const d = nearDupe({ q, a }); if (d) why.push("dupe of " + d.where + ": " + d.q.slice(0, 70)); }
    if (why.length) { rejects.push({ f, q: (r.q || "").slice(0, 90), why: why.join("; ") }); continue; }
    const row = { q, a }; if (sub) row.sub = sub;
    pack[tier].push(row); remember(row, "pack"); kept++;
  }
}

console.log(`\n${files.length} file(s), ${kept} kept, ${rejects.length} rejected`);
console.log("per tier:", TIERS.map(t => `${t} ${pack[t].length}`).join(" / "));
const byWhy = {};
for (const r of rejects) { const k = r.why.split(":")[0]; byWhy[k] = (byWhy[k] || 0) + 1; }
console.log("rejections:", JSON.stringify(byWhy));
if (args.includes("--verbose")) for (const r of rejects) console.log(`  ${r.f}  ${r.why}\n      ${r.q}`);
if (write) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(pack, null, 1));
  console.log("wrote", path.relative(REPO, OUT));
} else console.log("dry run, add --write to ship");
