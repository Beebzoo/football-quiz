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
const OUT_TO = (process.argv.find(a => a.startsWith("--out=")) || "").slice(6) || null;
const WIKI = "https://en.wikipedia.org/w/api.php";
const CACHE = path.join(__dirname, "_models", "badge-fame.json");   // gitignored, saves a re-run

/* how many views a year before a crest is worth asking about at all */
const FLOOR = 12000;
/* Tier sizes, not view thresholds. Thresholds were guesswork and put
   Aldershot Town in hard at +5, which is not hard, it is unanswerable for
   three men in Maastricht. Sizes are honest about what this is: a ranking,
   cut into four. */
const BANDS = [["easy", 140], ["normal", 210], ["hard", 250], ["ball", Infinity]];
const LEAGUE_LABELS = path.join(__dirname, "_models", "league-labels.json");

/* ---------- WHICH LEAGUE IS IT, AND DOES ANYONE WATCH IT ----------

   Fame alone cannot decide a tier. A year of English pageviews and a sitelink
   count both measure how much of the world looked a club up lately, and what
   makes the world look a club up is a European tie, a takeover or a Netflix
   series. That is how FC Noah of Armenia, Qarabag, BATE Borisov and Kairat
   reached normal, and how AFC DWS of the Vierde Klasse, an amateur side,
   reached normal on twenty sitelinks.

   The missing signal is the obvious one: what the club actually plays in. A
   crest is easy because a football audience sees it every weekend, not
   because a wire story ran about it in August.

   BEST EVER, NOT CURRENT. P118 is whatever league somebody last wrote down,
   so it has RB Leipzig in the 3. Liga and Palermo in Serie D. A club is taken
   at the best league it is claimed in, which puts Leipzig back in the
   Bundesliga and Sunderland back in the Premier League. That is the truer
   measure anyway: a crest people know from the Premier League stays known
   after it goes down.

   The numbers are shifts in RANK, not scores, so they read as what they are.
   Playing in the J1 League costs a crest 480 places. An amateur league costs
   it 1,300, which is most of the bank. */
const L_TOP = -160, L_BIG = 0, L_MID = 180, L_LOW = 480, L_TIER4 = 850, L_AMATEUR = 1300;
const LEAGUE_W = {
  /* the five a general audience actually watches */
  Q9448: L_TOP,        // Premier League
  Q324867: L_TOP,      // La Liga
  Q15804: L_TOP,       // Serie A
  Q82595: L_TOP,       // Bundesliga
  Q13394: L_TOP,       // Ligue 1
  /* top flights with a global name, or giants living inside them */
  Q167541: L_BIG,      // Eredivisie
  Q182994: L_BIG,      // Liga Portugal
  Q14377162: L_BIG,    // Scottish Premiership
  Q485568: L_BIG,      // Super Lig
  Q216022: L_BIG,      // Belgian Pro League
  Q206813: L_BIG,      // Brasileirao Serie A
  Q223170: L_BIG,      // Argentine Primera
  Q18543: L_BIG,       // MLS
  Q764690: L_BIG,      // Liga MX
  Q182165: L_BIG,      // Russian Premier League
  Q206073: L_BIG,      // Ukrainian Premier League
  Q255633: L_BIG,      // Saudi Pro League
  /* the big five's second tiers, and Europe's watchable middle */
  Q19510: L_MID, Q35615: L_MID, Q194052: L_MID, Q152665: L_MID, Q217374: L_MID,
  Q610823: L_MID,      // Eerste Divisie
  Q219592: L_MID, Q202699: L_MID, Q235114: L_MID, Q162604: L_MID, Q235307: L_MID,
  Q204752: L_MID, Q201671: L_MID, Q202243: L_MID, Q44763: L_MID, Q217016: L_MID,
  Q237753: L_MID, Q12837728: L_MID, Q276085: L_MID,
  /* third tiers, and top flights outside the leagues this audience follows */
  Q19565: L_LOW, Q100146559: L_LOW, Q100486747: L_LOW, Q751826: L_LOW,
  Q154069: L_LOW, Q607965: L_LOW, Q677397: L_LOW, Q754488: L_LOW,
  Q276445: L_LOW,      // J1 League
  Q2386334: L_LOW,     // K League 1
  Q477309: L_LOW, Q155965: L_LOW, Q680619: L_LOW, Q1033349: L_LOW, Q606832: L_LOW,
  Q209318: L_LOW, Q219586: L_LOW, Q60681: L_LOW, Q5334350: L_LOW, Q244464: L_LOW,
  Q275005: L_LOW, Q831202: L_LOW, Q220875: L_LOW, Q2683718: L_LOW, Q225057: L_LOW,
  /* fourth tiers and the lower professional game */
  Q48837: L_TIER4, Q58916: L_TIER4, Q1141778: L_TIER4, Q749736: L_TIER4,
  Q864298: L_TIER4, Q162533: L_TIER4, Q1141692: L_TIER4, Q1780954: L_TIER4,
  Q1470401: L_TIER4, Q1140581: L_TIER4, Q6106324: L_TIER4, Q692009: L_TIER4,
  Q610175: L_TIER4, Q2037826: L_TIER4, Q931513: L_TIER4, Q934724: L_TIER4,
  Q1362411: L_TIER4, Q30636616: L_TIER4, Q129950: L_TIER4, Q5100359: L_TIER4,
  Q163046: L_TIER4, Q210262: L_TIER4, Q386384: L_TIER4, Q1707697: L_TIER4,
  Q162031: L_TIER4, Q353508: L_TIER4, Q384536: L_TIER4, Q1561244: L_TIER4,
  Q650236: L_TIER4, Q669073: L_TIER4, Q1261184: L_TIER4, Q1813595: L_TIER4,
  Q618131: L_TIER4, Q2656109: L_TIER4, Q2509164: L_TIER4, Q14468438: L_TIER4,
  Q1394554: L_TIER4, Q1473324: L_TIER4, Q177138: L_TIER4, Q1824581: L_TIER4,
  Q218555: L_TIER4, Q2474177: L_TIER4, Q732721: L_TIER4, Q797414: L_TIER4,
  Q2186582: L_TIER4, Q1436035: L_TIER4, Q1061291: L_TIER4,
  /* amateur and regional: a crest nobody outside the town has seen */
  Q100486967: L_AMATEUR, Q548937: L_AMATEUR, Q555836: L_AMATEUR, Q2188121: L_AMATEUR,
  Q322128: L_AMATEUR, Q683390: L_AMATEUR, Q2777436: L_AMATEUR, Q58915: L_AMATEUR,
  Q59041: L_AMATEUR, Q18573: L_AMATEUR, Q18571: L_AMATEUR, Q18502: L_AMATEUR,
  Q4858459: L_AMATEUR, Q2990902: L_AMATEUR, Q2402539: L_AMATEUR, Q25762: L_AMATEUR,
  Q46582: L_AMATEUR, Q830717: L_AMATEUR, Q973312: L_AMATEUR, Q13668768: L_AMATEUR,
};
/* The long tail is ninety-odd leagues carrying one or two crests each, and
   naming them all by hand would rot the first time one is renamed. The label
   says most of what is needed: anything that reads amateur is amateur. */
const L_AMATEUR_RE = /regionalliga|oberliga|landesliga|verbandsliga|bezirksliga|kreisliga|eccellenza|promozione|prima categoria|amateur|sunday|junior|reserve|counties|combination|klasse|divisie|welsh|cymru alliance|east of scotland|north west|northern football league|campeonato (paulista|carioca|mineiro|catarinense|gaucho)|liga iv|berlin-liga|sachsenliga|nrw-liga/i;
const L_LOWER_RE = /second division|third division|segunda|tercera|terceira|ii liga|iii liga|liga ii|liga iii|serie c|serie d|national 2|national 3/i;
/* A league nobody bothered to band is more likely to be small than big. */
const L_UNKNOWN = 700;
/* Women's sides are a different game with their own crests, and one of them
   (Bay FC, NWSL) shipped in hard as a club to name. */
const L_WOMEN_RE = /\bwomen|\bfeminin|\bfemenin|\bfrauen/i;
/* Wikidata calls "Oldest football clubs" an association football club, so the
   club test passes and a list article ships as a crest to name. */
const NOT_A_CLUB_TITLE = /^(list of|oldest )/i;

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
/* A crest that is not a club's, whatever an article search says. The search
   fallback is willing: it answered "chile-national-team" with Club
   Universidad de Chile and "egypt-national-team" with National Bank of Egypt
   SC, both real clubs, so the club test passed and a national badge nearly
   shipped as a club to name. */
const NOT_A_CLUB = /(^|-)(national-team|nationalteam|federation|fa|selection|league|cup|championship|liga|serie|eredivisie|bundesliga)(-|$)/;

/* Does the answer belong to the crest? The search rescue is willing: it
   answered "tau-calcio-altopascio" with Como 1907 and "1st-lig" with
   Trabzonspor, and the mode would then show one badge and insist on another
   club's name.

   This is deliberately the SAME test _tests/badge-test.js runs on the shipped
   bank, prefix-matched on four letters so Crvena Zvezda still answers to Red
   Star and a rename is not treated as a mismatch. A stricter whole-word
   version was tried first and took the bank from 1,493 to 613, because a club
   is routinely filed under a name its crest file never used. Anything that
   genuinely reads as two different clubs is listed at the end rather than
   silently dropped. */
const RENAMED = new Set(["chance-liga", "parva-liga", "persha-liga", "ab", "b-93", "crvena-zvezda", "zvezda"]);
const wordsOf = t => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/ø/g, "o").replace(/æ/g, "ae").replace(/å/g, "a").replace(/ß/g, "ss")
    .replace(/đ|ð/g, "d").replace(/ł/g, "l").replace(/ı/g, "i").replace(/þ/g, "th")
  .replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(w => w.length > 2);
const answersToCrest = (slug, name) => {
  if (RENAMED.has(slug)) return true;
  const a = wordsOf(slug), b = wordsOf(name);
  return a.some(w => b.some(v => v.startsWith(w.slice(0, 4)) || w.startsWith(v.slice(0, 4))));
};

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
     LEAGUE, and duly filed the Ekstraklasa as a club to guess.

     ONE TYPE WAS NOT ENOUGH. Wikidata has been splitting the club, the
     organisation, from its men's first team, Q103229495, and when it does the
     article behind the crest is left as the TEAM and stops being an instance
     of Q476028. Everything typed that way silently failed the test and was
     dropped: FC Barcelona, Chelsea, Olympiacos, PAOK, AEK Athens, APOEL,
     Legia Warsaw, Getafe, Spezia, 37 clubs in all, and the bank shipped with
     no Barcelona and no Chelsea crest in it. */
  const CLUB = new Set(["Q476028", "Q103229495", "Q28083137", "Q12973014", "Q15944511"]);
  const ok = new Set();
  /* A FAILED REQUEST IS NOT A NO. The first version could not tell the two
     apart: a batch that timed out added nothing to ok, and every club in it
     was written to the cache as club:false and never asked about again. Seen
     is the batches that actually answered, so a caller can leave the rest
     unset and let the next run retry them. */
  const seen = new Set();
  for (const batch of chunk(qids, 45)) {
    const j = await getJSON("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json"
      + "&props=claims&ids=" + batch.join("|"));
    if (!j || !j.entities) { process.stdout.write("x"); await sleep(200); continue; }
    for (const [id, e] of Object.entries(j.entities)) {
      seen.add(id);
      const types = ((e.claims && e.claims.P31) || [])
        .map(c => c.mainsnak.datavalue && c.mainsnak.datavalue.value.id).filter(Boolean);
      if (types.some(t => CLUB.has(t))) ok.add(id);
    }
    process.stdout.write(".");
    await sleep(200);
  }
  ok.seen = seen;
  return ok;
}
/* Bumped whenever the club test changes, so a cached no gets asked again
   instead of outliving the rule that produced it. */
const CLUB_TEST = 2;

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
  const todo = slugs.filter(s => !cache[s] && !NOT_A_CLUB.test(s));
  const retry = slugs.filter(s => cache[s] && !cache[s].club && cache[s].how !== "search" && !NOT_A_CLUB.test(s));
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
      /* the id is kept so a later change to what counts as a club can be
         re-checked in place. The first version of this did not, and when the
         club test turned out to be wrong there was no way to re-run it
         without re-resolving 2,894 articles. */
      cache[slug] = { title: f ? f.title : null, qid: f ? f.qid : null, club: isClub, views: 0 };
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

  /* ---------- ask the cached noes again ----------
     A cached "not a club" outlives the rule that produced it, and the rule
     was wrong twice: once because the type test only knew Q476028, and once
     because a dead request was recorded as a no. Anything still marked false
     under an older CLUB_TEST is asked again, and the pageviews it never got
     are fetched for the ones that turn out to be clubs after all. */
  const recheck = slugs.filter(s => cache[s] && cache[s].qid && !cache[s].club
    && cache[s].clubv !== CLUB_TEST);
  if (recheck.length) {
    process.stdout.write(`recheck    ${recheck.length} cached noes  `);
    const verdict = await areClubs([...new Set(recheck.map(s => cache[s].qid))]);
    let back = 0;
    for (const s of recheck) {
      if (!verdict.seen.has(cache[s].qid)) continue;    // never answered, ask again next run
      cache[s].clubv = CLUB_TEST;
      if (verdict.has(cache[s].qid)) { cache[s].club = true; back++; }
    }
    console.log(`\n  ${back} were football clubs after all`);
    const needViews = slugs.filter(s => cache[s] && cache[s].club && !cache[s].views && cache[s].title);
    if (needViews.length) {
      process.stdout.write(`  pageviews for ${needViews.length}  `);
      for (const s of needViews) { cache[s].views = await views(cache[s].title); await sleep(70); }
      console.log("");
    }
    fs.writeFileSync(CACHE, JSON.stringify(cache));
  }

  /* how many language editions write about each club, the second fame signal */
  /* A ZERO HERE USED TO MEAN "THE REQUEST DIED".
     Writing 0 for every slug in a batch that came back empty was how Real
     Madrid, Manchester City, Tottenham, Inter, Juventus, Napoli, PSV, Sevilla
     and Rangers ended up on record with no sitelinks at all: 614 clubs, 41%
     of the bank, carrying a fame signal of zero. It stayed invisible because
     the ranking took the BETTER of views and sitelinks, so a club with a
     broken sitelink count still ranked on views alone. The moment the two
     signals were averaged, Real Madrid fell to normal and the bug surfaced.

     A club with an English article has at least one sitelink, so 0 is never a
     real answer. Missing entities are left unset and picked up next run. */
  const needLinks = slugs.filter(s => cache[s] && cache[s].club && cache[s].qid
    && (cache[s].links === undefined || cache[s].links === 0));
  if (needLinks.length) {
    process.stdout.write("sitelinks  ");
    for (const batch of chunk(needLinks, 45)) {
      const j = await getJSON("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json"
        + "&props=sitelinks&ids=" + batch.map(s => cache[s].qid).join("|"));
      if (!j || !j.entities) { process.stdout.write("x"); await sleep(180); continue; }
      for (const s of batch) {
        const e = j.entities[cache[s].qid];
        if (e && e.sitelinks) cache[s].links = Object.keys(e.sitelinks).length;
        else if (e) cache[s].links = 0;          // a real entity with no sitelinks
      }
      process.stdout.write(".");
      await sleep(180);
    }
    fs.writeFileSync(CACHE, JSON.stringify(cache));
    console.log("");
  }

  /* ---------- where in the world ----------
     Kept for the report at the end and for spotting a bank that has drifted
     into one country. It used to carry a multiplier, Dutch 2.6 and Spanish
     2.4, on the grounds that this table follows the Eredivisie and LaLiga.
     That is what put fourteen LaLiga 2 crests and eleven Eerste Divisie
     crests in EASY, next to Real Madrid, and Tercera Federacion sides in
     normal. The bank is tiered for a general football audience now, so the
     thumb is off the scale and the country is only reported, never scored. */
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

  /* ---------- what league does it play in ----------
     P118, every claim rather than the first, because the club is taken at the
     best league it has ever been claimed in. Cached like everything else, so
     a re-run costs nothing. */
  const needLeague = slugs.filter(s => cache[s] && cache[s].club && cache[s].qid && cache[s].leagues === undefined);
  let lLabels = {};
  try { lLabels = JSON.parse(fs.readFileSync(LEAGUE_LABELS, "utf8")); } catch (e) {}
  if (needLeague.length) {
    process.stdout.write("leagues    ");
    for (const batch of chunk(needLeague, 45)) {
      const j = await getJSON("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json"
        + "&props=claims&ids=" + batch.map(s => cache[s].qid).join("|"));
      for (const s of batch) {
        const e = (j && j.entities || {})[cache[s].qid];
        cache[s].leagues = ((e && e.claims && e.claims.P118) || [])
          .map(c => c.mainsnak.datavalue && c.mainsnak.datavalue.value.id).filter(Boolean);
      }
      process.stdout.write(".");
      await sleep(200);
    }
    fs.writeFileSync(CACHE, JSON.stringify(cache));
    console.log("");
  }
  /* Labels are only needed for the two regex fallbacks and the report, so a
     missing label costs a league its band, not its place in the bank. */
  const needLabel = [...new Set(slugs.flatMap(s => (cache[s] && cache[s].leagues) || []))].filter(q => !lLabels[q]);
  if (needLabel.length) {
    process.stdout.write("lg labels  ");
    for (const batch of chunk(needLabel, 45)) {
      const j = await getJSON("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json"
        + "&props=labels&languages=en&ids=" + batch.join("|"));
      for (const [id, e] of Object.entries((j && j.entities) || {})) {
        lLabels[id] = (e.labels && e.labels.en && e.labels.en.value) || "";
      }
      process.stdout.write(".");
      await sleep(200);
    }
    fs.mkdirSync(path.dirname(LEAGUE_LABELS), { recursive: true });
    fs.writeFileSync(LEAGUE_LABELS, JSON.stringify(lLabels, null, 1));
    console.log("");
  }
  /* One league's shift. Named bands first, then the label, then a default
     that assumes small rather than big. */
  const shiftOf = q => {
    if (LEAGUE_W[q] !== undefined) return LEAGUE_W[q];
    const lab = lLabels[q] || "";
    if (!lab) return L_UNKNOWN;
    if (L_AMATEUR_RE.test(lab)) return L_AMATEUR;
    if (L_LOWER_RE.test(lab)) return L_TIER4;
    return L_UNKNOWN;
  };
  const bestLeague = r => {
    const ls = r.leagues || [];
    if (!ls.length) return { q: null, shift: L_UNKNOWN };
    let best = { q: ls[0], shift: shiftOf(ls[0]) };
    for (const q of ls) { const s = shiftOf(q); if (s < best.shift) best = { q, shift: s }; }
    return best;
  };
  const isWomens = r => (r.leagues || []).some(q => L_WOMEN_RE.test(lLabels[q] || ""));

  /* ---------- ranking ----------
     TWO SIGNALS, AND THE BETTER OF THE TWO WINS.

     English pageviews are an English audience: they put Aldershot Town at 536
     and Ascoli at 890, true of England and no use to a table in Maastricht.
     Sitelinks, the number of language editions that bother to write about a
     club, are the opposite bias and inflate small European sides, which is
     the trap the kit bank fell into.

     Neither alone works and multiplying them punishes a club for one bad
     number: Hertha BSC has a sitelink count that reads like a fourth-tier
     side and dropped to 420 on a geometric mean.

     THE BETTER OF THE TWO IS TOO FORGIVING. Taking the better rank meant a
     club only had to win on ONE signal, and sitelinks are the easy one to
     win: a single European tie buys a dozen language editions. Qarabag, BATE
     Borisov, Kairat and FC Noah all walked into normal on sitelinks alone,
     which is the exact bias this comment says the kit bank fell into. The
     mean of the two ranks still forgives one broken signal, because a rank is
     bounded where a raw count is not, but it no longer lets one carry a club
     on its own.

     AND FAME IS ONLY HALF OF IT. The mean is then shifted by what league the
     club plays in, see LEAGUE_W above, which is the part that was missing
     altogether. */
  let rows = slugs.map(s => ({ s, n: nameOf[s] || (cache[s] && cache[s].title) || s, ...(cache[s] || {}) }))
    .filter(r => r.club && r.views >= FLOOR)
    .filter(r => !NOT_A_CLUB.test(r.s))
    .filter(r => !NOT_A_CLUB_TITLE.test(r.title || ""))
    .filter(r => !isWomens(r))
    .filter(r => answersToCrest(r.s, r.n))
    .map(r => ({ ...r, w: r.views, l: r.links || 0, lg: bestLeague(r) }));

  const rankBy = key => {
    const order = [...rows].sort((a, b) => b[key] - a[key]);
    const m = new Map();
    order.forEach((r, i) => m.set(r.s, i + 1));
    return m;
  };
  /* One club, one crest. Two logo files can resolve to the same article, and
     then the same answer turns up at two difficulties: Real Zaragoza was easy
     as "zaragoza" and normal as "real-zaragoza". Worse, some of those pairs
     are a mis-map rather than a duplicate, and the slug that matches the name
     least is the wrong one: "zurich" was answering Grasshopper Club Zurich,
     which is the other club in that city. Keep the closest match, drop the
     rest, and say how many went. */
  const overlap = (slug, name) => {
    const a = wordsOf(slug), b = wordsOf(name);
    return a.filter(w => b.some(v => v.startsWith(w.slice(0, 4)) || w.startsWith(v.slice(0, 4)))).length;
  };
  /* KEYED ON THE ENTITY, NOT THE NAME. Two crests for one club only collide
     under a name match if both slugs happen to carry the same name, and the
     name comes from the old bank rather than from the article. So
     "manchester-united" and "united-of-manchester" were kept apart as
     "Manchester United" and "Manchester United F.C.", one club with two
     crests, BOTH IN EASY, and the same for Vasco da Gama, Club Leon and
     Nimes. The qid is the club itself and does not care what it was called. */
  const keyOf = r => r.qid || r.n;
  const best = new Map();
  for (const r of rows) {
    const cur = best.get(keyOf(r));
    if (!cur || overlap(r.s, r.n) > overlap(cur.s, cur.n)) best.set(keyOf(r), r);
  }
  const twins = rows.length - best.size;
  rows = rows.filter(r => best.get(keyOf(r)) === r);

  const byViews = rankBy("w"), byLinks = rankBy("l");
  rows.forEach(r => {
    r.fame = (byViews.get(r.s) + byLinks.get(r.s)) / 2;
    r.rank = r.fame + r.lg.shift;
  });
  rows.sort((a, b) => a.rank - b.rank || b.w - a.w);

  const bank = { easy: [], normal: [], hard: [], ball: [] };
  let at = 0;
  for (const [tier, size] of BANDS) {
    for (const r of rows.slice(at, size === Infinity ? undefined : at + size)) bank[tier].push({ s: r.s, n: r.n });
    at += size === Infinity ? rows.length : size;
  }

  const wrongName = slugs.map(s => ({ s, n: nameOf[s] || (cache[s] && cache[s].title) || s, ...(cache[s] || {}) }))
    .filter(r => r.club && r.views >= FLOOR && !NOT_A_CLUB.test(r.s) && !answersToCrest(r.s, r.n));
  const dropped = slugs.length - rows.length;
  const notClub = slugs.filter(s => cache[s] && !cache[s].club).length;
  const kept = slugs.map(s => ({ s, n: nameOf[s] || (cache[s] && cache[s].title) || s, ...(cache[s] || {}) }))
    .filter(r => r.club && r.views >= FLOOR && !NOT_A_CLUB.test(r.s));
  const listArt = kept.filter(r => NOT_A_CLUB_TITLE.test(r.title || ""));
  const womens = kept.filter(r => !NOT_A_CLUB_TITLE.test(r.title || "") && isWomens(r));
  console.log(`\n${rows.length} crests kept, ${dropped} dropped`);
  console.log(`  ${notClub} were not football clubs at all (cups, leagues, countries)`);
  console.log(`  ${dropped - notClub - wrongName.length} were clubs nobody could name`);
  console.log(`  ${wrongName.length} answered to a club that was not the one on the crest`);
  console.log(`  ${twins} were a second crest for a club already in the bank`);
  console.log(`  ${listArt.length} were a list article Wikidata calls a club, ${womens.length} were women's sides`);
  wrongName.slice(0, 8).forEach(r => console.log(`      ${r.s} -> ${r.n}`));
  console.log("\n" + Object.entries(bank).map(([t, r]) => `  ${t.padEnd(7)} ${String(r.length).padStart(4)}`).join("\n"));

  /* What each tier is made of. A tier that is 40% fourth division and foreign
     top flights is the bug this build exists to stop, so it is printed every
     run rather than left for somebody to notice during a game. */
  const BAND_NAME = new Map([[L_TOP, "big-five top flight"], [L_BIG, "global top flight"],
    [L_MID, "2nd tier / Europe's middle"], [L_LOW, "3rd tier / other top flight"],
    [L_TIER4, "4th tier / lower pro"], [L_AMATEUR, "amateur, regional"], [L_UNKNOWN, "unbanded"]]);
  const rowOf = new Map(rows.map(r => [r.s, r]));
  for (const [t, list] of Object.entries(bank)) {
    const tally = new Map();
    for (const x of list) {
      const r = rowOf.get(x.s); if (!r) continue;
      const k = BAND_NAME.get(r.lg.shift) || "unbanded";
      tally.set(k, (tally.get(k) || 0) + 1);
    }
    const parts = [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`);
    console.log(`\n${t} (${list.length}): ${parts.join(", ")}`);
  }
  for (const [t, r] of Object.entries(bank)) {
    console.log(`\n${t}, hardest five:`);
    r.slice(-5).forEach(x => console.log(`   ${x.n}`));
  }

  /* --out writes the bank somewhere else, so a candidate tiering can be read
     in full and argued about before it replaces the one people are playing. */
  if (OUT_TO) {
    fs.writeFileSync(OUT_TO, JSON.stringify(bank, null, 1));
    console.log(`\npreview written to ${OUT_TO}`);
  }
  if (DRY) { console.log("\n--dry, nothing written to assets"); return; }
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(bank, null, 1));
  console.log(`\nwritten to assets/badges/index.json`);
})();
