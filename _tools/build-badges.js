/* Rebuild the Badge Zoom bank so BALL is hard rather than impossible.

     node _tools/build-badges.js            build it
     node _tools/build-badges.js --dry      report only, write nothing

   WHAT WAS WRONG. The bank was the logo library minus a filter: easy was the
   70 One & Only clubs, hard was the career deck, and BALL was everything
   else, all 2,196 of it. "Everything else" turned out to include FC Carrazeda
   de Ansiaes, Kendal Tornado and Maguary PE, which nobody at a table could
   name from the whole crest let alone a corner of it, and also the EFL Cup,
   the Scottish Championship and the CONCACAF Champions Cup, which are not
   clubs at all.

   HOW IT IS BUILT NOW. Two questions per crest, both answered from data.

   Is it a club? Wikidata says so or it does not go in: the article behind the
   logo has to be an instance of an association football club. That is what
   throws out the competitions and the national teams.

   Would anyone know it? A year of English Wikipedia pageviews, the same
   measure the kit bank uses, because sitelink counts rank a Lithuanian side
   that once reached a European tie above Heerenveen. Tiers are bands of that,
   and everything under the floor is dropped rather than filed under BALL.

   A crest you could not name with the whole thing in front of you is not a
   question, it is a shrug.

   SAFE TO RE-RUN. Slow: it asks about every crest in the library. */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const OUT = path.join(REPO, "assets", "badges");
const UA = "BallQuizBot/1.0 (personal football quiz; https://github.com/Beebzoo/football-quiz)";
const DRY = process.argv.includes("--dry");
const WIKI = "https://en.wikipedia.org/w/api.php";
const CACHE = path.join(__dirname, "_models", "badge-fame.json");   // gitignored, saves a re-run

/* how many views a year before a crest is worth asking about at all */
const FLOOR = 12000;
/* the bands, in views per year */
const BANDS = [["easy", 900000], ["normal", 250000], ["hard", 60000], ["ball", FLOOR]];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (i + 1)); continue; }
      return null;
    } catch (e) { if (i === tries - 1) return null; await sleep(1200 * (i + 1)); }
  }
  return null;
}

/* slug -> a title to ask Wikipedia about. The library is flat slugs, so the
   name in the old bank is the better starting point where there is one. */
function titleGuess(slug, name) {
  if (name) return name;
  return slug.split("-").map(w => w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)).join(" ");
}

async function resolve(titles) {
  const out = {};
  for (const batch of chunk(titles, 40)) {
    const j = await getJSON(WIKI + "?action=query&format=json&formatversion=2&redirects=1"
      + "&prop=pageprops&ppprop=wikibase_item&titles=" + encodeURIComponent(batch.join("|")));
    const back = {};
    for (const r of (j && j.query && j.query.redirects) || []) back[r.to] = r.from;
    for (const r of (j && j.query && j.query.normalized) || []) back[r.to] = back[r.to] || r.from;
    for (const p of (j && j.query && j.query.pages) || []) {
      if (p.missing || !p.pageprops) continue;
      out[back[p.title] || p.title] = { title: p.title, qid: p.pageprops.wikibase_item };
    }
    process.stdout.write(".");
    await sleep(150);
  }
  return out;
}

/* is it a football club, or is it a cup, a league or a country? */
async function areClubs(qids) {
  /* Q476028 is association football club, checked rather than remembered.
     The first pass also allowed Q15991303, which is association football
     LEAGUE, and duly filed the Ekstraklasa as a club to guess. */
  const CLUB = new Set(["Q476028"]);
  const ok = new Set();
  for (const batch of chunk(qids, 45)) {
    const j = await getJSON("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json"
      + "&props=claims&ids=" + batch.join("|"));
    for (const [id, e] of Object.entries((j && j.entities) || {})) {
      const types = ((e.claims && e.claims.P31) || [])
        .map(c => c.mainsnak.datavalue && c.mainsnak.datavalue.value.id).filter(Boolean);
      if (types.some(t => CLUB.has(t))) ok.add(id);
    }
    process.stdout.write(".");
    await sleep(200);
  }
  return ok;
}

async function areClubsQuiet(qids){
  const before = process.stdout.write;
  process.stdout.write = () => true;          // no dots from the retry loop
  try { return await areClubs(qids); } finally { process.stdout.write = before; }
}

async function views(title) {
  const t = encodeURIComponent(title.replace(/ /g, "_"));
  const j = await getJSON(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${t}/monthly/2024010100/2024123100`, 2);
  return j && j.items ? j.items.reduce((a, i) => a + (i.views || 0), 0) : 0;
}

(async () => {
  const logos = fs.readdirSync(path.join(REPO, "assets/logos")).filter(f => f.endsWith(".png"));
  const old = JSON.parse(fs.readFileSync(path.join(OUT, "index.json"), "utf8"));
  const nameOf = {};
  for (const tier of Object.values(old)) for (const b of tier) nameOf[b.s] = b.n;
  const slugs = logos.map(f => f.slice(0, -4));
  console.log(`${slugs.length} crests in the library, ${Object.keys(nameOf).length} already named\n`);

  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch (e) {}

  /* A flat slug is not a title: "fc-carrazeda-de-ansiaes" will never match
     "F.C. Carrazeda de Ansiães", and the first pass counted every miss as
     "not a football club", which is how 1,891 crests were thrown out of a
     library that is almost entirely football clubs. Anything that failed the
     exact lookup gets searched for instead, once, and the answer is cached
     with how it was found so a re-run does not repeat the work. */
  const todo = slugs.filter(s => !cache[s]);
  const retry = slugs.filter(s => cache[s] && !cache[s].club && cache[s].how !== "search");
  console.log(`${todo.length} to look up, ${retry.length} to search for again, ${slugs.length - todo.length - retry.length} settled`);

  if (retry.length) {
    process.stdout.write("searching  ");
    let done = 0, rescued = 0;
    for (const batch of chunk(retry, 1)) {
      const slug = batch[0];
      const q = titleGuess(slug, nameOf[slug]) + " football club";
      const j = await getJSON(WIKI + "?action=query&format=json&formatversion=2&list=search&srlimit=1&srsearch="
        + encodeURIComponent(q));
      const hit = j && j.query && j.query.search && j.query.search[0];
      cache[slug] = { title: hit ? hit.title : null, club: false, views: 0, how: "search" };
      if (hit) {
        const r = await resolve([hit.title]);
        const f = r[hit.title];
        if (f) {
          const isClub = (await areClubsQuiet([f.qid])).has(f.qid);
          cache[slug] = { title: f.title, qid: f.qid, club: isClub, views: isClub ? await views(f.title) : 0, how: "search" };
          if (isClub) rescued++;
        }
      }
      if (++done % 25 === 0) {
        process.stdout.write(`\r  searched ${done}/${retry.length}, ${rescued} were clubs after all   `);
        fs.mkdirSync(path.dirname(CACHE), { recursive: true });
        fs.writeFileSync(CACHE, JSON.stringify(cache));
      }
      await sleep(120);
    }
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, JSON.stringify(cache));
    console.log(`\r  searched ${done}, ${rescued} were clubs after all            `);
  }

  if (todo.length) {
    process.stdout.write("wikipedia  ");
    const asked = {};
    for (const s of todo) asked[titleGuess(s, nameOf[s])] = s;
    const found = await resolve(Object.keys(asked));
    console.log(`\n  ${Object.keys(found).length} of ${todo.length} matched an article`);

    process.stdout.write("wikidata   ");
    const clubs = await areClubs([...new Set(Object.values(found).map(f => f.qid))]);
    console.log(`\n  ${clubs.size} of them are football clubs`);

    process.stdout.write("pageviews  ");
    let n = 0;
    for (const [asking, slug] of Object.entries(asked)) {
      const f = found[asking];
      const isClub = !!(f && clubs.has(f.qid));
      cache[slug] = { title: f ? f.title : null, club: isClub, views: 0 };
      if (isClub) cache[slug].views = await views(f.title);
      if (++n % 40 === 0) {
        process.stdout.write(`\r  ${n}/${todo.length}`);
        fs.mkdirSync(path.dirname(CACHE), { recursive: true });
        fs.writeFileSync(CACHE, JSON.stringify(cache));
      }
      await sleep(70);
    }
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, JSON.stringify(cache));
    console.log(`\r  ${n}/${todo.length} done          `);
  }

  /* ---------- who this table actually knows ----------
     Pageviews are English Wikipedia, so they rank Port Vale and Bury above
     Willem II and Tenerife. True of the world, useless for three men who
     follow the Eredivisie and LaLiga. Dutch and Spanish clubs are worth more
     to this table than the raw number says, so they carry a multiplier, and
     the country comes from Wikidata rather than from a guess at the name. */
  const HOME = { Q55: 2.6, Q29: 2.4 };            // Netherlands, Spain
  const needCountry = slugs.filter(s => cache[s] && cache[s].club && cache[s].qid && cache[s].country === undefined);
  if (needCountry.length) {
    process.stdout.write("countries  ");
    for (const batch of chunk(needCountry, 45)) {
      const j = await getJSON("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json"
        + "&props=claims&ids=" + batch.map(s => cache[s].qid).join("|"));
      for (const s of batch) {
        const e = (j && j.entities || {})[cache[s].qid];
        const c = e && e.claims && e.claims.P17 && e.claims.P17[0]
          && e.claims.P17[0].mainsnak.datavalue && e.claims.P17[0].mainsnak.datavalue.value.id;
        cache[s].country = c || null;
      }
      process.stdout.write(".");
      await sleep(200);
    }
    fs.writeFileSync(CACHE, JSON.stringify(cache));
    console.log("");
  }

  /* ---------- the bank ---------- */
  const rows = slugs.map(s => ({ s, n: nameOf[s] || (cache[s] && cache[s].title) || s, ...(cache[s] || {}) }))
    .filter(r => r.club && r.views >= FLOOR)
    .map(r => ({ ...r, weight: r.views * (HOME[r.country] || 1) }));
  rows.sort((a, b) => b.weight - a.weight);

  const bank = { easy: [], normal: [], hard: [], ball: [] };
  for (const r of rows) {
    const band = BANDS.find(([, floor]) => r.weight >= floor);
    bank[band[0]].push({ s: r.s, n: r.n });
  }

  const dropped = slugs.length - rows.length;
  const notClub = slugs.filter(s => cache[s] && !cache[s].club).length;
  console.log(`\n${rows.length} crests kept, ${dropped} dropped`);
  console.log(`  ${notClub} were not football clubs at all (cups, leagues, countries)`);
  console.log(`  ${dropped - notClub} were clubs nobody could name`);
  console.log("\n" + Object.entries(bank).map(([t, r]) => `  ${t.padEnd(7)} ${String(r.length).padStart(4)}`).join("\n"));
  for (const [t, r] of Object.entries(bank)) {
    console.log(`\n${t}, hardest five:`);
    r.slice(-5).forEach(x => console.log(`   ${x.n}`));
  }

  if (DRY) { console.log("\n--dry, nothing written"); return; }
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(bank, null, 1));
  console.log(`\nwritten to assets/badges/index.json`);
})();
