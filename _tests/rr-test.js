/* Rainbow Road: the mode that plays all the others.

     node _tests/rr-test.js

   The risk here is not the rolling, it is the handover. Every mode ends its go
   somewhere different (nextTurn, wNext, tlNext, rushNextPlayer,
   duelNextPlayer, cAfter, cJudge, xiAfter) and each one had to learn to give
   the ball back. Miss one and that mode becomes a dead end: the match sits on
   its last screen and never rolls again, which no error would tell you about.

   So the checks are: does every handover roll, does the phone actually go
   round, does the turn pointer survive the modes that park or ignore S.turn,
   and does the night file itself as Rainbow Road rather than as whatever was on
   the board at the whistle.

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
let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x)); if (!c) fails++; };

(async () => {
  const app = makeInstance("rr");
  await tick(700);                       // let every bank land

  run(app, `S = freshState(["Ale","Bram","Martijn"], false, "classic", 0);
            S.rr = true; S.rrTurn = 0; rrDeal(false);`);

  console.log("--- the roll ---");
  const POOL = JSON.parse(ev(app, "JSON.stringify(RR_POOL)"));
  check("seventeen modes in the pool", POOL.length === 17, POOL.length);
  check("opens on a real mode", POOL.includes(ev(app, "S.mode")), ev(app, "S.mode"));
  check("every pooled mode has a label",
    POOL.every(m => !!ev(app, `MODE_LABEL[${JSON.stringify(m)}]`)),
    POOL.filter(m => !ev(app, `MODE_LABEL[${JSON.stringify(m)}]`)).join(","));
  check("Rainbow Road can say its own name", ev(app, "MODE_LABEL.rr") === "Rainbow Road", ev(app, "MODE_LABEL.rr"));
  check("but is not a mode you can be dealt", !POOL.includes("rr"));

  /* Every mode's phase machine starts somewhere specific. A roll that leaves
     the phase where the last mode left it renders the wrong screen. */
  console.log("\n--- 60 goes, every mode dealt into its own opening screen ---");
  const START = { career:"c_play", mgr:"c_play", xi:"x_play", tline:"tl_play", duel:"d_play", rush:"g_pick", alum:"al_play", wall:"wl_play", mys:"my_play", ord:"tl_play", bid:"b_bid" };
  const seen = {}, badPhase = [], repeats = [];
  let last = ev(app, "S.mode");
  seen[last] = 1;
  for (let i = 0; i < 60; i++) {
    run(app, "rrNext()");
    const m = ev(app, "S.mode"), ph = ev(app, "S.phase");
    if (m === last) repeats.push(m);
    if ((START[m] || "pick") !== ph) badPhase.push(`${m} opened on ${ph}`);
    seen[m] = (seen[m] || 0) + 1;
    last = m;
  }
  check("no mode lands twice running", repeats.length === 0, repeats.join(","));
  check("every mode opens on its own first phase", badPhase.length === 0, badPhase.join("; "));
  check("the roll reaches most of the pool over 60 goes", Object.keys(seen).length >= 9,
    Object.keys(seen).length + ": " + Object.keys(seen).join(","));

  console.log("\n--- the phone goes round ---");
  run(app, `S = freshState(["Ale","Bram","Martijn"], false, "classic", 0);
            S.rr = true; S.rrTurn = 0; rrDeal(false);`);
  const turns = [];
  for (let i = 0; i < 9; i++) { turns.push(ev(app, "S.rrTurn")); run(app, "rrNext()"); }
  check("the pointer rotates through all three", JSON.stringify(turns) === JSON.stringify([0,1,2,0,1,2,0,1,2]), turns.join(","));
  check("the round counts up once per lap", ev(app, "S.round") === 4, ev(app, "S.round"));

  /* Three modes park S.turn at -1 because the whole table plays at once: Name
     the XI, Career Path and Manager Path. If the next deal read S.turn instead
     of S.rrTurn, any of them would silently reset the rotation to whoever came
     after -1, which is player 0 every time. Rolled 40 times so both kinds of
     mode are certain to come up. */
  console.log("\n--- a communal mode does not eat the rotation ---");
  const COMMUNAL = ["xi", "career", "mgr", "alum", "wall"];
  let solo = 0, kept = 0, lostTurn = [], lostPointer = [];
  for (let i = 0; i < 40; i++) {
    run(app, `S = freshState(["Ale","Bram","Martijn"], false, "classic", 0);
              S.rr = true; S.rrTurn = 2; S.turn = -1; rrDeal(false);`);
    const m = ev(app, "S.mode");
    if (ev(app, "S.rrTurn") !== 2) lostPointer.push(m);
    if (COMMUNAL.includes(m)) { kept++; continue; }        // -1 on purpose: nobody is on the spot
    solo++;
    if (ev(app, "S.turn") !== 2) lostTurn.push(m + " gave the go to " + ev(app, "S.turn"));
  }
  check("both kinds of mode came up", solo > 0 && kept > 0, `${solo} solo, ${kept} communal`);
  check("a solo mode hands the go to the player whose turn it is", lostTurn.length === 0, lostTurn.join("; "));
  check("and the pointer itself is never touched by the deal", lostPointer.length === 0, lostPointer.join(","));

  console.log("\n--- every mode gives the ball back ---");
  /* Drive each handover directly: this is the check that would have caught a
     mode whose ending was never wired up. */
  for (const [fn, mode] of [["nextTurn", "classic"], ["wNext", "written"], ["tlNext", "tline"],
                            ["rushNextPlayer", "rush"], ["duelNextPlayer", "duel"],
                            ["cAfter", "career"], ["xiAfter", "xi"]]) {
    run(app, `S = freshState(["Ale","Bram"], false, ${JSON.stringify(mode)}, 0);
              S.rr = true; S.rrTurn = 0; S.rrLast = ${JSON.stringify(mode)}; S.mode = ${JSON.stringify(mode)}; ${fn}();`);
    const rolled = ev(app, "S.mode") !== mode && ev(app, "S.rrTurn") === 1;
    check(`${fn} rolls a new mode and passes on`, rolled, ev(app, "S.mode") + " / turn " + ev(app, "S.rrTurn"));
  }

  console.log("\n--- the record book ---");
  run(app, `S = freshState(["Ale","Bram"], false, "classic", 0);
            S.rr = true; S.mode = "tline"; S.players[0].score = 12; recordMatch();`);
  const rec = JSON.parse(ev(app, "JSON.stringify(history()[history().length-1])"));
  check("files as Rainbow Road, not as the mode it ended on", rec.mode === "rr", rec.mode);
  check("and The Table has a chip for it", ev(app, "MODE_LABEL.rr") === "Rainbow Road", ev(app, "MODE_LABEL.rr"));

  console.log("\n--- a saved match knows it was Rainbow Road ---");
  run(app, `S = freshState(["Ale","Bram"], false, "classic", 0); S.rr = true; S.rrTurn = 1; save();`);
  run(app, "S = null; resumeGame();");
  check("the flag survives a resume", ev(app, "S && S.rr === true"), ev(app, "S && S.rr"));
  check("and so does whose go it is", ev(app, "S && S.rrTurn") === 1, ev(app, "S && S.rrTurn"));
  /* Saves written before this mode existed have no flag at all, and must not
     come back as a Rainbow Road match. */
  run(app, `const old = JSON.parse(JSON.stringify(freshState(["Ale","Bram"], false, "stadium", 0)));
            delete old.rr; delete old.rrTurn; delete old.rrLast;
            localStorage.setItem(SAVE_KEY, JSON.stringify(old)); S = null; resumeGame();`);
  check("an older save is not turned into one", ev(app, "S && S.rr === false"), ev(app, "S && S.rr"));

  console.log(fails ? `\n${fails} FAILING CHECK(S)` : "\nAll checks passed.");
  process.exit(fails ? 1 : 0);
})();
