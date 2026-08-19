/* Special: the deck about the three of them, and the screen it plays on.

     node _tests/special-test.js

   This is the one mode whose facts are checkable by the people playing it, so
   the bank is held to a higher bar than the rest: nothing half parsed out of
   wikitext, no template braces, no answer that is only a number where a name
   was asked for. Every question also has to name a strand that the app knows
   how to dress, because an unknown strand would drop the badge, the colours
   and the whole point of the mode.

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
const tick = (ms = 200) => new Promise(r => setTimeout(r, ms));
const stage = c => (c.__els["stage"] ? c.__els["stage"].innerHTML : "");
let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x)); if (!c) fails++; };

(async () => {
  const bank = JSON.parse(fs.readFileSync(path.join(REPO, "assets/special/index.json"), "utf8"));
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");

  console.log("--- the deck ---");
  check("a proper deck, not a handful", bank.length >= 40, bank.length);
  check("every question has a strand, a price, a question and an answer",
    bank.every(q => q.s && q.p && q.q && q.a), bank.filter(q => !(q.s && q.p && q.q && q.a)).length + " broken");
  const strands = [...new Set(bank.map(q => q.s))].sort();
  check("all five strands are represented", strands.join(",") === "es,lp,ma,mvv,nl", strands.join(","));
  check("every strand has enough to be worth dealing",
    strands.every(s => bank.filter(q => q.s === s).length >= 5),
    strands.map(s => s + ":" + bank.filter(q => q.s === s).length).join(" "));

  /* the thing that would embarrass him: a half parsed fact on screen */
  check("no wikitext survived into a question",
    bank.every(q => !/[{}|\[\]]/.test(q.q + q.a)),
    (bank.find(q => /[{}|\[\]]/.test(q.q + q.a)) || {}).a);
  check("no dashes, the house rule",
    bank.every(q => !/[‒-―]/.test(q.q + q.a + (q.note || ""))), "found one");
  /* Some prompts are questions and some are statements that end in an
     instruction ("MVV have won it twice. Name any one of the years."). Both
     read fine; a fragment with no terminal punctuation does not. */
  const END = /[?.]$/;
  check("every prompt is a finished sentence",
    bank.every(q => END.test(q.q.trim())),
    (bank.find(q => !END.test(q.q.trim())) || {}).q);
  check("no answer is left empty or absurdly long",
    bank.every(q => q.a.length > 0 && q.a.length <= 160), "one is");
  check("prices are sane", bank.every(q => q.p >= 1 && q.p <= 20), [...new Set(bank.map(q => q.p))].join(","));
  check("counts are written in words, not digits",
    bank.every(q => !/\b\d+ times\b/.test(q.q)), (bank.find(q => /\b\d+ times\b/.test(q.q)) || {}).q);
  check("no question is asked twice", new Set(bank.map(q => q.q)).size === bank.length,
    bank.length - new Set(bank.map(q => q.q)).size);

  /* the strands the app can dress */
  const meta = html.slice(html.indexOf("const SPEC_META = {"), html.indexOf("};", html.indexOf("const SPEC_META = {")) + 2);
  for (const s of strands) check(`the app knows how to dress "${s}"`, meta.includes(s + ":"), "missing from SPEC_META");
  const imgs = [...meta.matchAll(/img:"([^"]+)"/g)].map(m => m[1]);
  check("every emblem is on disk", imgs.every(f => fs.existsSync(path.join(REPO, f))),
    imgs.filter(f => !fs.existsSync(path.join(REPO, f))).join(", "));
  check("five emblems, one per strand", imgs.length === 5, imgs.length);

  const app = makeInstance("spec");
  await tick(400);
  check("the app loaded the deck", ev(app, "SPEC && SPEC.length") === bank.length, ev(app, "SPEC && SPEC.length"));

  console.log("\n--- a question ---");
  run(app, 'S = freshState(["Ale","Bram","Martijn"], false, "spec", 0); newSpecial();');
  await tick(60);
  check("deals one", ev(app, "S.spec && S.spec.qi >= 0"), JSON.stringify(ev(app, "S.spec")));
  check("and opens on the question", ev(app, "S.phase") === "sp_q", ev(app, "S.phase"));
  const q = ev(app, "SPEC[S.spec.qi]");
  check("the question is on screen", stage(app).includes(q.q.slice(0, 24)), "missing");
  check("the answer is NOT", !stage(app).includes(q.a), q.a);
  check("the strand badge is up", stage(app).includes("specbadge"), "no badge");
  check("and so is the moving backdrop", stage(app).includes("specsky") && stage(app).includes("specdrift"), "no animation layer");

  run(app, "specReveal()");
  await tick(30);
  check("revealing shows the answer", stage(app).includes(q.a), "still hidden");
  check("and offers the judgement", stage(app).includes("specJudge(true)"), "no buttons");

  console.log("\n--- scoring ---");
  run(app, 'S.players.forEach(p=>p.score=0); S.turn=1; S.spec={qi:S.spec.qi}; S.phase="sp_a"; const was=SPEC[S.spec.qi].p; specJudge(true);');
  await tick(30);
  check("a correct answer pays the question's price", ev(app, "S.players[1].score") > 0, ev(app, "S.players[1].score"));
  check("and the go passes", ev(app, "S.turn") === 2, ev(app, "S.turn"));
  check("and a fresh question is dealt", ev(app, "S.phase") === "sp_q", ev(app, "S.phase"));

  run(app, 'S.players.forEach(p=>p.score=0); S.turn=0; S.phase="sp_a"; specJudge(false);');
  await tick(30);
  check("a wrong answer costs nothing", ev(app, "S.players[0].score") === 0, ev(app, "S.players[0].score"));
  check("but still passes the go", ev(app, "S.turn") === 1, ev(app, "S.turn"));

  console.log("\n--- the deck and the resume ---");
  run(app, 'S = freshState(["Ale","Bram"], false, "spec", 0);');
  const seen = new Set();
  for (let n = 0; n < 30; n++) { run(app, "newSpecial()"); seen.add(ev(app, "S.spec.qi")); }
  check("thirty deals, thirty different questions", seen.size === 30, seen.size);
  run(app, 'const o = JSON.parse(JSON.stringify(S)); delete o.usedS; localStorage.setItem("ball-quiz-save-v1", JSON.stringify(o)); resumeGame();');
  await tick(30);
  check("a save from before this mode existed still opens", Array.isArray(ev(app, "S.usedS")), ev(app, "S.usedS"));

  console.log("\n--- the facts themselves ---");
  /* spot checks against what the articles say, so a future re-harvest that
     quietly reads the wrong table gets caught here rather than at the table */
  const find = re => bank.find(q => re.test(q.q));
  const mvvEuro = find(/MVV have won a European trophy/);
  check("MVV's European trophy is the Intertoto Cup of 1970",
    !!mvvEuro && /Intertoto/.test(mvvEuro.a) && /1970/.test(mvvEuro.a), mvvEuro && mvvEuro.a);
  const lpLiga = find(/Las Palmas finished runners-up in La Liga/);
  check("Las Palmas' La Liga runners-up season is 1968-69", !!lpLiga && /1968-69/.test(lpLiga.a), lpLiga && lpLiga.a);
  const maTop = find(/Who is Morocco's all time leading goalscorer/);
  check("Morocco's leading scorer is Ahmed Faras", !!maTop && /Faras/.test(maTop.a), maTop && maTop.a);
  const nlCaps = find(/Who has won the most caps for the Netherlands/);
  check("the most capped Dutchman is Wesley Sneijder", !!nlCaps && /Sneijder/.test(nlCaps.a), nlCaps && nlCaps.a);
  const esTop = find(/Who is Spain's all time leading goalscorer/);
  check("Spain's leading scorer is David Villa", !!esTop && /Villa/.test(esTop.a), esTop && esTop.a);

  console.log(fails ? `\n${fails} FAILING CHECK(S)` : "\nAll checks passed.");
  process.exit(fails ? 1 : 0);
})();
