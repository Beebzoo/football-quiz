/* Manager Path regression test: the dugout deck plays the Career Path game
   without touching the player deck, the two decks keep separate used-lists,
   and Higher or Lower is genuinely gone.

     node _tests/manager-test.js

   Reuses the stub DOM and fake realtime bus from mp-test.js. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, ""));

const ev = (ctx, e) => vm.runInContext("(" + e + ")", ctx);
const run = (ctx, s) => vm.runInContext(s, ctx);
const tick = (ms = 260) => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + JSON.stringify(x))); if (!c) fails++; };
const stage = c => (c.__els["stage"] ? c.__els["stage"].innerHTML : "");

(async () => {
  const app = makeInstance("solo");
  await tick(60);
  // the real deck arrives by fetch, which the stub cannot do
  run(app, 'MGRS = [{n:"Guus Hiddink", c:["psv","real-madrid","dutch-national-team"]},' +
           '{n:"Rinus Michels", c:["ajax","barcelona","dutch-national-team","koln"]}];');

  /* newCareer opens with a 1.2s centre-stage reveal and holds a `revealing`
     guard for its duration, so anything that drives the round has to wait it
     out or it is silently ignored. */
  const REVEAL = 1400;

  console.log("--- the deck the mode draws from ---");
  run(app, 'S = freshState(["A","B"], false, "mgr", 0); newCareer();'); await tick(REVEAL);
  check("mgr mode reads the manager deck", ev(app, "cdeck().length") === 2, ev(app, "cdeck().length"));
  check("a manager career is live", ev(app, "S.career !== null"));
  check("named man is a manager", /Hiddink|Michels/.test(ev(app, "cdeck()[S.career.ci].n")), ev(app, "cdeck()[S.career.ci].n"));
  check("first crest shown", ev(app, "S.career.shown") === 1, ev(app, "S.career.shown"));
  check("card header says Manager Path", /Manager Path · Round/.test(stage(app)), stage(app).slice(0, 90));
  check("counts jobs, not clubs", stage(app).indexOf("jobs in this dugout career") > -1, stage(app).slice(0, 90));
  check("crest on the card is a real manager club",
    /assets\/logos\/(psv|ajax)\.png/.test(stage(app)), (stage(app).match(/assets\/logos\/[a-z-]+\.png/) || [])[0]);

  console.log("\n--- scoring is Career Path's, unchanged ---");
  check("first crest pays 15", ev(app, "cpot()") === 15, ev(app, "cpot()"));
  run(app, "cNext()"); await tick(REVEAL);
  check("second crest shown", ev(app, "S.career.shown") === 2, ev(app, "S.career.shown"));
  check("second crest pays 12", ev(app, "cpot()") === 12, ev(app, "cpot()"));
  run(app, 'S.career.guesser = 0; cJudge(true);'); await tick(60);
  check("correct guess pays the pot", ev(app, "S.players[0].score") === 12, ev(app, "S.players[0].score"));

  console.log("\n--- the two decks stay apart ---");
  run(app, 'S = freshState(["A","B"], false, "mgr", 0);');
  run(app, "newCareer()"); await tick(REVEAL);
  check("manager picks land in usedM", ev(app, "S.usedM.length") === 1, ev(app, "S.usedM.length"));
  check("player used-list untouched", ev(app, "S.usedC.length") === 0, ev(app, "S.usedC.length"));
  run(app, 'S = freshState(["A","B"], false, "career", 0);');
  run(app, "newCareer()"); await tick(REVEAL);
  check("career mode reads the player deck", ev(app, "cdeck().length") === ev(app, "CAREERS.length"), ev(app, "cdeck().length"));
  check("player picks land in usedC", ev(app, "S.usedC.length") === 1, ev(app, "S.usedC.length"));
  check("manager used-list untouched", ev(app, "S.usedM.length") === 0, ev(app, "S.usedM.length"));

  console.log("\n--- the deck runs out and reshuffles rather than hanging ---");
  run(app, 'S = freshState(["A","B"], false, "mgr", 0); S.usedM = [0,1];');
  run(app, "newCareer()"); await tick(REVEAL);
  check("exhausted deck reshuffles", ev(app, "S.usedM.length") === 1, ev(app, "S.usedM.length"));
  check("still deals a career", ev(app, "S.career !== null"));

  console.log("\n--- an empty deck must not deal a broken round ---");
  run(app, 'MGRS = null; S = freshState(["A","B"], false, "mgr", 0); S.phase = "setup";');
  run(app, "newCareer()"); await tick(200);
  check("no career dealt with no deck", ev(app, "S.career === null"), ev(app, "S.career"));
  check("mode is offered as unavailable", ev(app, "!MGRS"));
  run(app, 'MGRS = [{n:"Guus Hiddink", c:["psv","real-madrid","dutch-national-team"]}];');

  console.log("\n--- Higher or Lower is gone, not hiding ---");
  ["hiloGuess", "newHilo", "hiloNextPlayer", "pickH", "hiloPool"].forEach(fn =>
    check(fn + " removed", ev(app, `typeof ${fn}`) === "undefined", ev(app, `typeof ${fn}`)));
  check("not in the mode menu", ev(app, 'Object.keys(MODE_META).indexOf("hilo")') === -1);
  check("not in the mode labels", ev(app, 'MODE_LABEL.hilo === undefined'));
  check("Manager Path is in the menu", ev(app, 'Object.keys(MODE_META).indexOf("mgr")') > -1);

  console.log("\n--- a saved Higher or Lower match cannot strand the app ---");
  run(app, 'localStorage.setItem(SAVE_KEY, JSON.stringify({phase:"h_play", mode:"hilo", players:[{name:"A",score:0,off:0}], turn:0, round:1, hilo:{streak:0}}));');
  run(app, "resumeGame()"); await tick(60);
  check("retired match drops to the menu", ev(app, "S === null"), ev(app, "S && S.mode"));

  console.log("\n--- the shipped bank matches what the game expects ---");
  const bank = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets/managers/index.json"), "utf8"));
  const logos = new Set(fs.readdirSync(path.join(__dirname, "..", "assets/logos"))
    .filter(f => f.endsWith(".png")).map(f => f.slice(0, -4)));
  check("bank is a non-empty list", Array.isArray(bank) && bank.length > 100, bank.length);
  check("every entry has a name", bank.every(m => typeof m.n === "string" && m.n.length), 0);
  check("every career has 3+ jobs", bank.every(m => Array.isArray(m.c) && m.c.length >= 3),
    (bank.find(m => !m.c || m.c.length < 3) || {}).n);
  check("no crest is missing from disk", bank.every(m => m.c.every(s => logos.has(s))),
    bank.flatMap(m => m.c).find(s => !logos.has(s)));
  check("no career repeats a club back to back",
    bank.every(m => m.c.every((s, i) => i === 0 || s !== m.c[i - 1])),
    (bank.find(m => m.c.some((s, i) => i > 0 && s === m.c[i - 1])) || {}).n);

  const sw = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");
  const cached = new Set((sw.match(/"[a-z0-9-]+"/g) || []).map(s => s.slice(1, -1)));
  const uncached = [...new Set(bank.flatMap(m => m.c))].filter(s => !cached.has(s));
  check("every manager crest is precached for offline", uncached.length === 0, uncached.slice(0, 5));

  console.log(fails ? `\n${fails} FAILED` : "\nall green");
  process.exit(fails ? 1 : 0);
})();
