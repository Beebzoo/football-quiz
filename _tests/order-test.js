/* Order Them: the sets, and the engine it borrows from Timeline.

     node _tests/order-test.js

   This mode has almost no code of its own. It runs on Timeline's phase machine
   and Timeline's drag, the way Manager Path runs on Career Path's, so the
   thing that can break is the sharing: a set dealt from one deck and read from
   the other, a used-list written to the wrong mode, a Timeline question
   scored against a capacity. Those are what this checks, along with the one
   rule the bank must never break.

   THE ENGINE SCORES AN ASCENDING ORDER. Every set is stored smallest first and
   every prompt asks for smallest first. A set stored the other way round would
   mark a right answer wrong on all five rows.

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
  const bank = JSON.parse(fs.readFileSync(path.join(REPO, "assets/order/index.json"), "utf8"));

  console.log("--- the sets ---");
  check("enough sets", bank.length >= 80, bank.length);
  check("every set is five items", bank.every(s => s.items.length === 5), "malformed");
  check("every set has a prompt", bank.every(s => s.q && s.q.length > 8), "missing prompt");
  check("every set is stored smallest first",
    bank.every(s => s.items.every((it, i) => !i || it.y > s.items[i - 1].y)),
    (bank.find(s => s.items.some((it, i) => i && it.y <= s.items[i - 1].y)) || {}).q);
  check("every prompt asks for smallest or oldest first",
    bank.every(s => /smallest first|oldest first/.test(s.q)), (bank.find(s => !/smallest first|oldest first/.test(s.q)) || {}).q);
  check("five different numbers in each set",
    bank.every(s => new Set(s.items.map(i => i.y)).size === 5), "a tie");
  check("no item appears twice in a set",
    bank.every(s => new Set(s.items.map(i => i.t)).size === 5), "a repeat");
  check("no em dashes, the house rule",
    bank.every(s => !/[–—]/.test(s.q) && s.items.every(i => !/[–—]/.test(i.t))), "found one");
  const kinds = [...new Set(bank.map(s => s.q))];
  check("more than one kind of question", kinds.length >= 2, kinds.join(" | "));

  const app = makeInstance("ord");
  await tick(400);
  check("the app loaded the sets", ev(app, "ORDB && ORDB.length") === bank.length, ev(app, "ORDB && ORDB.length"));
  check("and Timeline's own deck is still there", ev(app, "TLINE && TLINE.length > 0"), ev(app, "TLINE && TLINE.length"));

  console.log("\n--- the two decks stay apart ---");
  run(app, 'S = freshState(["Ale","Bram"], false, "ord", 0); newTL(); render();');
  await tick(60);
  check("deals from the ordering deck", ev(app, "S.usedO.length") === 1, ev(app, "S.usedO.length"));
  check("and not from Timeline's", ev(app, "S.usedT.length") === 0, ev(app, "S.usedT.length"));
  check("the set index is inside the ordering deck", ev(app, "S.tl.i < ORDB.length"), ev(app, "S.tl.i"));
  check("the screen shows the ordering prompt", stage(app).includes(ev(app, "ORDB[S.tl.i].q")), "prompt missing");
  check("and calls itself Order Them", stage(app).includes("Order Them"), "wrong name");

  run(app, 'S = freshState(["Ale","Bram"], false, "tline", 0); newTL(); render();');
  await tick(60);
  check("Timeline still deals from its own deck", ev(app, "S.usedT.length") === 1, ev(app, "S.usedT.length"));
  check("and leaves the ordering list alone", ev(app, "S.usedO.length") === 0, ev(app, "S.usedO.length"));
  check("and still calls itself Timeline", stage(app).includes("Timeline"), "wrong name");

  console.log("\n--- scoring ---");
  run(app, 'S = freshState(["Ale","Bram"], false, "ord", 0); newTL(); S.tl.order = [0,1,2,3,4]; tlReveal();');
  await tick(30);
  /* Timeline pays one per correct spot, so a perfect five is five, not five
     plus a bonus. Order Them inherits that, and should not drift from it. */
  check("a perfect order pays five", ev(app, "S.players[0].score") === 5, ev(app, "S.players[0].score"));
  check("and says five out of five", ev(app, "S.tl.score") === 5, ev(app, "S.tl.score"));
  run(app, 'S = freshState(["Ale","Bram"], false, "ord", 0); newTL(); S.tl.order = [4,3,2,1,0]; tlReveal();');
  await tick(30);
  check("a reversed order scores only the middle one", ev(app, "S.tl.score") === 1, ev(app, "S.tl.score"));

  console.log("\n--- the numbers show up on the reveal ---");
  run(app, 'S = freshState(["Ale","Bram"], false, "ord", 0);' +
           'S.usedO=[]; const k = ORDB.findIndex(s=>s.items.some(i=>i.y>=10000)); S.tl={i:k,order:[0,1,2,3,4]}; S.mode="ord"; tlReveal();');
  await tick(30);
  const big = ev(app, "ORDB[S.tl.i].items.find(i=>i.y>=10000).y");
  check("a big number is printed with its thousands marked",
    stage(app).includes(Number(big).toLocaleString("en-GB")), Number(big).toLocaleString("en-GB"));
  run(app, 'S.mode="tline"; S.tl={i:0,order:[0,1,2,3,4]}; tlReveal();');
  await tick(30);
  check("a Timeline year is printed plainly", stage(app).includes(String(ev(app, "TLINE[0].items[0].y"))), "year mangled");

  console.log("\n--- the deck and the resume ---");
  run(app, 'S = freshState(["Ale","Bram"], false, "ord", 0);');
  const seen = new Set();
  for (let n = 0; n < 30; n++) { run(app, "newTL()"); seen.add(ev(app, "S.tl.i")); }
  check("thirty deals, thirty different sets", seen.size === 30, seen.size);
  run(app, 'const o = JSON.parse(JSON.stringify(S)); delete o.usedO; localStorage.setItem("ball-quiz-save-v1", JSON.stringify(o)); resumeGame();');
  await tick(30);
  check("a save from before this mode existed still opens", Array.isArray(ev(app, "S.usedO")), ev(app, "S.usedO"));

  console.log(fails ? `\n${fails} FAILING CHECK(S)` : "\nAll checks passed.");
  process.exit(fails ? 1 : 0);
})();
