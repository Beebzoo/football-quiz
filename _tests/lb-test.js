/* Let's Ball: the mode that plays all the others.

     node _tests/lb-test.js

   The risk here is not the rolling, it is the handover. Every mode ends its go
   somewhere different (nextTurn, wNext, tlNext, rushNextPlayer,
   duelNextPlayer, cAfter, cJudge, xiAfter) and each one had to learn to give
   the ball back. Miss one and that mode becomes a dead end: the match sits on
   its last screen and never rolls again, which no error would tell you about.

   So the checks are: does every handover roll, does the phone actually go
   round, does the turn pointer survive the modes that park or ignore S.turn,
   and does the night file itself as Let's Ball rather than as whatever was on
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
  const app = makeInstance("lb");
  await tick(700);                       // let every bank land

  run(app, `S = freshState(["Ale","Bram","Martijn"], false, "classic", 0);
            S.lb = true; S.lbTurn = 0; lbDeal(false);`);

  console.log("--- the roll ---");
  const POOL = JSON.parse(ev(app, "JSON.stringify(LB_POOL)"));
  check("twelve modes in the pool", POOL.length === 12, POOL.length);
  check("opens on a real mode", POOL.includes(ev(app, "S.mode")), ev(app, "S.mode"));
  check("every pooled mode has a label",
    POOL.every(m => !!ev(app, `MODE_LABEL[${JSON.stringify(m)}]`)),
    POOL.filter(m => !ev(app, `MODE_LABEL[${JSON.stringify(m)}]`)).join(","));
  check("Let's Ball can say its own name", ev(app, "MODE_LABEL.lb") === "Let's Ball", ev(app, "MODE_LABEL.lb"));
  check("but is not a mode you can be dealt", !POOL.includes("lb"));

  /* Every mode's phase machine starts somewhere specific. A roll that leaves
     the phase where the last mode left it renders the wrong screen. */
  console.log("\n--- 60 goes, every mode dealt into its own opening screen ---");
  const START = { career:"c_play", mgr:"c_play", xi:"x_play", tline:"tl_play", duel:"d_play", rush:"g_pick" };
  const seen = {}, badPhase = [], repeats = [];
  let last = ev(app, "S.mode");
  seen[last] = 1;
  for (let i = 0; i < 60; i++) {
    run(app, "lbNext()");
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
            S.lb = true; S.lbTurn = 0; lbDeal(false);`);
  const turns = [];
  for (let i = 0; i < 9; i++) { turns.push(ev(app, "S.lbTurn")); run(app, "lbNext()"); }
  check("the pointer rotates through all three", JSON.stringify(turns) === JSON.stringify([0,1,2,0,1,2,0,1,2]), turns.join(","));
  check("the round counts up once per lap", ev(app, "S.round") === 4, ev(app, "S.round"));

  /* Name the XI parks S.turn at -1 for a communal board and Career Path never
     touches it. If the next deal read S.turn instead of S.lbTurn, one of those
     would silently reset the rotation to whoever came after -1. */
  console.log("\n--- a communal mode does not eat the rotation ---");
  run(app, `S = freshState(["Ale","Bram","Martijn"], false, "classic", 0);
            S.lb = true; S.lbTurn = 2; S.turn = -1; S.lbLast = "xi"; lbDeal(false);`);
  const communal = ["xi"].includes(ev(app, "S.mode"));
  check("the go still belongs to the third player", communal || ev(app, "S.turn") === 2,
    ev(app, "S.mode") + " / turn " + ev(app, "S.turn"));

  console.log("\n--- every mode gives the ball back ---");
  /* Drive each handover directly: this is the check that would have caught a
     mode whose ending was never wired up. */
  for (const [fn, mode] of [["nextTurn", "classic"], ["wNext", "written"], ["tlNext", "tline"],
                            ["rushNextPlayer", "rush"], ["duelNextPlayer", "duel"],
                            ["cAfter", "career"], ["xiAfter", "xi"]]) {
    run(app, `S = freshState(["Ale","Bram"], false, ${JSON.stringify(mode)}, 0);
              S.lb = true; S.lbTurn = 0; S.lbLast = ${JSON.stringify(mode)}; S.mode = ${JSON.stringify(mode)}; ${fn}();`);
    const rolled = ev(app, "S.mode") !== mode && ev(app, "S.lbTurn") === 1;
    check(`${fn} rolls a new mode and passes on`, rolled, ev(app, "S.mode") + " / turn " + ev(app, "S.lbTurn"));
  }

  console.log("\n--- the record book ---");
  run(app, `S = freshState(["Ale","Bram"], false, "classic", 0);
            S.lb = true; S.mode = "tline"; S.players[0].score = 12; recordMatch();`);
  const rec = JSON.parse(ev(app, "JSON.stringify(history()[history().length-1])"));
  check("files as Let's Ball, not as the mode it ended on", rec.mode === "lb", rec.mode);
  check("and The Table has a chip for it", ev(app, "MODE_LABEL.lb") === "Let's Ball", ev(app, "MODE_LABEL.lb"));

  console.log("\n--- a saved match knows it was Let's Ball ---");
  run(app, `S = freshState(["Ale","Bram"], false, "classic", 0); S.lb = true; S.lbTurn = 1; save();`);
  run(app, "S = null; resumeGame();");
  check("the flag survives a resume", ev(app, "S && S.lb === true"), ev(app, "S && S.lb"));
  check("and so does whose go it is", ev(app, "S && S.lbTurn") === 1, ev(app, "S && S.lbTurn"));
  /* Saves written before this mode existed have no flag at all, and must not
     come back as a Let's Ball match. */
  run(app, `const old = JSON.parse(JSON.stringify(freshState(["Ale","Bram"], false, "stadium", 0)));
            delete old.lb; delete old.lbTurn; delete old.lbLast;
            localStorage.setItem(SAVE_KEY, JSON.stringify(old)); S = null; resumeGame();`);
  check("an older save is not turned into one", ev(app, "S && S.lb === false"), ev(app, "S && S.lb"));

  console.log(fails ? `\n${fails} FAILING CHECK(S)` : "\nAll checks passed.");
  process.exit(fails ? 1 : 0);
})();
