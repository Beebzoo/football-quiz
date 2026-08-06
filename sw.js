/* BALL quiz service worker: network-first so updates land instantly,
   cache fallback so the pub's dead wifi can't stop the game. */
const CACHE = "ball-quiz-v10";
const CAREER_LOGOS = [
  "mvv-maastricht","bordeaux","fleetwood-town","leicester","boulogne","al-ittihad",
  "brescia","le-havre-ac","al-ahli",
  "dc-united","derby-county","vissel-kobe","independiente","argeninos-juniors",
  "newells-old-boys","levante","vasco-da-gama","fluminense","palmeiras",
  "deportivo-la-coruna","olympiacos","aek-athens","sporting-gijon","auxerre",
  "leeds-united","cagliari","dynamo-kyiv","sparta-praha","rennes","banfield",
  "udinese","botafogo","lille","fc-den-bosch","malaga","pec-zwolle","sc-cambuur",
  "willem-ii","fulham","villarreal","roma","bahia","como-1907","basaksehir",
  "eintracht-frankfurt","chicago-fire-fc","vancouver-whitecaps-fc",
  "borussia-monchengladbach","vfb-stuttgart","beveren","bolton",
  "west-bromwich-albion","portsmouth","de-graafschap","rb-leipzig","brentford",
  "bryne","molde","aik","birmingham","rio-ave","fc-nurnberg","karlsruher",
  "cremonese","vicenza","padova","bologna","cf-montreal","standard-liege",
  "tenerife","oviedo","almeria","nac-breda","vitesse","az-alkmaar","sparta-rotterdam",
  "ajax","al-hilal","al-nassr","al-qadsiah","anderlecht","arsenal","as-monaco",
  "as-saint-etienne","atletico-madrid","atletico-mineiro","barcelona","basel",
  "bayer-leverkusen","bayern-munchen","benfica","boca-juniors","borussia-dortmund",
  "celtic","chelsea","corinthians","cruzeiro","dinamo-zagreb","everton","fc-groningen",
  "fc-kaiserslautern","fc-metz","fc-porto","fc-utrecht","fenerbahce","feyenoord",
  "fiorentina","flamengo","fortuna-sittard","galatasaray","genk","gremio","guingamp",
  "hamburger-sv","inter","inter-miami-cf","juventus","la-galaxy","las-palmas","lazio",
  "le-mans","lech-poznan","lille","liverpool","los-angeles-fc","lyon","malmo","mallorca",
  "manchester-city","manchester-united","marseille","milan","napoli","new-york-city-fc",
  "new-york-red-bulls","newcastle","nice","orlando-city","palermo","paris-saint-germain",
  "parma","psv","queens-park-rangers","rayo-vallecano","real-betis","real-madrid",
  "real-sociedad","river-plate","roma","rosario-central","salzburg","sampdoria",
  "santos","sao-paulo","sc-heerenveen","schalke-04","sevilla","southampton","sporting-cp",
  "tottenham","twente","valencia","werder-bremen","west-ham","wolfsburg",
];
const ASSETS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-180.png",
  ...CAREER_LOGOS.map(s => "assets/logos/" + s + ".png"),
  "assets/flags/nl.webp",
  "assets/flags/gran-canaria.webp",
  "assets/flags/morocco.webp",
  "assets/players/zidane.png",
  "assets/players/pedri.png",
  "assets/players/sinkgraven.png",
  "assets/players/deijl.png",
  "assets/players/taarabt.png",
  "assets/players/ajax.png",
  "assets/players/mvv-hero.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })
        .then(hit => hit || caches.match("index.html")))
  );
});
