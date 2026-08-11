/* BALL quiz service worker: network-first so updates land instantly,
   cache fallback so the pub's dead wifi can't stop the game. */
const CACHE = "ball-quiz-v33";
const EXTRA_ASSETS = ["assets/ball.png", "assets/stadiums/index.json"];
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
  "stoke-city","blackburn-rovers","millwall","nottingham-forest","crystal-palace",
  "sunderland","bristol-city","aston-villa","kyoto-sanga","cska-sofia",
  "estudiantes-de-la-plata","racing","genoa","instituto-cordoba","internacional",
  "figueirense","hoffenheim","sochaux","club-brugge","teplice","cska-moskva",
  "sint-truidense","gent","zenit","girona","antwerp","san-jose-earthquakes",
  "brest","al-shabab","grenoble-foot-38","troyes","valladolid","bordeaux","lille",
  "charleroi","leganes","verona","albacete","farul-constanta","crvena-zvezda",
  "atalanta","pisa","maritimo","besiktas","vitoria-de-guimaraes","wolves","sc-braga",
  "velez-sarsfield","celta","watford","kasimpasa","reading","panathinaikos","burnley",
  "livorno","bari","union-berlin","toronto-fc","pescara","torino","paris-fc",
  "piacenza","perugia","rangers","salernitana","sion","swansea-city","eibar",
  "nantes","spartak-moskva","dynamo-moscow","lorient","lecce","monterrey",
  "portland-timbers","ado-den-haag","nec-nijmegen","middlesbrough","bournemouth",
  "shakhtar","sassuolo","neom","olympiacos","guingamp","celtic","bolton",
  "sv-austria-salzburg","ascoli","chievo","koln","gornik-zabrze","vfl-bochum",
  "coventry-city","shamrock-rovers","ipswich","brighton","dundee-united",
  "hull-city","cardiff-city","ferencvaros","espanyol","alanyaspor","hertha-bsc",
  "young-boys","new-england-revolution","rangers","amiens","stade-lavallois",
  "northampton","exeter","al-ettifaq","sheffield-united","getafe","osasuna",
  "monterrey","monza","adana-demirspor","sion","empoli","venezia","charlton",
  "real-zaragoza","colo-colo","heracles","hajduk-split","tours","osijek",
  "pumas-unam","cannes","stuttgarter-kickers","al-sadd","penarol","fc-nordsjaelland",
  "beijing-guoan","1860-munich","cartagena","recreativo-huelva","almere-city",
  "apollon-limassol","melbourne-victory","western-sydney","sydney-fc","emirates-club",
  "al-duhail","shandong-taishan","bate-borisov","kosice","pyunik","vojvodina",
  "rnk-split","zeljeznicar","nk-zagreb","lokomotiva-zagreb","independiente-medellin",
  "saprissa","nacional-uy","cerro","uniao-sao-joao","olimpija","chemnitzer-fc",
  "melbourne-city","kickers-offenbach","bayer-uerdingen","partizan",
  "universidad-catolica","atletico-junior","america-de-cali","koge","istres",
  "asec-mimosas","al-shahania","queens-park-fc","atk","agf-aarhus","al-arabi",
  "al-ahli-doha","racing-santander","al-rayyan","lusail","hereford","peterborough",
  "lumezzane","shanghai-shenhua","al-ain","albinoleffe","chieti","helsingborgs",
  "guadalajara","widzew-lodz","leon","domzale","brondby","nimes","newcastle-jets",
  "wydad","sepahan","rbc-roosendaal","campomaiorense",
  "kashima-antlers","botafogo-sp","santos","guarani","kashiwa-reysol","pisa",
  "jubilo-iwata","reggiana","sport-recife","halmstad","seattle-sounders-fc",
  "copenhagen","notts-county","stromsgodset","cerezo-osaka","pachuca",
  "colorado-rapids","atlas","san-diego-fc","rennes","rubin","sturm-graz",
  "rc-lens","brighton","coventry-city","nantes","montpellier","rc-strasbourg-alsace",
  "sakaryaspor","wigan","servette","hansa-rostock","telstar","boavista",
  "sheffield-wednesday","gent","gaziantep","novara","athletico-paranaense",
  "santos","palmeiras","fluminense","salzburg","bastia",
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
  ...EXTRA_ASSETS,
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
