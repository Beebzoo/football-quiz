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

/* A portrait is drawn in a circle, so a photo taller than it is wide gets its
   middle shown and the man's head cut off above the frame. _tools/
   build-facecrop.py finds the face and crops a square, and this is the check
   that the square actually shipped. */
console.log("\n--- portraits are framed for a circle ---");
function jpegSize(file) {
  const b = fs.readFileSync(file);
  let i = 2;                                          // skip SOI
  while (i < b.length - 9) {
    if (b[i] !== 0xFF) { i++; continue; }
    const marker = b[i + 1];
    // SOF0..SOF15, minus the four that are not frame headers
    if (marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC, 0xD8].includes(marker)) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}
const faceDir = path.join(REPO, "assets/faces");
const faceFiles = fs.readdirSync(faceDir).filter(f => f.endsWith(".jpg"));
const sizes = faceFiles.map(f => ({ f, ...(jpegSize(path.join(faceDir, f)) || {}) }));
const oblong = sizes.filter(s => s.w !== s.h);
const pct = Math.round((sizes.length - oblong.length) / sizes.length * 100);
console.log(`      ${sizes.length - oblong.length} of ${sizes.length} are square (${pct}%)`);
check("at least 90% of portraits are cropped square", pct >= 90,
      `${oblong.length} still oblong, e.g. ${oblong.slice(0, 3).map(s => s.f + " " + s.w + "x" + s.h).join(", ")}`);
/* the leftovers are faces the detector could not find; they fall back to the
   CSS anchor, which only works on something roughly upright */
check("nothing left oblong is a tower", oblong.every(s => s.h / s.w < 2.2),
      oblong.filter(s => s.h / s.w >= 2.2).map(s => s.f).join(", "));
const heavy = sizes.filter(s => fs.statSync(path.join(faceDir, s.f)).size > 120 * 1024);
check("no portrait weighs more than 120KB", heavy.length === 0,
      `${heavy.length} heavy, e.g. ${heavy[0] && heavy[0].f}`);

/* the faces are deliberately kept out of the precache: they would triple it */
console.log("\n--- service worker ---");
const sw = fs.readFileSync(path.join(REPO, "sw.js"), "utf8");
check("faces index is precached", sw.includes("assets/faces/index.json"));
check("the 221 face images are NOT precached", !/assets\/faces\/[a-z0-9-]+\.jpg/.test(sw),
      "a portrait is listed in the service worker, which would bloat the install");

console.log(fails ? `\n${fails} FAILING CHECK(S)` : "\nAll checks passed.");
process.exit(fails ? 1 : 0);
