/* Classic question bank regression test.

     node _tests/bank-test.js

   Loads the app for real, with fetch wired to the repo so the question packs
   actually load, then checks the things that would spoil a night: a question
   that turns up twice, an answer that is missing or runs off the card, a bank
   that renumbers itself between page loads, and one question shape swallowing
   a tier.

   Reuses the stub DOM from mp-test.js. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));

let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x)); if (!c) fails++; };
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

// the stub fetch rejects; swap in one that serves files off disk
function boot() {
  eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, "")
    .replace("fetch: () => Promise.reject(new Error(\"offline in test\")),",
      `fetch: (u) => { try { const b = require("fs").readFileSync(require("path").join(${JSON.stringify(REPO)}, u), "utf8");
         return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(b)) }); }
         catch (e) { return Promise.resolve({ ok: false, json: () => Promise.reject(e) }); } },`));
  return makeInstance("bank");
}

(async () => {
  const app = boot();
  await new Promise(r => setTimeout(r, 400));           // let the packs land
  const ev = e => vm.runInContext("(" + e + ")", app);
  const TIERS = ["easy", "normal", "hard", "extreme", "ball"];

  const counts = {};
  TIERS.forEach(t => { counts[t] = ev(`BANK.${t}.length`); });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log("--- bank size ---");
  TIERS.forEach(t => console.log(`      ${t.padEnd(9)} ${counts[t]}`));
  console.log(`      ${"TOTAL".padEnd(9)} ${total}`);
  check("every tier has questions", TIERS.every(t => counts[t] > 0), JSON.stringify(counts));
  check("the deep pack reached Hard", counts.hard >= 500, counts.hard);
  check("the deep pack reached BALL", counts.ball >= 350, counts.ball);

  console.log("\n--- nothing asked twice ---");
  const all = [];
  TIERS.forEach(t => JSON.parse(ev(`JSON.stringify(BANK.${t})`)).forEach(q => all.push({ t, ...q })));
  const byQ = new Map(), dupes = [];
  all.forEach(q => {
    const k = norm(q.q);
    if (byQ.has(k)) dupes.push(`${byQ.get(k)} / ${q.t}: ${q.q}`); else byQ.set(k, q.t);
  });
  check("no duplicate questions anywhere in the bank", dupes.length === 0, dupes.length + " found");
  dupes.slice(0, 6).forEach(d => console.log("        " + d));

  console.log("\n--- answers fit on a card ---");
  check("no missing answers", all.every(q => q.a && String(q.a).trim()), all.filter(q => !q.a).length);
  check("no question over 150 chars", all.every(q => q.q.length <= 150), all.filter(q => q.q.length > 150).map(q => q.q.slice(0, 60))[0]);
  check("no answer over 110 chars", all.every(q => String(q.a).length <= 110), all.filter(q => String(q.a).length > 110).map(q => String(q.a).slice(0, 60))[0]);

  console.log("\n--- the bank numbers itself the same way every load ---");
  /* S.used stores indexes, so a resumed match points at the wrong questions if
     two packs can land in either order. Boot a second copy and compare. */
  const app2 = boot();
  await new Promise(r => setTimeout(r, 400));
  const ev2 = e => vm.runInContext("(" + e + ")", app2);
  const sameOrder = TIERS.every(t => ev(`BANK.${t}.map(q=>q.q).join("|")`) === ev2(`BANK.${t}.map(q=>q.q).join("|")`));
  check("two loads produce an identical bank order", sameOrder, "packs raced");

  console.log("\n--- no single shape swallows a tier ---");
  let worst = null;
  TIERS.forEach(t => {
    const rows = JSON.parse(ev(`JSON.stringify(BANK.${t})`)), sh = {};
    rows.forEach(q => {
      const s = q.q.replace(/\b(19|20)\d\d(\/\d\d)?\b/g, "<yr>").split(" ").slice(0, 5).join(" ");
      sh[s] = (sh[s] || 0) + 1;
    });
    const [top, n] = Object.entries(sh).sort((a, b) => b[1] - a[1])[0];
    const pct = Math.round(n / rows.length * 100);
    console.log(`      ${t.padEnd(9)} biggest shape ${String(pct).padStart(3)}%  (${n}/${rows.length})  "${top} ..."`);
    if (!worst || pct > worst.pct) worst = { t, pct, top };
  });
  check("no shape is more than a quarter of its tier", worst.pct <= 25, `${worst.pct}% in ${worst.t}: "${worst.top}"`);

  console.log(fails ? `\n${fails} FAILING CHECK(S)` : "\nAll checks passed.");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("HARNESS ERROR:", e); process.exit(2); });
