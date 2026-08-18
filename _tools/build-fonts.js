/* Pull the interface font down and self-host it.

     node _tools/build-fonts.js

   BALL is an offline PWA, so it cannot ask Google for a font mid-match in a
   pub with no signal. The files live in assets/fonts/ and the service worker
   precaches them, same as the flags and the vendored supabase client.

   Barlow Semi Condensed, SIL Open Font License, which allows redistribution
   as long as the licence travels with the files: assets/fonts/OFL.txt.

   Both latin and latin-ext are fetched. That is not optional here, the game
   is full of Ștefan Kovács, Willum Þór Willumsson and Joey Guðjónsson, and
   latin alone would drop them back to a fallback font mid-word.

   SAFE TO RE-RUN. Files already on disk are left alone unless --force. */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const OUT = path.join(REPO, "assets", "fonts");
const FORCE = process.argv.includes("--force");
const FAMILY = "Barlow Semi Condensed";
const WEIGHTS = [400, 600, 700];
/* A modern browser UA or the CSS endpoint answers in ttf for ancient ones */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const OFL = "https://raw.githubusercontent.com/google/fonts/main/ofl/barlowsemicondensed/OFL.txt";

const get = async (url, bin) => {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(url + " -> HTTP " + res.status);
  return bin ? Buffer.from(await res.arrayBuffer()) : await res.text();
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const url = "https://fonts.googleapis.com/css2?family="
    + encodeURIComponent(FAMILY) + ":wght@" + WEIGHTS.join(";") + "&display=swap";
  const css = await get(url);

  /* The CSS comes back as a run of @font-face blocks, one per subset per
     weight, each headed by a /* latin *\/ style comment. That comment is the
     only thing naming the subset, so the blocks are split on it. */
  const blocks = css.split("/*").slice(1).map(b => "/*" + b);
  const wanted = [], rules = [];
  for (const b of blocks) {
    const subset = (b.match(/^\/\*\s*([a-z-]+)\s*\*\//) || [])[1];
    const weight = (b.match(/font-weight:\s*(\d+)/) || [])[1];
    const src = (b.match(/url\((https:[^)]+\.woff2)\)/) || [])[1];
    if (!subset || !weight || !src) continue;
    if (!["latin", "latin-ext"].includes(subset)) continue;
    const file = `barlow-semicondensed-${weight}-${subset}.woff2`;
    const range = (b.match(/unicode-range:\s*([^;]+);/) || [])[1];
    wanted.push({ file, src });
    rules.push(`@font-face{font-family:'Barlow Semi Condensed';font-style:normal;`
      + `font-weight:${weight};font-display:swap;src:url(assets/fonts/${file}) format('woff2');`
      + `unicode-range:${range.trim()}}`);
  }
  console.log(`${wanted.length} files wanted (${WEIGHTS.length} weights x 2 subsets)`);

  let got = 0;
  for (const w of wanted) {
    const dest = path.join(OUT, w.file);
    if (!FORCE && fs.existsSync(dest)) continue;
    fs.writeFileSync(dest, await get(w.src, true));
    got++;
  }
  if (!fs.existsSync(path.join(OUT, "OFL.txt")) || FORCE) {
    fs.writeFileSync(path.join(OUT, "OFL.txt"), await get(OFL));
  }

  fs.writeFileSync(path.join(OUT, "font-face.css"), rules.join("\n") + "\n");
  const bytes = wanted.reduce((a, w) => a + fs.statSync(path.join(OUT, w.file)).size, 0);
  console.log(`downloaded ${got}, ${(bytes / 1024).toFixed(0)} KB total`);
  console.log(`\nfont-face.css written. Paste it into index.html's <style> if the`);
  console.log(`@font-face block there ever needs rebuilding, and list any new file`);
  console.log(`in sw.js EXTRA_ASSETS or it will not be there offline.`);
})();
