/* League Rush: the bank, the typing, and what thirty seconds pays.

     node _tests/rush-test.js

   The mode marks its own answers, so the thing that matters is what counts as
   having typed a club. "Atleti", "psv" and "Brighton and Hove Albion" all have
   to land, the same club must not pay twice, and a league has to be the
   league: a list that is missing Werder Bremen is worse than no mode at all,
   because the player knows they are right and the app says otherwise.

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

/* league sizes are stable facts, so a wrong one is a broken harvest */
const SIZES = {
  "Eredivisie": 18, "Eerste Divisie": 20, "Premier League": 20, "Championship": 24,
  "La Liga": 20, "Segunda División": 22, "Serie A": 20, "Bundesliga": 18, "Ligue 1": 18,
  "Primeira Liga": 18, "Süper Lig": 18, "Major League Soccer": 30,
};

(async () => {
  const bank = JSON.parse(fs.readFileSync(path.join(REPO, "assets/leagues/index.json"), "utf8"));
  const logos = new Set(fs.readdirSync(path.join(REPO, "assets/logos")));
  const flags = new Set(fs.readdirSync(path.join(REPO, "assets/natflags")));

  console.log("--- the bank ---");
  check("a decent spread of leagues", bank.length >= 10, bank.length);
  check("every league names a season", bank.every(l => /\d{4}/.test(l.season)),
    bank.filter(l => !/\d{4}/.test(l.season)).map(l => l.n).join(", "));
  const wrongSize = bank.filter(l => SIZES[l.n] && l.clubs.length !== SIZES[l.n]);
  check("every league is the size it should be", wrongSize.length === 0,
    wrongSize.map(l => `${l.n} ${l.clubs.length}, expected ${SIZES[l.n]}`).join("; "));
  check("every flag is on disk", bank.every(l => flags.has(l.flag + ".png")),
    bank.filter(l => !flags.has(l.flag + ".png")).map(l => l.n).join(", "));
  const clubs = bank.flatMap(l => l.clubs);
  check("every crest the bank points at exists", clubs.every(c => !c.s || logos.has(c.s + ".png")),
    clubs.filter(c => c.s && !logos.has(c.s + ".png")).slice(0, 3).map(c => c.n).join(", "));
  check("most clubs have a crest", clubs.filter(c => c.s).length / clubs.length > 0.8,
    Math.round(clubs.filter(c => c.s).length / clubs.length * 100) + "%");
  check("every club has something you could type", clubs.every(c => c.a && c.a.length),
    clubs.filter(c => !c.a || !c.a.length).map(c => c.n).join(", "));
  check("no accepted answer is a bare initialism", clubs.every(c => c.a.every(a => a.length >= 3)),
    clubs.flatMap(c => c.a.filter(a => a.length < 3)).slice(0, 5).join(", "));

  /* Two clubs in one league answering to the same typed string would make one
     of them unreachable: the first match wins and the other can never be
     named. Across leagues it is fine, they are never on screen together. */
  const collisions = [];
  for (const l of bank) {
    const seen = new Map();
    for (const c of l.clubs) for (const a of c.a) {
      if (seen.has(a) && seen.get(a) !== c.n) collisions.push(`${l.n}: "${a}" = ${seen.get(a)} and ${c.n}`);
      seen.set(a, c.n);
    }
  }
  check("no two clubs in a league answer to the same thing", collisions.length === 0,
    collisions.slice(0, 4).join(" | "));

  console.log("\n--- the clubs are the right clubs ---");
  const ere = bank.find(l => l.n === "Eredivisie");
  for (const must of ["Ajax", "PSV", "Feyenoord", "Go Ahead Eagles", "Fortuna Sittard"])
    check(`Eredivisie has ${must}`, ere.clubs.some(c => c.a.includes(must.toLowerCase())),
      ere.clubs.map(c => c.n).join(", ").slice(0, 90));
  const bun = bank.find(l => l.n === "Bundesliga");
  check("Bundesliga has Werder Bremen", bun.clubs.some(c => /werder/i.test(c.n)), bun.clubs.length + " clubs");

  const app = makeInstance("rush");
  await tick(400);
  check("the app loaded the bank", ev(app, "LEAGUES && LEAGUES.length") === bank.length, ev(app, "LEAGUES && LEAGUES.length"));

  console.log("\n--- typing ---");
  const li = bank.findIndex(l => l.n === "Eredivisie");
  run(app, `S = freshState(["Ale","Bram"], false, "rush", 0); newRush(); rushPick(${li});`);
  await tick(60);
  check("the clock is on screen", stage(app).includes('id="clock"'), "no clock");
  check("nothing named yet", ev(app, "S.rush.got.length") === 0, ev(app, "S.rush.got.length"));

  const type = t => { run(app, `rushType({value:${JSON.stringify(t)}})`); };
  type("ajax");
  check("typing a club counts it", ev(app, "S.rush.got.length") === 1, ev(app, "S.rush.got.length"));
  type("ajax");
  check("the same club does not pay twice", ev(app, "S.rush.got.length") === 1, ev(app, "S.rush.got.length"));
  type("PSV");
  check("case does not matter", ev(app, "S.rush.got.length") === 2, ev(app, "S.rush.got.length"));
  type("go-ahead eagles!");
  check("punctuation does not matter", ev(app, "S.rush.got.length") === 3, ev(app, "S.rush.got.length"));
  type("fc utrecht");
  check("the full name works too", ev(app, "S.rush.got.length") === 4, ev(app, "S.rush.got.length"));
  type("real madrid");
  check("a club from another league counts for nothing", ev(app, "S.rush.got.length") === 4, ev(app, "S.rush.got.length"));
  type("aj");
  check("two letters is not an answer", ev(app, "S.rush.got.length") === 4, ev(app, "S.rush.got.length"));

  console.log("\n--- the shorthands people actually type ---");
  const named = () => JSON.parse(ev(app, "JSON.stringify(S.rush.got.map(i=>LEAGUES[S.rush.li].clubs[i].n))"));
  const play = leagueName => {
    const idx = bank.findIndex(l => l.n === leagueName);
    run(app, `S = freshState(["Ale","Bram"], false, "rush", 0); newRush(); rushPick(${idx});`);
  };

  play("Serie A");
  type("juve");
  check("juve is Juventus", named().some(n => /Juventus/.test(n)), named().join(", "));
  type("inter");
  check("inter is Inter", named().some(n => /Inter/.test(n)), named().join(", "));
  /* "milan" is inside both Inter Milan and AC Milan, so it must wait rather
     than award whichever the loop reached first */
  /* both Milans standing: ambiguous, so it must wait */
  play("Serie A");
  type("milan");
  check("milan waits while both Milans are still standing", ev(app, "S.rush.got.length") === 0, named().join(", "));
  type("inter"); type("milan");
  check("and lands on AC Milan once Inter is taken", named().length === 2 && named().some(n => /^AC Milan/.test(n)), named().join(", "));

  play("Bundesliga");
  type("gladbach");
  check("gladbach is Monchengladbach", named().some(n => /gladbach/i.test(n)), named().join(", "));
  type("bayern");
  check("bayern is Bayern", named().some(n => /Bayern/.test(n)), named().join(", "));

  play("Premier League");
  type("united");
  check("united belongs to too many of them to award", ev(app, "S.rush.got.length") === 0, named().join(", "));
  type("man utd");
  check("man utd is Manchester United", named().some(n => /Manchester United/.test(n)), named().join(", "));
  type("spurs");
  check("spurs is Tottenham", named().some(n => /Tottenham/.test(n)), named().join(", "));
  type("nowrap");
  check("no template junk got in as a club", ev(app, "S.rush.got.length") === 2, named().join(", "));

  console.log("\n--- what it pays ---");
  play("Eredivisie");
  ["ajax", "PSV", "go-ahead eagles!", "fc utrecht"].forEach(type);
  run(app, "rushTimeUp();");
  await tick(60);
  check("a point per club", ev(app, "S.players[0].score") === 4, ev(app, "S.players[0].score"));
  check("the missed clubs are shown", (stage(app).match(/rclub missed/g) || []).length === ere.clubs.length - 4,
    (stage(app).match(/rclub missed/g) || []).length);
  check("and the named ones are marked", (stage(app).match(/rclub got/g) || []).length === 4,
    (stage(app).match(/rclub got/g) || []).length);
  run(app, "rushNextPlayer();"); await tick(60);
  check("the phone passes on", ev(app, "S.turn") === 1, ev(app, "S.turn"));
  check("and the next player picks their own league", ev(app, 'S.phase') === "g_pick", ev(app, "S.phase"));

  console.log("\n--- the whole league pays ten more ---");
  run(app, `S = freshState(["Ale","Bram"], false, "rush", 0); newRush(); rushPick(${li});`);
  await tick(60);
  run(app, "S.rush.got = LEAGUES[S.rush.li].clubs.map((_,i)=>i); rushTimeUp();");
  await tick(60);
  check("18 clubs plus the sweep bonus", ev(app, "S.players[0].score") === ere.clubs.length + 10,
    ev(app, "S.players[0].score"));

  console.log("\n--- career reverse is gone ---");
  check("not in the mode drawer", ev(app, "MODE_META.crev") === undefined, ev(app, "MODE_META.crev"));
  check("not in the record book", ev(app, "MODE_LABEL.crev") === undefined, ev(app, "MODE_LABEL.crev"));
  check("league rush took its place", ev(app, "MODE_META.rush && MODE_META.rush[1]") === "League Rush",
    ev(app, "MODE_META.rush && MODE_META.rush[1]"));

  console.log(fails ? `\n${fails} FAILED` : "\nall good");
  process.exit(fails ? 1 : 0);
})();
