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

console.log(fails ? `\n${fails} FAILING CHECK(S)` : "\nAll checks passed.");
process.exit(fails ? 1 : 0);
