/* Mystery Man: the facts, the clues they produce, and the typing.

     node _tests/mystery-test.js

   Every clue in this mode is an assertion about a real person, and the app
   makes them with no reader to overrule it. So the bank is checked for the
   shapes that would let a wrong fact through, and the comparison itself is
   checked against players whose careers we can see in the deck.

   The typing matters as much: a surname is enough only when exactly one man
   answers to it. "Gullit" is safe, "Silva" never is, and awarding the first
   Silva in the file would be a lie the player cannot argue with.

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
  const bank = JSON.parse(fs.readFileSync(path.join(REPO, "assets/mystery/index.json"), "utf8"));
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const i = html.indexOf("const CAREERS = ["), j = html.indexOf("\n];", i);
  const CAREERS = eval(html.slice(i + "const CAREERS = ".length, j + 2));

  console.log("--- the facts ---");
  check("one row per career", bank.length === CAREERS.length, bank.length + " vs " + CAREERS.length);
  const targets = bank.filter(r => r.t);
  check("enough men worth hunting", targets.length >= 300, targets.length);
  check("every target has all four facts",
    targets.every(r => r.p && r.nat && r.y && r.c.length), targets.filter(r => !(r.p && r.nat && r.y && r.c.length)).length + " short");
  check("positions are one of the four buckets",
    bank.every(r => !r.p || ["GK", "DF", "MF", "FW"].includes(r.p)),
    [...new Set(bank.map(r => r.p))].filter(p => p && !["GK", "DF", "MF", "FW"].includes(p)).join(","));
  check("no impossible birth years", bank.every(r => !r.y || (r.y > 1900 && r.y < 2015)),
    bank.filter(r => r.y && (r.y <= 1900 || r.y >= 2015)).slice(0, 3).map(r => r.n + " " + r.y).join(", "));
  check("clubs match the career deck",
    bank.every((r, k) => r.c.join(">") === CAREERS[k].c.join(">")), "a route drifted");
  check("no em dashes, the house rule",
    bank.every(r => !/[–—]/.test(r.n) && !/[–—]/.test(r.pl || "")), "found one");

  /* the bug this bank was rebuilt to avoid: the Older or Taller deck resolved
     mononyms to namesakes, so a wrong year and a wrong height travelled
     together. Spot-check the men it got wrong. */
  const known = { "Luis Suárez": 1987, "Pepe": 1983, "Romário": 1966, "Kaká": 1982, "Patrick Vieira": 1976, "Rodri": 1996 };
  const wrong = Object.entries(known).filter(([n, y]) => { const r = bank.find(x => x.n === n); return r && r.y && r.y !== y; });
  check("the namesakes that broke Older or Taller are right here", wrong.length === 0,
    wrong.map(([n, y]) => `${n} should be ${y}, bank says ${(bank.find(x => x.n === n) || {}).y}`).join("; "));

  const app = makeInstance("mys");
  await tick(400);
  check("the app loaded the bank", ev(app, "MYS && MYS.length") === bank.length, ev(app, "MYS && MYS.length"));

  console.log("\n--- the clues a guess produces ---");
  run(app, 'S = freshState(["Ale","Bram","Martijn"], false, "mys", 0); newMystery();');
  await tick(60);
  check("hides a man", ev(app, "S.mys && S.mys.ti >= 0"), JSON.stringify(ev(app, "S.mys")));
  check("who is one of the hunted", ev(app, "MYS[S.mys.ti].t") === 1, ev(app, "MYS[S.mys.ti].t"));

  /* drive a known pair: pick a target, then guess a man who shares a club */
  const tIdx = bank.findIndex(r => r.t && r.c.length >= 2 && r.nat && r.p && r.y);
  const target = bank[tIdx];
  const mate = bank.findIndex((r, k) => k !== tIdx && r.c.some(s => target.c.includes(s)) && r.nat && r.p && r.y);
  run(app, `S.mys = {ti:${tIdx}, g:[]}; S.phase="my_play"; mysGuess(${mate});`);
  await tick(30);
  const cmp = ev(app, "S.mys.g[0]");
  const g = bank[mate];
  check("a shared club is reported", cmp.sh.length > 0 && cmp.sh.every(s => target.c.includes(s) && g.c.includes(s)),
    JSON.stringify(cmp.sh));
  check("the country verdict is right", cmp.nat === (g.nat === target.nat ? 1 : 0), `${cmp.nat} for ${g.nat} vs ${target.nat}`);
  check("the position verdict is right", cmp.pos === (g.p === target.p ? 1 : 0), `${cmp.pos} for ${g.p} vs ${target.p}`);
  const wantAge = g.y === target.y ? 0 : (g.y > target.y ? -1 : 1);
  check("older or younger points the right way", cmp.age === wantAge, `${cmp.age} for guess ${g.y} vs hidden ${target.y}`);

  const far = bank.findIndex((r, k) => k !== tIdx && !r.c.some(s => target.c.includes(s)) && r.nat && r.nat !== target.nat);
  run(app, `mysGuess(${far});`);
  await tick(30);
  const cmp2 = ev(app, "S.mys.g[1]");
  check("an unrelated guess shares nothing", cmp2.sh.length === 0 && cmp2.nat === 0, JSON.stringify(cmp2));

  console.log("\n--- the pot and the turn ---");
  run(app, `S.mys = {ti:${tIdx}, g:[]}; S.phase="my_play"; S.turn=0; render();`);
  const p0 = ev(app, "mysPot()");
  run(app, `mysGuess(${far});`);
  const p1 = ev(app, "mysPot()");
  check("the pot drops with every guess", p1 < p0, `${p0} then ${p1}`);
  check("and the go passes", ev(app, "S.turn") === 1, ev(app, "S.turn"));
  run(app, "S.mys.g = new Array(20).fill(0).map((_,k)=>({i:900+k,nat:0,pos:0,age:1,sh:[]}));");
  check("the pot never falls below two", ev(app, "mysPot()") === 2, ev(app, "mysPot()"));

  console.log("\n--- naming him ---");
  run(app, `S.mys = {ti:${tIdx}, g:[]}; S.phase="my_play"; S.turn=1; S.players.forEach(p=>p.score=0); mysGuess(${tIdx});`);
  await tick(30);
  check("the right name pays the pot", ev(app, "S.players[1].score") === 14, ev(app, "S.players[1].score"));
  check("and the hunt is over", ev(app, "S.phase") === "my_done", ev(app, "S.phase"));
  check("the reveal names him", stage(app).includes(target.n), "name missing");
  check("and shows his clubs", target.c.every(s => stage(app).includes(s + ".png")), "a crest missing");

  console.log("\n--- the answer is not given away early ---");
  run(app, `S.mys = {ti:${tIdx}, g:[]}; S.phase="my_play"; S.turn=0; render();`);
  await tick(30);
  check("the hidden man is not named while playing", !stage(app).includes(target.n), target.n);

  console.log("\n--- typing ---");
  run(app, `S.mys = {ti:${tIdx}, g:[]}; S.phase="my_play"; S.turn=0;`);
  const full = bank[far].n;
  run(app, `mysType({value:${JSON.stringify(full)}});`);
  check("a full name is found", ev(app, "S.mys.g.length") === 1, ev(app, "S.mys.g.length"));
  run(app, `S.mys.g=[]; mysType({value:"zz"});`);
  check("two letters do nothing", ev(app, "S.mys.g.length") === 0, ev(app, "S.mys.g.length"));
  run(app, `S.mys.g=[]; mysType({value:"qqqqzzzz"});`);
  check("a name nobody has does nothing", ev(app, "S.mys.g.length") === 0, ev(app, "S.mys.g.length"));
  /* a surname two men share must not resolve to either of them */
  const surnames = {};
  bank.forEach(r => { const l = r.n.split(" ").slice(1).join(" ").toLowerCase(); if (l.length >= 4) surnames[l] = (surnames[l] || 0) + 1; });
  const shared = Object.entries(surnames).find(([, c]) => c > 1);
  if (shared) {
    run(app, `S.mys.g=[]; mysType({value:${JSON.stringify(shared[0])}});`);
    check(`a surname ${shared[1]} men share is refused ("${shared[0]}")`, ev(app, "S.mys.g.length") === 0, ev(app, "S.mys.g.length"));
  }
  const lone = Object.entries(surnames).find(([, c]) => c === 1);
  if (lone) {
    run(app, `S.mys.g=[]; mysType({value:${JSON.stringify(lone[0])}});`);
    check(`a surname only one man has is enough ("${lone[0]}")`, ev(app, "S.mys.g.length") === 1, ev(app, "S.mys.g.length"));
  }
  run(app, `S.mys.g=[]; mysGuess(${far}); mysGuess(${far});`);
  check("the same guess twice is refused", ev(app, "S.mys.g.length") === 1, ev(app, "S.mys.g.length"));

  console.log("\n--- running out ---");
  run(app, `S.mys = {ti:${tIdx}, g:[]}; S.phase="my_play";
    let n=0; for(let k=0;k<MYS.length && n<8;k++){ if(k!==${tIdx} && !S.mys.g.some(x=>x.i===k)){ mysGuess(k); n++; } }`);
  await tick(30);
  check("eight guesses ends it", ev(app, "S.phase") === "my_done", ev(app, "S.phase"));
  check("and he is revealed", stage(app).includes(target.n), "hidden at the end");

  console.log("\n--- the deck and the resume ---");
  run(app, 'S = freshState(["Ale","Bram"], false, "mys", 0);');
  const seen = new Set();
  for (let n = 0; n < 30; n++) { run(app, "newMystery()"); seen.add(ev(app, "S.mys.ti")); }
  check("thirty hunts, thirty different men", seen.size === 30, seen.size);
  run(app, 'const o = JSON.parse(JSON.stringify(S)); delete o.usedY; localStorage.setItem("ball-quiz-save-v1", JSON.stringify(o)); resumeGame();');
  await tick(30);
  check("a save from before this mode existed still opens", Array.isArray(ev(app, "S.usedY")), ev(app, "S.usedY"));


  console.log("\n--- the whistle ---");
  /* No limit is one of the setup options, so without a whistle on the mode's
     own screen the match can never reach results and the night is never filed
     in the record book. The advance has to look at the target too, or a table
     that keeps giving up plays on past it forever. */
  run(app, 'S = freshState(["Ale","Bram","Martijn"], false, "mys", 0); newMystery(); render();');
  await tick(60);
  check("Mystery Man opens on my_play with a full-time whistle",
    ev(app, "S.phase") === "my_play" && stage(app).includes("askEnd()"), ev(app, "S.phase"));
  run(app, 'S = freshState(["Ale","Bram","Martijn"], false, "mys", 10); S.players[0].score = 30; newMystery(); mysGiveUp(); mysAfter();');
  await tick(60);
  check("and a passed target ends the match on the next one", ev(app, "S.phase") === "results", ev(app, "S.phase"));
  check("which files the night in the record book", ev(app, "history().length") > 0, "nothing filed");
  console.log(fails ? `\n${fails} FAILING CHECK(S)` : "\nAll checks passed.");
  process.exit(fails ? 1 : 0);
})();
