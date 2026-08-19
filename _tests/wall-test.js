/* The Wall: the boards, the judging and the three lives.

     node _tests/wall-test.js

   This mode judges itself with no reader to overrule it, so the bank carries
   the whole burden: if any of the sixteen names answers to two groups on its
   own board, a player will find a perfectly good four and the app will call it
   wrong. Every board is therefore checked here against the same career data
   the game was generated from, rather than trusted because the generator said
   so.

   The rest is what would spoil a night: a wrong four that costs no life, a
   right four that pays nobody, a last group that has to be "found" when it is
   the only thing left, and a board whose tiles reshuffle under a thumb.

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
  const walls = JSON.parse(fs.readFileSync(path.join(REPO, "assets/wall/index.json"), "utf8"));
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const i = html.indexOf("const CAREERS = ["), j = html.indexOf("\n];", i);
  const CAREERS = eval(html.slice(i + "const CAREERS = ".length, j + 2));
  const clubsOf = {};
  for (const c of CAREERS) clubsOf[c.n] = new Set(c.c);

  console.log("--- the boards ---");
  check("enough boards for a season", walls.length >= 100, walls.length);
  check("every board is four groups of four",
    walls.every(w => w.g.length === 4 && w.g.every(g => Array.isArray(g.p) && g.p.length === 4)), "malformed");
  check("every board has sixteen different names",
    walls.every(w => new Set(w.g.flatMap(g => g.p)).size === 16), "a name appears twice");
  check("every group is labelled and typed",
    walls.every(w => w.g.every(g => g.l && (g.k === "club" || g.k === "nat"))), "missing label or kind");
  check("no junk in a label", walls.every(w => w.g.every(g => !/undefined|null|[{}|]/i.test(g.l))),
    (walls.flatMap(w => w.g).find(g => /undefined|null|[{}|]/i.test(g.l)) || {}).l);
  check("every board mixes clubs with nationalities",
    walls.every(w => w.g.some(g => g.k === "nat") && w.g.some(g => g.k === "club")), "a board of one kind");
  check("no em dashes, the house rule",
    walls.every(w => w.g.every(g => !/[–—]/.test(g.l) && g.p.every(p => !/[–—]/.test(p)))), "found one");

  /* the claim the whole mode rests on */
  const clubGroupLies = [];
  for (const w of walls) for (const g of w.g) {
    if (g.k !== "club") continue;
    for (const p of g.p) if (!(clubsOf[p] || new Set()).size) clubGroupLies.push(p + " is not in the career deck");
  }
  check("every name on a club group is a player we have a career for", clubGroupLies.length === 0, clubGroupLies.slice(0, 3).join("; "));

  /* a name must not answer to a SECOND club group on its own board. This is
     the check that catches the failure the generator exists to prevent. */
  const doubles = [];
  for (const w of walls) {
    const clubKeys = w.g.map(g => g.k === "club" ? g.l : null);
    for (let gi = 0; gi < 4; gi++) for (const p of w.g[gi].p) {
      for (let oi = 0; oi < 4; oi++) {
        if (oi === gi || w.g[oi].k !== "club") continue;
        /* the label is the club's display name; match it back through the deck
           by finding any career that has both this player and that group's
           four, which is the only handle the shipped bank gives us */
        const others = w.g[oi].p;
        const shared = [...(clubsOf[p] || [])].filter(s => others.every(o => (clubsOf[o] || new Set()).has(s)));
        if (shared.length) doubles.push(`${p} also belongs with ${w.g[oi].l}`);
      }
    }
  }
  check("nobody quietly belongs to two groups on their own board", doubles.length === 0, doubles.slice(0, 3).join("; "));

  const app = makeInstance("wall");
  await tick(400);
  check("the app loaded the boards", ev(app, "WALL && WALL.length") === walls.length, ev(app, "WALL && WALL.length"));

  console.log("\n--- a board ---");
  run(app, 'S = freshState(["Ale","Bram","Martijn"], false, "wall", 0); newWall();');
  await tick(60);
  check("deals a board", ev(app, "S.wall && S.wall.tiles.length") === 16, ev(app, "S.wall && S.wall.tiles.length"));
  check("three lives", ev(app, "S.wall.lives") === 3, ev(app, "S.wall.lives"));
  check("nobody is on the spot", ev(app, "S.turn") === -1, ev(app, "S.turn"));
  check("the tiles are shuffled, not laid out group by group",
    ev(app, "S.wall.tiles.map(t=>t.g).join('')") !== "0000111122223333", ev(app, "S.wall.tiles.map(t=>t.g).join('')"));
  const layout = ev(app, "S.wall.tiles.map(t=>t.n).join('|')");
  run(app, "render(); render();");
  check("and they stay put across renders", ev(app, "S.wall.tiles.map(t=>t.n).join('|')") === layout, "the board moved");

  console.log("\n--- selecting ---");
  run(app, "wlTap(0); wlTap(1); wlTap(2);");
  check("taps select", ev(app, "S.wall.sel.length") === 3, ev(app, "S.wall.sel.length"));
  run(app, "wlTap(1)");
  check("tapping again deselects", ev(app, "S.wall.sel.length") === 2, ev(app, "S.wall.sel.length"));
  run(app, "wlTap(1); wlTap(3); wlTap(4);");
  check("never more than four at once", ev(app, "S.wall.sel.length") === 4, ev(app, "S.wall.sel.length"));

  console.log("\n--- a wrong four costs a life ---");
  run(app, `S.wall.sel = (()=>{ const byG={}; S.wall.tiles.forEach((t,i)=>(byG[t.g]=byG[t.g]||[]).push(i));
    return [byG[0][0], byG[1][0], byG[2][0], byG[3][0]]; })(); wlLock();`);
  await tick(30);
  check("a mixed four is rejected", ev(app, "S.wall.lives") === 2, ev(app, "S.wall.lives"));
  check("and the selection clears", ev(app, "S.wall.sel.length") === 0, ev(app, "S.wall.sel.length"));
  check("and no group is given away", ev(app, "S.wall.done.length") === 0, ev(app, "S.wall.done.length"));

  console.log("\n--- a right four pays whoever called it ---");
  run(app, `S.wall.sel = S.wall.tiles.map((t,i)=>t.g===0?i:-1).filter(i=>i>=0); wlLock();`);
  await tick(30);
  check("a true four is accepted", ev(app, "S.wall.done").includes(0), JSON.stringify(ev(app, "S.wall.done")));
  check("and asks who spotted it", ev(app, "S.phase") === "wl_award", ev(app, "S.phase"));
  check("the group is named on the award screen", stage(app).includes(ev(app, "WALL[S.wall.wi].g[0].l")), "label missing");
  run(app, "wlAward(0)");
  await tick(30);
  check("the caller gets three", ev(app, "S.players[0].score") === 3, ev(app, "S.players[0].score"));
  check("and play resumes", ev(app, "S.phase") === "wl_play", ev(app, "S.phase"));
  run(app, "wlAward(-1)");
  check("nobody scoring is allowed too", ev(app, "S.players[1].score") === 0, ev(app, "S.players[1].score"));

  console.log("\n--- the last four are not a puzzle ---");
  run(app, `S.wall.sel = S.wall.tiles.map((t,i)=>t.g===1?i:-1).filter(i=>i>=0); wlLock(); wlAward(-1);
            S.wall.sel = S.wall.tiles.map((t,i)=>t.g===2?i:-1).filter(i=>i>=0); wlLock();`);
  await tick(30);
  check("finding the third hands over the fourth", ev(app, "S.wall.done.length") === 4, ev(app, "S.wall.done.length"));
  run(app, "wlAward(2)");
  await tick(30);
  check("clearing the wall pays the bonus", ev(app, "S.players[2].score") === 3 + 5, ev(app, "S.players[2].score"));
  check("and the board is over", ev(app, "S.phase") === "wl_done", ev(app, "S.phase"));
  check("the finished screen shows every group", ev(app, "WALL[S.wall.wi].g").every(g => stage(app).includes(g.l)), "a group is missing");

  console.log("\n--- three strikes ---");
  run(app, 'S = freshState(["Ale","Bram"], false, "wall", 0); newWall();');
  await tick(30);
  run(app, `for(let n=0;n<3;n++){ const byG={}; S.wall.tiles.forEach((t,i)=>(byG[t.g]=byG[t.g]||[]).push(i));
    S.wall.sel=[byG[0][0],byG[1][0],byG[2][0],byG[3][0]]; wlLock(); }`);
  await tick(30);
  check("three wrong fours end it", ev(app, "S.phase") === "wl_done", ev(app, "S.phase"));
  check("and the answers come out", ev(app, "WALL[S.wall.wi].g").every(g => stage(app).includes(g.l)), "answers withheld");

  console.log("\n--- the deck and the resume ---");
  run(app, 'S = freshState(["Ale","Bram"], false, "wall", 0);');
  const seen = new Set();
  for (let n = 0; n < 30; n++) { run(app, "newWall()"); seen.add(ev(app, "S.wall.wi")); }
  check("thirty deals, thirty different boards", seen.size === 30, seen.size);
  run(app, 'S.phase="wl_award"; localStorage.setItem("ball-quiz-save-v1", JSON.stringify(S)); resumeGame();');
  await tick(30);
  check("a save caught mid-shout comes back playable", ev(app, "S.phase") === "wl_play", ev(app, "S.phase"));
  run(app, 'const o = JSON.parse(localStorage.getItem("ball-quiz-save-v1")); delete o.usedW; localStorage.setItem("ball-quiz-save-v1", JSON.stringify(o)); resumeGame();');
  await tick(30);
  check("a save from before the wall existed still opens", Array.isArray(ev(app, "S.usedW")), ev(app, "S.usedW"));


  console.log("\n--- the whistle ---");
  /* No limit is one of the setup options, so without a whistle on the mode's
     own screen the match can never reach results and the night is never filed
     in the record book. The advance has to look at the target too, or a table
     that keeps giving up plays on past it forever. */
  run(app, 'S = freshState(["Ale","Bram","Martijn"], false, "wall", 0); newWall(); render();');
  await tick(60);
  check("The Wall opens on wl_play with a full-time whistle",
    ev(app, "S.phase") === "wl_play" && stage(app).includes("askEnd()"), ev(app, "S.phase"));
  run(app, 'S = freshState(["Ale","Bram","Martijn"], false, "wall", 10); S.players[0].score = 30; newWall(); wlAfter();');
  await tick(60);
  check("and a passed target ends the match on the next one", ev(app, "S.phase") === "results", ev(app, "S.phase"));
  check("which files the night in the record book", ev(app, "history().length") > 0, "nothing filed");
  console.log(fails ? `\n${fails} FAILING CHECK(S)` : "\nAll checks passed.");
  process.exit(fails ? 1 : 0);
})();
