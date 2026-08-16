/* Asset integrity test.

     node _tests/assets-test.js

   Every image set that ships with an index and an attribution file has to
   agree with what is actually on disk. A missing file shows as a broken image
   mid-round; an unattributed one is a licence problem, since all of this comes
   from Wikimedia Commons under CC terms that require credit. */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- " + x)); if (!c) fails++; };

/* The three CSVs grew separately and have different shapes, so the licence and
   author columns have to be named per set rather than assumed. */
const SETS = [
  { dir: "assets/faces", index: "index.json", files: j => Object.values(j),
    attrib: "ATTRIBUTION.csv", fileCol: 0, licCol: 2, authCol: 3 },
  { dir: "assets/stadiums", index: null,
    attrib: "ATTRIBUTION.csv", fileCol: 0, licCol: 4, authCol: 5 },
  { dir: "assets/kits", index: "index.json", files: j => Object.values(j).flat().map(k => k.s + ".png"),
    attrib: "ATTRIBUTION.csv", fileCol: 0, licCol: 3, authCol: 4 },
];

for (const set of SETS) {
  const dir = path.join(REPO, set.dir);
  if (!fs.existsSync(dir)) { check(`${set.dir} exists`, false, "missing"); continue; }
  console.log(`\n--- ${set.dir} ---`);
  const onDisk = new Set(fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)));

  if (set.index) {
    const idx = JSON.parse(fs.readFileSync(path.join(dir, set.index), "utf8"));
    const wanted = set.files(idx);
    const missing = wanted.filter(f => !onDisk.has(f));
    check("every file the index points at is on disk", missing.length === 0, `${missing.length} missing, e.g. ${missing[0]}`);
    check("index is not empty", wanted.length > 0, wanted.length);
    console.log(`      ${wanted.length} indexed, ${onDisk.size} on disk`);
  }

  const csv = fs.readFileSync(path.join(dir, set.attrib), "utf8").trim().split("\n").slice(1);
  const credited = new Set(csv.map(l => l.split(";")[set.fileCol]));
  const uncredited = [...onDisk].filter(f => !credited.has(f));
  check("every image on disk is credited", uncredited.length === 0,
        `${uncredited.length} uncredited, e.g. ${uncredited[0]}`);

  const blank = csv.filter(l => { const c = l.split(";"); return !c[set.licCol] || !c[set.authCol] || c[set.authCol] === "unknown"; });
  check("every credit names a licence and an author", blank.length === 0, `${blank.length} incomplete`);
  console.log(`      ${csv.length} attribution rows`);
}

/* the faces are deliberately kept out of the precache: they would triple it */
console.log("\n--- service worker ---");
const sw = fs.readFileSync(path.join(REPO, "sw.js"), "utf8");
check("faces index is precached", sw.includes("assets/faces/index.json"));
check("the 221 face images are NOT precached", !/assets\/faces\/[a-z0-9-]+\.jpg/.test(sw),
      "a portrait is listed in the service worker, which would bloat the install");

console.log(fails ? `\n${fails} FAILING CHECK(S)` : "\nAll checks passed.");
process.exit(fails ? 1 : 0);
