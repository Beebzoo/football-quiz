/* One & Only player detail: the data, and where it is allowed to show.

     node _tests/natinfo-test.js

   Two jobs. First the bank itself, because build-natinfo.js writes into the
   file a live mode reads: row counts must not move (a resumed match stores an
   index into these arrays), positions must come from the whitelist rather
   than Wikidata's museum vocabulary, and a spell must be a real range that
   does not run backwards or overlap itself.

   Then the rule that actually matters at the table: the detail belongs on the
   reveal and nowhere near the question. "1998 to 2003 · 142 games" on the
   question card hands over half the answer.

   Reuses the stub DOM from mp-test.js. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));

eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, "")
  .replace("fetch: () => Promise.reject(new Error(\"offline in test\")),",
    `fetch: (u) => { try { const b = require("fs").readFileSync(require("path").join(${JSON.stringify(REPO)}, u), "utf8");
       return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(b)) }); }
       catch (e) { return Promise.resolve({ ok: false, json: () => Promise.reject(e) }); } },`));

const ev = (ctx, e) => vm.runInContext("(" + e + ")", ctx);
const run = (ctx, s) => vm.runInContext(s, ctx);
const tick = (ms = 260) => new Promise(r => setTimeout(r, ms));
const stage = c => (c.__els["stage"] ? c.__els["stage"].innerHTML : "");
let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x)); if (!c) fails++; };

const TIERS = ["easy", "normal", "hard", "ball"];
/* The counts the bank shipped with. They are asserted, not read, because the
   point of the assertion is to catch a harvest that quietly dropped a row. */
const SHIPPED = { easy: 218, normal: 473, hard: 387, ball: 233 };
const POS = ["Goalkeeper", "Centre-back", "Left-back", "Right-back", "Full-back", "Wing-back",
  "Sweeper", "Defender", "Defensive midfielder", "Attacking midfielder", "Central midfielder",
  "Midfielder", "Centre-forward", "Second striker", "Inside forward", "Striker", "Winger", "Forward"];

/* "1998 to 2003", "2015", "from 2022", or those joined by a comma */
const SPELL = /^(?:from \d{4}|\d{4}(?: to \d{4})?)$/;

(async () => {
  const bank = JSON.parse(fs.readFileSync(path.join(REPO, "assets/nations/index.json"), "utf8"));
  const rows = TIERS.flatMap(t => bank[t]);
  const NOW = new Date().getFullYear();

  console.log("--- the bank kept its shape ---");
  check("all four tiers present", TIERS.every(t => Array.isArray(bank[t])), Object.keys(bank).join(","));
  TIERS.forEach(t => check(`${t} still holds ${SHIPPED[t]} rows`, bank[t].length === SHIPPED[t], bank[t].length));
  check("every row still names a club and a player",
    rows.every(r => r.club && r.slug && r.country && r.flag && r.player),
    rows.filter(r => !(r.club && r.slug && r.country && r.flag && r.player)).length + " broken");

  console.log("\n--- positions read like football ---");
  const badPos = rows.filter(r => r.pos && !POS.includes(r.pos));
  check("no position outside the whitelist", badPos.length === 0, [...new Set(badPos.map(r => r.pos))].join(", "));
  check("nobody is a wing half", !rows.some(r => /wing half/i.test(r.pos || "")),
    rows.filter(r => /wing half/i.test(r.pos || "")).length);

  console.log("\n--- spells are real ranges ---");
  const spells = r => String(r.yr).split(", ");
  const years = s => (s.match(/\d{4}/g) || []).map(Number);
  const shapeBad = rows.filter(r => r.yr && !spells(r).every(p => SPELL.test(p)));
  check("every spell is written in a shape the card knows", shapeBad.length === 0,
    shapeBad.slice(0, 3).map(r => r.player + ": " + r.yr).join(" | "));
  const backwards = rows.filter(r => r.yr && spells(r).some(p => { const y = years(p); return y.length === 2 && y[0] > y[1]; }));
  check("no spell runs backwards", backwards.length === 0, backwards.slice(0, 3).map(r => r.player + ": " + r.yr).join(" | "));
  const outOfRange = rows.filter(r => r.yr && years(r.yr).some(y => y < 1880 || y > NOW + 1));
  check("no year before football or after next season", outOfRange.length === 0,
    outOfRange.slice(0, 3).map(r => r.player + ": " + r.yr).join(" | "));
  /* the loan-inside-the-contract bug: "2007 to 2009, 2007" */
  const overlap = rows.filter(r => {
    const ps = spells(r).filter(p => r.yr).map(p => { const y = years(p); return { a: y[0], b: /^from/.test(p) ? 9999 : (y[1] || y[0]) }; });
    return ps.some((p, i) => i > 0 && p.a <= ps[i - 1].b);
  });
  check("no spell overlaps the one before it", overlap.length === 0,
    overlap.slice(0, 3).map(r => r.player + ": " + r.yr).join(" | "));
  check("open-ended spells never claim an end date",
    rows.every(r => !/from \d{4} to/.test(r.yr || "")), rows.filter(r => /from \d{4} to/.test(r.yr || "")).length);

  console.log("\n--- game counts ---");
  const badApp = rows.filter(r => r.app !== undefined && !(Number.isInteger(r.app) && r.app > 0 && r.app < 1200));
  check("appearance counts are sane whole numbers", badApp.length === 0,
    badApp.slice(0, 3).map(r => r.player + ": " + r.app).join(" | "));

  console.log("\n--- coverage ---");
  const pct = k => Math.round(rows.filter(r => r[k]).length / rows.length * 100);
  console.log(`      position ${pct("pos")}%   years ${pct("yr")}%   games ${pct("app")}%`);
  check("at least 90% of rows say what he played", pct("pos") >= 90, pct("pos") + "%");
  check("at least 80% of rows say when he was there", pct("yr") >= 80, pct("yr") + "%");

  /* ---------- and now the app ---------- */
  const app = makeInstance("nat");
  await tick(400);                                   // let the bank land
  console.log("\n--- the line is built from whatever the row has ---");
  const fact = r => ev(app, `natFact(${JSON.stringify(r)})`);
  check("all three parts joined", fact({ pos: "Winger", yr: "2001 to 2004", app: 88 }) === "Winger · 2001 to 2004 · 88 games",
    fact({ pos: "Winger", yr: "2001 to 2004", app: 88 }));
  check("no game count, no games", fact({ pos: "Winger", yr: "2001 to 2004" }) === "Winger · 2001 to 2004",
    fact({ pos: "Winger", yr: "2001 to 2004" }));
  check("position only", fact({ pos: "Striker" }) === "Striker", fact({ pos: "Striker" }));
  check("an empty row makes no line", fact({}) === null, JSON.stringify(fact({})));

  console.log("\n--- where it shows, and where it must not ---");
  run(app, 'S = freshState(["A","B"], false, "nations", 0); pickTier("easy");');
  await tick(60);
  /* park the app on a row we know is fully filled in, whatever the shuffle did */
  const idx = bank.easy.findIndex(r => r.pos && r.yr && r.app);
  run(app, `S.qi = ${idx}; render();`);
  await tick(60);
  const row = bank.easy[idx];
  const line = ev(app, "natFact(NAT.easy[S.qi])");
  console.log(`      using ${row.player} (${row.club}): ${line}`);

  check("the question card does NOT leak the detail", stage(app).indexOf(line) === -1,
    stage(app).indexOf(line) > -1 ? "found on the question screen" : "");
  check("the question card does not leak the years", stage(app).indexOf(row.yr) === -1, row.yr);

  run(app, "reveal();"); await tick(60);
  check("the judging card shows it", stage(app).indexOf(line) > -1, "not on the judge screen");
  check("it sits under the answer",
    stage(app).indexOf("pfact") > stage(app).indexOf("atext"), "pfact came first");

  run(app, "judge(false);"); await tick(60);          // -> steal offer
  run(app, "claimSteal(1);"); await tick(60);
  run(app, "reveal();"); await tick(60);
  check("a steal judgement shows it too", stage(app).indexOf(line) > -1, ev(app, "S.phase"));

  run(app, 'S.phase="deadq"; render();'); await tick(60);
  check("nobody-got-it shows it", stage(app).indexOf(line) > -1, "missing from deadq");

  /* a row with nothing found must not paint an empty box */
  const bare = bank.easy.findIndex(r => !r.pos && !r.yr);
  if (bare > -1) {
    run(app, `S.qi = ${bare}; S.phase="judge"; render();`); await tick(60);
    check("a row with no detail paints no empty line", stage(app).indexOf("pfact") === -1, "empty pfact rendered");
  } else {
    console.log("  SKIP  every row has detail, nothing to check for the empty case");
  }

  console.log("\n--- written mode reveals it as well ---");
  run(app, 'S = freshState(["A","B"], false, "nations", 0); S.written = true; pickTier("easy"); S.qi = ' + idx + '; S.phase = "w_judge"; render();');
  await tick(60);
  check("w_judge shows the detail", stage(app).indexOf(line) > -1, ev(app, "S.phase"));

  console.log(fails ? `\n${fails} FAILED` : "\nall good");
  process.exit(fails ? 1 : 0);
})();
