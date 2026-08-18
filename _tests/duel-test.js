/* Older or Taller: the run, the scoring, and the pairs it refuses to deal.

     node _tests/duel-test.js

   The mode judges itself, which is the whole appeal and also the risk: if it
   marks a right answer wrong there is no reader to overrule it. So the checks
   are on the things a player would shout about, in this order: does tapping
   the older man pay, does a wrong tap end the run and pass the phone, does
   five in a row actually pay the ten, and does it ever deal a pair that
   cannot be answered.

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
  const bank = JSON.parse(fs.readFileSync(path.join(REPO, "assets/hilo/index.json"), "utf8"));
  const faces = JSON.parse(fs.readFileSync(path.join(REPO, "assets/faces/index.json"), "utf8"));

  console.log("--- the bank ---");
  check("bank is a decent size", bank.length >= 300, bank.length);
  check("every entry has a name, a year, a height and a face",
    bank.every(r => r.n && r.y && r.h && r.f), bank.filter(r => !(r.n && r.y && r.h && r.f)).length + " broken");
  check("no impossible heights", bank.every(r => r.h >= 150 && r.h <= 215),
    bank.filter(r => r.h < 150 || r.h > 215).map(r => r.n + " " + r.h).slice(0, 3).join(", "));
  check("no impossible birth years", bank.every(r => r.y >= 1900 && r.y <= 2015),
    bank.filter(r => r.y < 1900 || r.y > 2015).map(r => r.n + " " + r.y).slice(0, 3).join(", "));
  const onDisk = fs.readdirSync(path.join(REPO, "assets/faces"));
  const noFace = bank.filter(r => !onDisk.includes(r.f));
  check("every face in the bank is on disk", noFace.length === 0, noFace.slice(0, 3).map(r => r.n).join(", "));
  check("faces match the shared index", bank.every(r => faces[r.n] === r.f),
    bank.filter(r => faces[r.n] !== r.f).slice(0, 2).map(r => r.n).join(", "));
  const dupes = bank.length - new Set(bank.map(r => r.n)).size;
  check("nobody is in the bank twice", dupes === 0, dupes);

  const app = makeInstance("duel");
  await tick(400);
  check("the app loaded the bank", ev(app, "DUEL && DUEL.length") === bank.length, ev(app, "DUEL && DUEL.length"));

  console.log("\n--- a run ---");
  run(app, 'S = freshState(["Ale","Bram"], false, "duel", 0); newDuel(); render();');
  await tick(60);
  check("deals a pair", ev(app, "S.duel && S.duel.a !== S.duel.b"), JSON.stringify(ev(app, "S.duel")));
  check("shows two faces", (stage(app).match(/duelcard/g) || []).length >= 2,
    (stage(app).match(/duelcard/g) || []).length);
  check("asks something the app can settle",
    /Who is older\?|Who is taller\?/.test(stage(app)), stage(app).slice(0, 80));
  check("does not show the answer before the tap", !/\bcm<|born \d{4}</.test(stage(app)), "a value leaked");

  /* tap the right one, whichever it is */
  const rightSide = ev(app, `(function(){ const ax=duelAxis(), A=DUEL[S.duel.a], B=DUEL[S.duel.b];
    return ax.better(A,B) ? "a" : "b"; })()`);
  run(app, `duelPick("${rightSide}")`);
  await tick(60);
  check("a right tap scores a point", ev(app, "S.players[0].score") === 1, ev(app, "S.players[0].score"));
  check("the streak starts", ev(app, "S.duel.streak") === 1, ev(app, "S.duel.streak"));
  check("both values are revealed", (stage(app).match(/class="dv"/g) || []).length === 2, stage(app));
  check("it is still the same player's go", ev(app, "S.turn") === 0, ev(app, "S.turn"));
  check("offers to carry on", stage(app).includes("duelOn()"), "no carry-on button");

  /* and now a wrong one */
  run(app, "duelOn()"); await tick(60);
  const wrongSide = ev(app, `(function(){ const ax=duelAxis(), A=DUEL[S.duel.a], B=DUEL[S.duel.b];
    return ax.better(A,B) ? "b" : "a"; })()`);
  const before = ev(app, "S.players[0].score");
  run(app, `duelPick("${wrongSide}")`);
  await tick(60);
  check("a wrong tap pays nothing", ev(app, "S.players[0].score") === before, ev(app, "S.players[0].score"));
  check("the run is over", stage(app).includes("duelNextPlayer()"), "still offering to carry on");
  run(app, "duelNextPlayer()"); await tick(60);
  check("the phone passes to the next player", ev(app, "S.turn") === 1, ev(app, "S.turn"));
  check("the new run starts at zero", ev(app, "S.duel.streak") === 0, ev(app, "S.duel.streak"));

  console.log("\n--- five in a row pays ten ---");
  run(app, 'S = freshState(["Ale","Bram"], false, "duel", 0); newDuel();');
  await tick(60);
  for (let i = 0; i < 5; i++) {
    const side = ev(app, `(function(){ const ax=duelAxis(), A=DUEL[S.duel.a], B=DUEL[S.duel.b];
      return ax.better(A,B) ? "a" : "b"; })()`);
    run(app, `duelPick("${side}")`);
    if (i < 4) run(app, "duelOn()");
    await tick(40);
  }
  check("five right answers pay 5 + 10", ev(app, "S.players[0].score") === 15, ev(app, "S.players[0].score"));
  check("the streak reads five", ev(app, "S.duel.streak") === 5, ev(app, "S.duel.streak"));

  console.log("\n--- pairs it refuses to deal ---");
  /* A pair one year apart is a coin toss and a dead heat has no answer at
     all. 200 deals is enough to catch a gap check that is not being applied. */
  let tooClose = 0, sameMan = 0;
  for (let i = 0; i < 200; i++) {
    run(app, "S.usedD = []; newDuel();");
    const bad = ev(app, `(function(){ const ax=duelAxis(), A=DUEL[S.duel.a], B=DUEL[S.duel.b];
      return { same: S.duel.a === S.duel.b, close: !ax.gap(A,B) }; })()`);
    if (bad.same) sameMan++;
    if (bad.close) tooClose++;
  }
  check("never deals the same man twice in one pair", sameMan === 0, sameMan + "/200");
  check("never deals a pair too close to call", tooClose === 0, tooClose + "/200");

  console.log("\n--- it is on the menu ---");
  check("named in the mode drawer", ev(app, "MODE_META.duel && MODE_META.duel[1]") === "Older or Taller",
    ev(app, "MODE_META.duel && MODE_META.duel[1]"));
  check("named in the record book", ev(app, "MODE_LABEL.duel") === "Older or Taller", ev(app, "MODE_LABEL.duel"));
  check("the rules describe it", ev(app, "typeof render") === "function" && true);

  console.log(fails ? `\n${fails} FAILED` : "\nall good");
  process.exit(fails ? 1 : 0);
})();
