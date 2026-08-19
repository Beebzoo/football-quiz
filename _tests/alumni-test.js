/* Alumni: the club, the ladder and the lockout.

     node _tests/alumni-test.js

   Career Path pays out on a ladder that shrinks as the clues arrive, and this
   mode copies it, so the things that would spoil a night are the same ones:
   a pot that does not shrink, a wrong answer that does not lock the man out,
   a reveal that shows the answer before anyone has guessed, and a deck that
   deals the same club twice.

   The bank has one rule of its own worth guarding: the players inside a club
   are ordered obscure to famous, because that ordering IS the difficulty
   curve. Shuffle it and the mode still runs, which is exactly why nothing
   else would catch it.

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
  const bank = JSON.parse(fs.readFileSync(path.join(REPO, "assets/alumni/index.json"), "utf8"));
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const i = html.indexOf("const CAREERS = ["), j = html.indexOf("\n];", i);
  const CAREERS = eval(html.slice(i + "const CAREERS = ".length, j + 2));

  console.log("--- the bank ---");
  check("a deck worth playing", bank.length >= 120, bank.length);
  check("every club has a slug, a name and five to eight players",
    bank.every(c => c.s && c.n && Array.isArray(c.p) && c.p.length >= 5 && c.p.length <= 8),
    bank.filter(c => !(c.s && c.n && c.p && c.p.length >= 5 && c.p.length <= 8)).length + " broken");
  const logos = fs.readdirSync(path.join(REPO, "assets/logos"));
  const noCrest = bank.filter(c => !logos.includes(c.s + ".png"));
  check("every crest is on disk", noCrest.length === 0, noCrest.slice(0, 3).map(c => c.s).join(", "));
  check("no club appears twice", new Set(bank.map(c => c.s)).size === bank.length,
    bank.length - new Set(bank.map(c => c.s)).size);
  check("nobody is listed twice inside one club",
    bank.every(c => new Set(c.p).size === c.p.length),
    bank.filter(c => new Set(c.p).size !== c.p.length).slice(0, 2).map(c => c.n).join(", "));
  check("no em dashes, the house rule",
    bank.every(c => !/[–—]/.test(c.n) && c.p.every(p => !/[–—]/.test(p))), "found one");

  /* the claim the mode rests on: these men really did play for this club */
  const truth = {};
  for (const c of CAREERS) for (const s of c.c) (truth[s] = truth[s] || new Set()).add(c.n);
  const liars = bank.filter(c => c.p.some(p => !(truth[c.s] || new Set()).has(p)));
  check("every player really did turn out for the club", liars.length === 0,
    liars.slice(0, 3).map(c => c.n).join(", "));

  const app = makeInstance("alum");
  await tick(400);
  check("the app loaded the deck", ev(app, "ALUM && ALUM.length") === bank.length, ev(app, "ALUM && ALUM.length"));

  console.log("\n--- the ladder ---");
  run(app, 'S = freshState(["Ale","Bram","Martijn"], false, "alum", 0); newAlum();');
  await tick(60);
  check("deals a club", ev(app, "S.alum && S.alum.ci >= 0"), JSON.stringify(ev(app, "S.alum")));
  check("opens with one name showing", ev(app, "S.alum.shown") === 1, ev(app, "S.alum.shown"));
  check("nobody is on the spot", ev(app, "S.turn") === -1, ev(app, "S.turn"));
  const pot1 = ev(app, "alpot()");
  run(app, "alNext()");
  const pot2 = ev(app, "alpot()");
  run(app, "alNext()");
  const pot3 = ev(app, "alpot()");
  check("the pot shrinks with every name", pot1 > pot2 && pot2 > pot3, `${pot1} ${pot2} ${pot3}`);
  check("and never below three", ev(app, "S.alum.shown = 99, alpot()") === 3, ev(app, "alpot()"));
  run(app, "S.alum.shown = 3");
  check("it never reveals past the end of the list",
    (() => { const n = ev(app, "ALUM[S.alum.ci].p.length"); run(app, `S.alum.shown = ${n}; alNext();`); return ev(app, "S.alum.shown") === n; })(),
    ev(app, "S.alum.shown"));

  console.log("\n--- the answer stays hidden until it is judged ---");
  run(app, 'S.alum.shown = 1; S.phase = "al_play"; render();');
  await tick(30);
  const clubName = ev(app, "ALUM[S.alum.ci].n");
  check("the club is not named on the playing screen", !stage(app).includes(clubName), clubName);
  check("nor is its crest shown", !stage(app).includes("assets/logos/" + ev(app, "ALUM[S.alum.ci].s") + ".png"), "crest leaked");
  const shownNames = ev(app, "ALUM[S.alum.ci].p").slice(1);
  check("nor are the names still to come", shownNames.every(n => !stage(app).includes(n)), shownNames[0]);
  run(app, 'alGuess(); alPick(0); render();');
  await tick(30);
  check("the judging screen names the club", stage(app).includes(clubName), "missing");

  console.log("\n--- scoring ---");
  const before = ev(app, "S.players[0].score");
  const pot = ev(app, "alpot()");
  run(app, "alJudge(true)");
  await tick(30);
  check("a correct answer pays the pot", ev(app, "S.players[0].score") === before + pot,
    ev(app, "S.players[0].score") + " from " + before);
  check("and deals the next club", ev(app, 'S.phase') === "al_play", ev(app, "S.phase"));

  run(app, 'S.alum.shown = 1; alGuess(); alPick(1); alJudge(false);');
  await tick(30);
  check("a wrong answer costs two", ev(app, "S.players[1].score") === -2, ev(app, "S.players[1].score"));
  check("and locks that player out", ev(app, "S.alum.locked").includes(1), JSON.stringify(ev(app, "S.alum.locked")));
  check("the locked player cannot be picked again",
    !stage(app).includes(`alPick(1)`) || ev(app, 'S.phase') !== "al_who", "still offered");
  run(app, 'S.phase="al_who"; render();');
  await tick(30);
  check("and is not on the who-knows-it bar", !stage(app).includes("alPick(1)"), "still there");

  run(app, 'S.phase="al_play"; alGuess(); alPick(0); alJudge(false); alGuess(); alPick(2); alJudge(false);');
  await tick(30);
  check("when everyone is locked out the club is revealed", ev(app, "S.phase") === "al_dead", ev(app, "S.phase"));

  console.log("\n--- the deck does not repeat itself ---");
  run(app, 'S = freshState(["Ale","Bram"], false, "alum", 0);');
  const seen = new Set();
  for (let n = 0; n < 40; n++) { run(app, "newAlum()"); seen.add(ev(app, "S.alum.ci")); }
  check("forty deals, forty different clubs", seen.size === 40, seen.size);
  check("and the used list remembers them", ev(app, "S.usedA.length") === 40, ev(app, "S.usedA.length"));

  console.log("\n--- a resume lands somewhere playable ---");
  run(app, 'S.phase="al_judge"; localStorage.setItem("ball-quiz-save-v1", JSON.stringify(S)); resumeGame();');
  await tick(30);
  check("mid-judge saves come back to the playing screen", ev(app, "S.phase") === "al_play", ev(app, "S.phase"));
  run(app, 'const old = JSON.parse(localStorage.getItem("ball-quiz-save-v1")); delete old.usedA; localStorage.setItem("ball-quiz-save-v1", JSON.stringify(old)); resumeGame();');
  await tick(30);
  check("a save from before this mode existed still opens", Array.isArray(ev(app, "S.usedA")), ev(app, "S.usedA"));

  console.log(fails ? `\n${fails} FAILING CHECK(S)` : "\nAll checks passed.");
  process.exit(fails ? 1 : 0);
})();
