/* Prove It: the auction, and the scores that come out of it.

     node _tests/bidding-test.js

   The app deliberately does not mark the names here, so the only things it can
   get wrong are the ones that decide money: who holds the bid, who may call
   it, what delivering pays, and what falling short costs. A bidder who can
   call his own bluff, or a claim that pays out before it is met, would be
   noticed at the table immediately and argued about for the rest of the night.

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
  const bank = JSON.parse(fs.readFileSync(path.join(REPO, "assets/bidding/index.json"), "utf8"));
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const i = html.indexOf("const CAREERS = ["), j = html.indexOf("\n];", i);
  const CAREERS = eval(html.slice(i + "const CAREERS = ".length, j + 2));
  const clubsOf = {}; for (const c of CAREERS) clubsOf[c.n] = new Set(c.c);

  console.log("--- the lots ---");
  check("enough lots", bank.length >= 100, bank.length);
  check("every lot has a club, a country and its men",
    bank.every(b => b.s && b.c && b.nat && Array.isArray(b.p) && b.p.length >= 4), "malformed");
  check("the count matches the list", bank.every(b => b.k === b.p.length), "count drifted");
  const logos = fs.readdirSync(path.join(REPO, "assets/logos"));
  check("every crest is on disk", bank.every(b => logos.includes(b.s + ".png")),
    (bank.find(b => !logos.includes(b.s + ".png")) || {}).s);
  check("no junk in a club name", bank.every(b => !/undefined|null|[{}|]/i.test(b.c)),
    (bank.find(b => /undefined|null|[{}|]/i.test(b.c)) || {}).c);
  check("no em dashes, the house rule",
    bank.every(b => !/[–—]/.test(b.c) && !/[–—]/.test(b.nat) && b.p.every(p => !/[–—]/.test(p))), "found one");

  /* the claim the lot makes: these men really did play for that club */
  const lies = [];
  for (const b of bank) for (const p of b.p) if (!(clubsOf[p] || new Set()).has(b.s)) lies.push(`${p} did not play for ${b.c}`);
  check("every man listed really did turn out there", lies.length === 0, lies.slice(0, 3).join("; "));
  check("nobody is listed twice in a lot", bank.every(b => new Set(b.p).size === b.p.length), "a repeat");

  const app = makeInstance("bid");
  await tick(400);
  check("the app loaded the lots", ev(app, "BIDS && BIDS.length") === bank.length, ev(app, "BIDS && BIDS.length"));

  console.log("\n--- the auction ---");
  run(app, 'S = freshState(["Ale","Bram","Martijn"], false, "bid", 0); newBid();');
  await tick(60);
  check("opens with no bid", ev(app, "S.bid.holder") === null, ev(app, "S.bid.holder"));
  check("and an opening number", ev(app, "S.bid.claim") === 2, ev(app, "S.bid.claim"));
  check("nobody can be made to prove nothing", (() => { run(app, "bidCall()"); return ev(app, "S.phase") === "b_bid"; })(), ev(app, "S.phase"));

  run(app, "bidRaise()");
  check("a bid raises the number", ev(app, "S.bid.claim") === 3, ev(app, "S.bid.claim"));
  check("and names a holder", ev(app, "S.bid.holder") === 0, ev(app, "S.bid.holder"));
  check("and passes the go", ev(app, "S.turn") === 1, ev(app, "S.turn"));
  run(app, "bidRaise()");
  check("the next bid takes it over", ev(app, "S.bid.holder") === 1 && ev(app, "S.bid.claim") === 4,
    ev(app, "S.bid.holder") + " at " + ev(app, "S.bid.claim"));

  run(app, "S.turn = S.bid.holder; bidCall();");
  check("a bidder cannot call his own bluff", ev(app, "S.phase") === "b_bid", ev(app, "S.phase"));
  run(app, "S.turn = 2; bidCall();");
  check("someone else can", ev(app, "S.phase") === "b_call", ev(app, "S.phase"));
  check("and the caller is remembered", ev(app, "S.bid.caller") === 2, ev(app, "S.bid.caller"));

  console.log("\n--- delivering ---");
  const claim = ev(app, "S.bid.claim");
  run(app, "S.players.forEach(p=>p.score=0);");
  for (let n = 0; n < claim - 1; n++) run(app, "bidGot()");
  check("short of the claim it is still live", ev(app, "S.phase") === "b_call", ev(app, "S.phase"));
  check("and nothing has been paid", ev(app, "S.players[1].score") === 0, ev(app, "S.players[1].score"));
  run(app, "bidGot()");
  await tick(30);
  check("the last one settles it", ev(app, "S.phase") === "b_done", ev(app, "S.phase"));
  check("the bidder is paid his claim", ev(app, "S.players[1].score") === claim, ev(app, "S.players[1].score"));
  check("and the caller is stung", ev(app, "S.players[2].score") === -2, ev(app, "S.players[2].score"));
  check("the reveal lists what the app knows", stage(app).includes(ev(app, "BIDS[S.bid.i].p[0]")), "list missing");

  console.log("\n--- falling short ---");
  run(app, 'S = freshState(["Ale","Bram"], false, "bid", 0); newBid(); bidRaise(); S.turn=1; bidCall(); S.players.forEach(p=>p.score=0); bidGot(); bidFail();');
  await tick(30);
  const c2 = ev(app, "S.bid.claim");
  check("falling short costs the claim", ev(app, "S.players[0].score") === -c2, ev(app, "S.players[0].score") + " vs " + (-c2));
  check("and pays the caller", ev(app, "S.players[1].score") === 2, ev(app, "S.players[1].score"));
  check("part-delivered still counts as short", ev(app, "S.bid.win") === "caller", ev(app, "S.bid.win"));

  console.log("\n--- a lot nobody wants ---");
  run(app, 'S = freshState(["Ale","Bram"], false, "bid", 0); newBid(); const was = S.bid.i; bidPass();');
  await tick(30);
  check("passing brings up another lot", ev(app, "S.phase") === "b_bid", ev(app, "S.phase"));
  check("and costs nobody anything", ev(app, "S.players[0].score") === 0 && ev(app, "S.players[1].score") === 0,
    ev(app, "S.players.map(p=>p.score).join(',')"));

  /* A lot with a bid on it is not nobody's lot any more. Withdrawing it once
     someone has claimed a number let the bidder walk away from his own claim,
     and on two players the phone came back round to him to do it himself. */
  run(app, 'S = freshState(["Ale","Bram","Martijn"], false, "bid", 0); newBid(); render();');
  await tick(30);
  check("with no bid on the table, the pass button is offered", stage(app).includes("bidPass()"), "missing");
  run(app, "bidRaise(); render();");
  await tick(30);
  const lot = ev(app, "S.bid.i");
  check("once someone has bid, the pass button is gone", !stage(app).includes("bidPass()"), "still offered");
  run(app, "bidPass();");
  await tick(30);
  check("and bidPass() itself refuses a live bid", ev(app, "S.bid.i") === lot && ev(app, "S.phase") === "b_bid",
    ev(app, "S.phase") + " on lot " + ev(app, "S.bid.i"));
  check("so nobody's score moved", ev(app, "S.players.every(p=>p.score===0)"), ev(app, "S.players.map(p=>p.score).join(',')"));

  console.log("\n--- the whistle ---");
  check("Prove It can be ended by hand", stage(app).includes("askEnd()"), "no full-time whistle on b_bid");
  run(app, 'S = freshState(["Ale","Bram"], false, "bid", 10); S.players[0].score = 30; newBid(); bidAfter();');
  await tick(30);
  check("and a passed target ends the match on the next lot", ev(app, "S.phase") === "results", ev(app, "S.phase"));

  console.log("\n--- the deck and the resume ---");
  run(app, 'S = freshState(["Ale","Bram"], false, "bid", 0);');
  const seen = new Set();
  for (let n = 0; n < 30; n++) { run(app, "newBid()"); seen.add(ev(app, "S.bid.i")); }
  check("thirty lots, thirty different ones", seen.size === 30, seen.size);
  run(app, 'S.phase="b_call"; localStorage.setItem("ball-quiz-save-v1", JSON.stringify(S)); resumeGame();');
  await tick(30);
  check("a half-delivered list is not resumed", ev(app, "S.phase") === "b_bid", ev(app, "S.phase"));
  run(app, 'const o = JSON.parse(localStorage.getItem("ball-quiz-save-v1")); delete o.usedB; localStorage.setItem("ball-quiz-save-v1", JSON.stringify(o)); resumeGame();');
  await tick(30);
  check("a save from before this mode existed still opens", Array.isArray(ev(app, "S.usedB")), ev(app, "S.usedB"));

  console.log(fails ? `\n${fails} FAILING CHECK(S)` : "\nAll checks passed.");
  process.exit(fails ? 1 : 0);
})();
