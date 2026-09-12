/* Multiple Choice: the pack, and the ways four options can give themselves away.

     node _tests/mc-test.js

   A wrong answer in this mode is not wrong the way a wrong answer is wrong in
   Written. There, you either knew it or you did not. Here the three wrong ones
   are part of the question, and a badly built set answers itself:

     - an option nobody would pick because it is formatted differently from the
       other three ("Arsenal F.C." beside Fulham, Chelsea, Everton)
     - an option already named in the question text, which is a free elimination
     - an option that contains another option, so "Brazil" beside "Brazil (5)"
       hands it over without a scrap of football knowledge
     - the correct one always sitting in the same place

   Every one of those is a bug you cannot see by reading a single row, which is
   why they are checked over the whole pack rather than eyeballed. The builder
   rejects all of them at build time; this is the net under that, because the
   builder's rules and the pack on disk can drift apart the moment anyone
   hand-edits a row.

   This checks the PACK only. The mode's own phase machine gets its checks when
   the mode lands; there is nothing to drive yet. */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = path.join(__dirname, "..");
const PACK = path.join(REPO, "assets", "mc", "index.json");

let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x)); if (!c) fails++; };

/* Imported, not re-declared. The first version of this file kept its own copy
   of these and promptly failed a row the builder had got right: the pack shows
   "Espanyol de Barcelona" because the builder trims the RCD off every club it
   offers, and a second normaliser that did not know that called a correct row
   broken. A test that disagrees with the thing it is testing is just noise. */
const { strip, norm, clubDisplay, distinctive } = require(path.join(REPO, "_tools", "build-mc.js"));

if (!fs.existsSync(PACK)) {
  console.log("  FAIL  assets/mc/index.json is missing. Run: node _tools/build-mc.js");
  process.exit(1);
}
const pack = JSON.parse(fs.readFileSync(PACK, "utf8"));
const tiers = Object.keys(pack);
console.log("--- the pack ---");
check("at least one tier is built", tiers.length > 0, tiers.length);
console.log("        tiers on disk: " + tiers.map(t => `${t} (${pack[t].length})`).join(", "));

for (const tier of tiers) {
  const rows = pack[tier];
  console.log(`\n--- ${tier} ---`);
  check("the tier is a non-empty array", Array.isArray(rows) && rows.length > 0, typeof rows);

  const bad = (name, test) => {
    const hit = rows.find(r => !test(r));
    check(name, !hit, hit && (hit.q + "  >>  " + JSON.stringify(hit.o)));
  };

  bad("every row has a question and an answer", r => r.q && r.a && String(r.q).length > 8);
  bad("every row offers exactly four options", r => Array.isArray(r.o) && r.o.length === 4);
  bad("every option is a non-empty string", r => r.o.every(o => typeof o === "string" && o.trim()));
  bad("the correct index points at a real option", r => Number.isInteger(r.k) && r.k >= 0 && r.k < 4);
  bad("the marked option is the answer", r => norm(r.o[r.k]) === norm(clubDisplay(strip(r.a))));
  bad("no option is offered twice", r => new Set(r.o.map(norm)).size === 4);

  /* The three giveaways. Each one lets a player who knows nothing about
     football score, which is worse than a question being too hard. */
  bad("no wrong option is named in the question",
    r => r.o.every((o, i) => i === r.k || norm(o).length <= 3 || !norm(r.q).includes(norm(o))));
  /* The half-match version of the same bug. "Borussia Monchengladbach" is not
     a substring of a question that says "Monchengladbach", but it is still a
     free elimination, and seven rows shipped that way before this caught it. */
  bad("no wrong option is half-named in the question",
    r => r.o.every((o, i) => i === r.k || !distinctive(o).some(w => norm(r.q).includes(w))));
  bad("the answer is not named in its own question",
    r => norm(r.o[r.k]).length <= 3 || !norm(r.q).includes(norm(r.o[r.k])));
  bad("no option contains another option",
    r => !r.o.some(a => r.o.some(b => a !== b && norm(a).includes(norm(b)))));

  /* The formatting tell: assets/leagues writes 93 of its clubs with the legal
     suffix on and the bank writes none of them that way, so a set where
     exactly one option carries one is a set that answers itself. */
  const SUFFIX = /\s(?:F\.?C\.?|A\.?F\.?C\.?|C\.?F\.?|S\.?C\.?|A\.?C\.?|S\.?K\.?)$/;
  bad("no option stands out by carrying a club suffix alone",
    r => { const n = r.o.filter(o => SUFFIX.test(o)).length; return n === 0 || n === 4; });
  bad("no row leaked the (undefined) in assets/leagues",
    r => !r.o.some(o => /undefined/i.test(o)) && !/undefined/i.test(r.a));

  /* House rule, same check order-test.js makes. */
  bad("no em dashes", r => !/[–—]/.test(r.q) && !r.o.some(o => /[–—]/.test(o)));

  /* If the shuffle were biased the mode would teach itself: after a night of
     it you would start tapping the same slot. Even-ish is all this needs. */
  const spots = [0, 0, 0, 0];
  rows.forEach(r => spots[r.k]++);
  const lo = Math.min(...spots), hi = Math.max(...spots), want = rows.length / 4;
  check("the correct answer is not parked in one slot",
    lo > want * 0.5 && hi < want * 1.6, spots.join(" / "));

  /* A pack of 200 identical-shaped questions is a boring pack. */
  const clubbish = rows.filter(r => /^(which|what) club|plays its home|nicknamed/i.test(r.q)).length;
  check("more than one shape of question",
    clubbish > rows.length * 0.15 && clubbish < rows.length * 0.85,
    clubbish + " of " + rows.length + " are club questions");

  const dupes = rows.length - new Set(rows.map(r => norm(r.q))).size;
  check("no question appears twice", dupes === 0, dupes + " repeats");
}

/* The builder seeds its shuffle off the question text precisely so that a
   rebuild is a no-op. If that ever stops being true, every rebuild turns into
   a 200-line diff and nobody will be able to see a real change inside it. */
console.log("\n--- the build repeats itself ---");
try {
  const once = execFileSync(process.execPath,
    [path.join(REPO, "_tools", "build-mc.js"), "--tier=" + tiers[0], "--dry", "--show=25"], { encoding: "utf8" });
  const twice = execFileSync(process.execPath,
    [path.join(REPO, "_tools", "build-mc.js"), "--tier=" + tiers[0], "--dry", "--show=25"], { encoding: "utf8" });
  check("two builds of the same tier agree", once === twice, "the shuffle is not seeded");
} catch (e) {
  check("the builder runs", false, e.message.split("\n")[0]);
}

/* ---------- and now actually play it ----------
   The mode has no phase machine of its own: it runs on the classic
   question/steal_q phases and hands its verdict to judge(). That is most of
   its appeal and all of its risk, because judge() works out who it is paying
   from the phase it finds itself in. The first version called it while the
   screen still said steal_q, so judge() decided nobody was stealing and paid
   the player whose turn it was instead of the one who had just stolen it, and
   sent a failed steal back out to be stolen a second time. Nothing threw. The
   scores were just quietly wrong, which is the kind of bug that ends an
   evening in an argument. Every payout path is driven here for that reason.

   Reuses the stub DOM from mp-test.js, with fetch wired to the real files. */
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, "")
  .replace("fetch: () => Promise.reject(new Error(\"offline in test\")),",
    `fetch: (u) => { try { const b = require("fs").readFileSync(require("path").join(${JSON.stringify(REPO)}, u), "utf8");
       return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(b)) }); }
       catch (e) { return Promise.resolve({ ok: false, json: () => Promise.reject(e) }); } },`));

const vm = require("vm");
const ev = (c, e) => vm.runInContext("(" + e + ")", c);
const run = (c, s) => vm.runInContext(s, c);
const stage = c => (c.__els["stage"] ? c.__els["stage"].innerHTML : "");
const tick = (ms = 60) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log("\n--- the mode plays ---");
  const app = makeInstance("mc");
  await tick(500);
  check("the pack reached the app", ev(app, "!!MC"), ev(app, "!!MC"));

  const tier = tiers[0];
  const fresh = () => run(app, `S = freshState(["Martijn","Bram","Roberta"], false, "mc", 0); render(); pickTier("${tier}");`);
  const scores = () => JSON.parse(ev(app, "JSON.stringify(S.players.map(p=>p.score))"));
  const pts = ev(app, `TIERS.${tier}.pts`);

  /* The difficulty board is built by filtering on bankFor(), so a pack holding
     only hard has to put only Hard on the board. Get this wrong and the other
     four lanes are there to be tapped into an empty bank. */
  run(app, 'S = freshState(["Martijn","Bram","Roberta"], false, "mc", 0); render();');
  await tick();
  const lanes = (stage(app).match(/class="lane/g) || []).length;
  check("the board offers exactly the tiers that were built", lanes === tiers.length,
    lanes + " lanes for " + tiers.length + " built tier(s)");

  fresh(); await tick();
  check("four options are on screen", (stage(app).match(/class="mcopt"/g) || []).length === 4,
    (stage(app).match(/class="mcopt"/g) || []).length);

  console.log("\n  right first time");
  fresh(); await tick();
  const k1 = ev(app, "q().k");
  run(app, `mcAnswer(${k1})`); await tick();
  check("the answerer is paid", scores()[0] === pts, scores().join(","));
  check("and the ball is passed on", ev(app, "S.phase") === "pick", ev(app, "S.phase"));

  console.log("\n  wrong, then stolen");
  fresh(); await tick();
  const k2 = ev(app, "q().k");
  run(app, `mcAnswer(${(k2 + 1) % 4})`); await tick();
  check("a wrong tap goes out to be stolen", ev(app, "S.phase") === "steal_offer", ev(app, "S.phase"));
  check("nobody has been paid yet", scores().every(s => s === 0), scores().join(","));
  check("the burned option is remembered", ev(app, "S.mcpick") === (k2 + 1) % 4, ev(app, "S.mcpick"));
  run(app, "claimSteal(1)"); await tick();
  check("the stealer sees it struck off", /mcopt burned/.test(stage(app)), "not struck off");
  check("and cannot tap it", /burned" disabled/.test(stage(app)), "still tappable");
  run(app, `mcAnswer(${k2})`); await tick();
  /* THE ONE THAT WAS WRONG. Pays index 1, the stealer, not index 0. */
  check("the STEALER is paid, not whoever's turn it was", scores()[1] === pts && scores()[0] === 0, scores().join(","));

  console.log("\n  wrong, stolen, still wrong");
  fresh(); await tick();
  const k3 = ev(app, "q().k");
  run(app, `mcAnswer(${(k3 + 1) % 4})`); await tick();
  run(app, "claimSteal(2)"); await tick();
  run(app, `mcAnswer(${(k3 + 2) % 4})`); await tick();
  check("a failed steal kills the question", ev(app, "S.phase") === "deadq", ev(app, "S.phase"));
  check("and pays nobody", scores().every(s => s === 0), scores().join(","));

  console.log("\n  the clock");
  run(app, `S = freshState(["Martijn","Bram","Roberta"], true, "mc", 0); render(); pickTier("${tier}");`);
  await tick();
  const k4 = ev(app, "q().k");
  run(app, `mcAnswer(${(k4 + 1) % 4})`); await tick();
  run(app, "claimSteal(1)"); await tick();
  run(app, "onTimeUp()"); await tick();
  /* There is no answer to mark when a multiple choice steal runs out: the
     player simply never tapped, so it dies rather than landing on a judge
     screen with nothing on it to decide. */
  check("a timed-out steal dies instead of asking for a verdict",
    ev(app, "S.phase") === "deadq", ev(app, "S.phase"));

  console.log("\n  the dead question");
  fresh(); await tick();
  const ans = ev(app, "q().a"), k5 = ev(app, "q().k");
  run(app, `mcAnswer(${(k5 + 1) % 4})`); await tick();
  run(app, "noSteal()"); await tick();
  check("the answer is shown once it is dead", stage(app).includes(String(ans).split(" ")[0]), "answer hidden");

  console.log("\n  a match parked in the retired Written mode");
  run(app, `localStorage.setItem("ball-quiz-v1", JSON.stringify({players:[{name:"A",score:0,off:0}],turn:0,round:1,phase:"w_answer",mode:"written",used:{easy:[],normal:[],hard:[],extreme:[],ball:[]}}));`);
  run(app, "resumeGame();"); await tick();
  check("does not resume into a mode that no longer exists", ev(app, "S") === null, ev(app, "S && S.mode"));

  console.log(fails ? `\n${fails} FAILING CHECK(S)` : "\nAll checks passed.");
  process.exit(fails ? 1 : 0);
})();
