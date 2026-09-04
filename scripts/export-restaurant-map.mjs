// Generates src/data/restaurantMaps.ts from the exported sheet.
//
// WHY THIS EXISTS. The Indian map was eighteen hand-typed markers, each with a
// hand-typed latitude and longitude, sitting next to a sheet that already held
// the same coordinates for the same venues. Two copies of one fact, and the
// hand-typed copy could not be corrected by fixing the source - Vatavaran was
// filed in Chelsea on the sheet and pinned in Chelsea on the map, and finding
// out it is actually on Beauchamp Place fixed neither until someone edited both.
//
// Now the sheet is the only place a coordinate is written down.
//
// A VENUE WITH NO COORDINATE IS OMITTED, LOUDLY. The script prints what it
// dropped and why. Do not "fix" that by typing a pin in by hand: an approximate
// pin is a reader standing outside the wrong building, which is worse than an
// absent one. Fix it by enriching the row - which is a BILLED Places call, so
// ask first.
//
//   node scripts/export-restaurant-map.mjs
//
import fs from "node:fs";

const IN = "src/data/restaurants.json";
const OUT = "src/data/restaurantMaps.ts";

// map key -> which rows belong on it.
//
// `list` is the Lists value that drives the article, so the map and the article
// cannot drift apart: adding a venue to the guide adds its pin.
//
// `also` carries venues a guide references but which are not on its list. It is
// currently unused: it existed to pin Gopal's Corner (Malaysian) on the Indian
// map, which was removed on 2026-08-23 because the guide no longer cites it.
//
// `ranked: true` means the Lists value carries a position ("best-indian:4") and
// only ranked rows get a section in the guide, so only they get a pin link.
// Without it every row is assumed to have a heading - the broken-anchor check
// below still catches any that does not, so the failure stays loud either way.
const MAPS = [
  {
    key: "instagrammable-london",
    list: "instagrammable",
    // Nothing on this list is street food; every venue is a room.
    streetFoodFormats: [],
    // On the list and in the guide, but with no section of their own - they
    // appear as cross-references or inside a by-setting paragraph.
    tableOnly: [
      "bancone", "sticks-n-sushi-battersea", "winter-garden-landmark", "joia",
      "tattu-london", "isabel-mayfair", "bob-bob-ricard",
      // These sit inside the by-setting and cheapest paragraphs rather than
      // having a heading of their own, so they earn a pin and no link.
      "nomad-london", "sky-garden", "sucre-london", "the-ivy-chelsea-garden",
      "petersham-nurseries", "seabird", "spring-somerset-house",
    ],
    article: "src/content/articles/most-instagrammable-restaurants-london.md",
  },
  {
    key: "bakeries-london",
    list: "bakery",
    // Everything on this list is format "Bakery", so nothing is street food.
    streetFoodFormats: [],
    // On the sheet's list, cited in the guide's table, but with no section of
    // their own - so a pin with no heading to land on.
    tableOnly: ["layla-bakery", "st-john-bakery"],
    // The sheet's Neighbourhood and the guide's heading disagree for these.
    // Suba and August have no Neighbourhood on the sheet at all, which is why
    // the derived anchor came out as "-undefined".
    anchors: {
      "e5-bakehouse": "#e5-bakehouse-hackney",
      "arome-bakery": "#arôme-bakery-covent-garden",
      "suba-bakery": "#suba-bakery-walthamstow",
      "august-bakery": "#august-bakery-battersea",
      "the-dusty-knuckle": "#dusty-knuckle-dalston",
      "beigel-bake": "#beigel-bake-brick-lane",
    },
    article: "src/content/articles/best-bakeries-london.md",
  },
  {
    key: "thai-london",
    list: "thai",
    streetFoodFormats: ["Counter", "Pub Residency"],
    anchors: {
      "plaza-khao-gaeng": "#plaza-khao-gaeng",
      "paolina-thai": "#paolina-kings-cross",
    },
    article: "src/content/articles/best-thai-restaurants-london.md",
  },
  {
    key: "hot-pot-london",
    list: "hot-pot",
    // The O2 branch has a pin of its own - it is 40 minutes from Leicester
    // Square and materially quieter - but no heading of its own, because it is
    // written up inside the Haidilao section rather than as a second venue.
    // Point it at that section instead of letting the exporter derive
    // #haidilao-greenwich-peninsula, which does not exist.
    anchors: { "haidilao-o2": "#haidilao-leicester-square" },
    // Every hot pot row is venueFormat "Restaurant" - even the pay-by-weight
    // malatang counters are sit-down rooms with table service on the drinks.
    streetFoodFormats: [],
    // On the list and in the guide, but pointed at from a cross-reference
    // paragraph rather than given a section of their own: the buffet rooms,
    // the second Shepherd's Bush pot and the cheapest Chinatown counter.
    tableOnly: [
      "big-brother-hot-pot", "laoma-kings-cross", "water-house-rotherhithe",
      "little-sichuan-hampstead", "pot-pot-malatang",
    ],
    // TEN OF THE THIRTY-FOUR ROWS HAVE NO PIN AT ALL and that is correct
    // rather than broken. Nan Hotpot, Mr Wang, Teo, Ning's, Real Beijing,
    // Feng Wei Shi Tang, Shu La La, Xiong Qi, Mao Master and Mealtime Malatang
    // are all recorded with an AREA and no street address, because no source
    // in data/consensus/hot-pot.json published one and their own sites either
    // do not resolve or render as a single splash image. The exporter drops
    // them loudly under OMITTED, which is the honest outcome: an approximate
    // pin is a reader standing outside the wrong building. Mr Wang and Real
    // Beijing do have sections in the guide, so they are reachable by reading;
    // they are simply not on the map.
    article: "src/content/articles/best-hot-pot-london.md",
  },
  {
    key: "korean-london",
    list: "korean-bbq",
    streetFoodFormats: [],
    tableOnly: ["sorabol", "k-town-bbq", "korean-grill-kensington"],
    anchors: { "jin-go-gae": "#jin-go-gae-burlington-road" },
    article: "src/content/articles/best-korean-restaurants-london.md",
  },
  {
    key: "ice-cream-london",
    list: "ice-cream",
    streetFoodFormats: [],
    tableOnly: ["chin-chin-ice-cream"],
    anchors: {
      "badiani": "#badiani-1932-twelve-london-shops",
      "mamasons": "#mamasons-dirty-ice-cream-kentish-town-and-chinatown",
    },
    article: "src/content/articles/best-ice-cream-london.md",
  },
  {
    key: "indian-restaurants-london",
    list: "best-indian",
    ranked: true,
    streetFoodFormats: ["Market Stall", "Counter"],
    tableOnly: ["empire-empire", "gujarati-rasoi", "horn-ok-please", "jikoni", "kanishka", "kokum", "kolkati", "punjab-covent-garden", "rasa-stoke-newington", "shree-krishna-vada-pav", "tamarind", "tayyabs"],
    article: "src/content/articles/best-indian-restaurants-london.md",
  },
  {
    key: "pizza-london",
    list: "best-pizza",
    streetFoodFormats: ["Market Stall", "Counter", "Pub Residency"],
    // Named in the guide's summary table rather than given a section of their
    // own. They still earn a pin - the map is more useful for showing them -
    // but they get no anchor, because there is no heading to land on. Listing
    // them here makes that an editorial decision rather than a silent miss:
    // anything NOT on this list that lacks a heading still fails loudly below.
    tableOnly: ["50-kalo", "67-sourdough", "ace-pizza", "bing-bong-pizza", "carmelas-pizzeria", "connies-pizza", "detroit-pizza-london", "elliots", "florencio", "franco-manca", "graceys-pizza", "homeslice", "homeslice--city", "homeslice--marylebone", "homeslice--neal-s-yard", "japes", "lantica-pizzeria-da-michele", "lantica-pizzeria-da-michele--baker-street", "lantica-pizzeria-da-michele--stoke-newington", "lardo", "laurettas", "little-earthquakes", "made-in-italy", "mamma-dough", "napoli-on-the-road-soho", "o-ver", "paulies", "pizza-pilgrims", "rias-notting-hill", "roma-pizza", "rudys-pizza-napoletana", "santa-maria-pizzeria", "santa-maria-pizzeria--fitzrovia", "santa-maria-pizzeria--fulham", "santa-maria-pizzeria--islington", "santa-maria-pizzeria--kew", "santa-maria-pizzeria--paddington", "sarvs-slice", "sodo-pizza", "spring-street-pizza", "sud-italia", "theos-pizzeria", "weezies", "zia-lucia", "zia-lucia--aldgate-east", "zia-lucia--canary-wharf", "zia-lucia--chelsea", "zia-lucia--hammersmith", "zia-lucia--islington", "zia-lucia--wandsworth", "zia-lucia--wembley", "zia-lucia--west-hampstead"],
    article: "src/content/articles/best-pizza-london.md",
  },
  {
    key: "fish-and-chips-london",
    list: "fish-and-chips",
    streetFoodFormats: ["Market Stall", "Counter", "Food Hall", "Pub Residency"],
    tableOnly: ["fishcotheque", "hobsons-fish-and-chips", "olivers-fish-and-chips", "shoreditch-fish-and-chips"],
    article: "src/content/articles/best-fish-and-chips-london.md",
  },
  {
    key: "cheap-eats-london",
    list: "cheap-eats",
    streetFoodFormats: ["Market Stall", "Counter", "Food Hall", "Pub Residency"],
        tableOnly: ["the-montagu-pyke"],
    exclude: ["diwana-bhel-poori-house","temple-of-seitan"],
    // The heading names the branch street, not the sheet's area value.
    anchors: { "tongue-and-brisket": "#tongue--brisket-leather-lane" },
    article: "src/content/articles/cheap-eats-london.md",
  },
  {
    key: "unusual-restaurants-london",
    list: "unusual",
    streetFoodFormats: ["Market Stall", "Counter", "Food Hall", "Pub Residency"],
    tableOnly: ["the-ledger-building"],
    // Boxpark Wembley is a stadium food court, not an unusual room.
    exclude: ["the-cinnamon-club", "boxpark-wembley"],
    article: "src/content/articles/unusual-restaurants-london.md",
  },
  {
    key: "afternoon-tea-london",
    list: "afternoon-tea",
    streetFoodFormats: ["Market Stall", "Counter", "Food Hall", "Pub Residency"],
        tableOnly: ["rosewood-london-tea","jumeirah-carlton-tower-afternoon-tea"],
    exclude: ["the-ampersand","browns-hotel-tea","the-milestone-tea","the-cadogan-afternoon-tea"],
    article: "src/content/articles/best-afternoon-tea-london.md",
  },
  {
    key: "coffee-london",
    list: "coffee",
    streetFoodFormats: ["Market Stall", "Counter", "Food Hall", "Pub Residency"],
    tableOnly: ["beany-green-little-venice"],
    exclude: ["yurt-cafe"],
    article: "src/content/articles/best-coffee-london.md",
  },
  {
    key: "steak-london",
    list: "best-steak",
    ranked: true,
    streetFoodFormats: ["Market Stall", "Counter"],
    // Named in the area table or the value list but with no section of their
    // own, so no anchor. They still earn a pin.
    tableOnly: ["brutto", "gymkhana", "ibai", "il-gattopardo", "lurra", "lutyens-grill", "macellaio-rc", "muccis", "sagardi", "zelman-meats"],
    article: "src/content/articles/best-steak-restaurants-london.md",
  },
  {
    key: "italian-london",
    list: "best-italian",
    // Dropped from the guide on 3 September 2026, so it must lose its pin too:
    // the sheet still carries best-italian:17, and without this it would be
    // mapped as a venue the article never mentions. Remove that list tag on
    // the sheet and this line can go.
    exclude: ["icco-pizza"],
    ranked: true,
    streetFoodFormats: ["Market Stall", "Counter", "Deli / Restaurant"],
    // The regional sections name the region in the heading, so the derived
    // "Name, Area" slug does not match. The region is the point of the guide.
    anchors: {
      "norma-fitzrovia": "#norma-fitzrovia--sicilian",
      "campania-and-jones": "#campania--jones-bethnal-green--campanian",
      brutto: "#brutto-clerkenwell--florentine",
      "macellaio-rc": "#macellaio-rc-south-kensington--piedmontese",
      "bar-etna": "#bar-etna-newington-green--sicilian-american",
      "ave-mario": "#ave-mario-covent-garden-and-circolo-popolare-fitzrovia",
      ornella: "#ornella-london-fields--milanese",
    },
    tableOnly: ["al-boccon-divino", "al-dente", "ave-mario", "cafe-murano", "langosteria-london", "muccis", "sale-e-pepe-mare"],
    article: "src/content/articles/best-italian-restaurants-london.md",
  },
  {
    key: "seafood-london",
    list: "seafood",
    // The guide does not number its entries, so every row on the list is
    // expected to have a section - which is what the broken-anchor check below
    // proves. Market stalls and counters are pinned as street food.
    streetFoodFormats: ["Market Stall", "Counter"],
    // The heading is more specific than the row, or names the venue the way it
    // trades - The Oystermen rather than its full registered name.
    anchors: {
      "wright-brothers-battersea": "#wright-brothers",
      "oystermen-seafood-bar-and-kitchen": "#the-oystermen-covent-garden",
      "applebees-borough": "#applebees-borough-market",
      "fish-market-broadgate": "#fish-market-broadgate",
    },
    // Named in the closing table or an oyster bullet, with no section.
    tableOnly: ["bibendum-oyster-bar", "cometa", "furness-oyster-bar", "kima",
      "london-shell-co", "maltby-street-market", "mandarin-kitchen",
      "richard-hawards-oysters", "rick-stein-barnes", "tollingtons"],
    article: "src/content/articles/best-seafood-restaurants-london.md",
  },
  {
    key: "sunday-roast-london",
    list: "sunday-roast",
    // Sixteen ranked rows have a section each; everything else on the list is
    // named in the closing table, which ranked:true already handles.
    ranked: true,
    streetFoodFormats: [],
    article: "src/content/articles/best-sunday-roast-london.md",
  },
  {
    key: "cocktail-bars-london",
    list: "cocktails",
    // Tayer moved heading from Shoreditch to Old Street when its closure was
    // noted, and Three Sheets now names both sites because the ranked venue is
    // the Soho one. Neither matches the sheet's area value any more.
    anchors: {
      "tayer-elementary": "#tayēr--elementary-old-street",
      "three-sheets": "#three-sheets-soho-and-dalston",
      // The sheet has Oriole's Neighbourhood as Smithfield. That is wrong, and
      // the guide carries a correction saying so: the sheet's own address,
      // 7-9 Slingsby Pl WC2E 9AB, is Covent Garden. The COORDINATES are right
      // - 230m from Slingsby Place, 1.9km from Smithfield - so the pin lands
      // correctly and only the label is wrong. The popup will keep saying
      // Smithfield until the sheet's Neighbourhood is corrected.
      oriole: "#oriole-covent-garden",
    },
    streetFoodFormats: ["Market Stall", "Counter", "Food Hall", "Pub Residency"],
    tableOnly: ["nightjar"],
    article: "src/content/articles/best-cocktail-bars-london.md",
  },
  {
    key: "dim-sum-london",
    list: "dim-sum",
    streetFoodFormats: ["Market Stall", "Counter", "Food Hall", "Pub Residency"],
        tableOnly: ["plum-valley","dumplings-legend","joy-king-lau","orient-london","baoziinn"],
    exclude: ["dim-sum-and-duck","baba-tang","yi-ban"],
    article: "src/content/articles/best-dim-sum-london.md",
  },
  {
    key: "late-night-london",
    list: "late-night",
    streetFoodFormats: ["Market Stall", "Counter", "Food Hall", "Pub Residency"],
        exclude: ["bar-italia","lebo-lebanese-grill","beigel-bake"],
    article: "src/content/articles/late-night-eating-london.md",
  },
  {
    key: "historic-pubs-london",
    list: "historic-pubs",
    streetFoodFormats: ["Market Stall", "Counter", "Food Hall", "Pub Residency"],
        tableOnly: ["the-holly-bush","bulls-head-barnes","fox-and-pheasant"],
    article: "src/content/articles/historic-pubs-dining-rooms-london.md",
  },
  {
    key: "vegetarian-london",
    list: "vegetarian",
    streetFoodFormats: ["Market Stall", "Counter", "Food Hall", "Pub Residency"],
        tableOnly: ["sutton-and-sons","horn-ok-please","gujarati-rasoi","pilpel","magic-falafel","plates-london"],
    exclude: ["balady","zeit-and-zaatar","hoxton-beach-falafel","falafel-zaki-zaki","falafel-and-shawarma","hummus-bar","mukbap","zeret-kitchen","queen-of-sheba","hullabaloo","yurt-cafe"],
    // The "Vegan by cuisine" sections name the cuisine in the heading, which the
    // derived "Name, Area" slug cannot know about. Two others differ because the
    // sheet's area and the heading's area are not the same word (Mallow is filed
    // under Borough, the heading says Borough Market).
    anchors: {
      "facing-heaven": "#facing-heaven-hackney--sichuan",
      "jam-delish": "#jam-delish-islington--caribbean",
      "itadaki-zen": "#itadaki-zen-kings-cross--japanese",
      "en-root": "#en-root-clapham-and-peckham--indian-and-east-african",
      "purezza-camden": "#purezza-camden--pizza",
      tendril: "#tendril-oxford-circus",
      "mallow-borough": "#mallow-borough-market",
    },
    article: "src/content/articles/best-vegetarian-vegan-restaurants-london.md",
  },
  {
    key: "street-food-london",
    // An explicit tag on the sheet, like every other map here. This was briefly
    // selected by venue format instead, which needed a 27-slug exclusion list
    // and a name-matching heuristic to narrow it - and that heuristic silently
    // dropped eight venues whose sheet name is spelled differently from the
    // article's ("Bang Bang Oriental Foodhall" against "Bang Bang Oriental").
    list: "street-food",
    streetFoodFormats: ["Market Stall", "Counter", "Pub Residency"],
    // The guide covers these in tables and prose rather than giving each one a
    // heading, so they get a pin with no anchor rather than a link to nothing.
    tableOnly: ["arcade-food-hall","bang-bang-oriental","borough-market","boxhall-city","boxpark-camden","boxpark-croydon","boxpark-wembley","bread-ahead","brick-lane-market","broadway-market","camden-market","corner-corner","cutty-sark-street-food-market","flat-iron-square","gopals-corner","greenwich-market","gujarati-rasoi","hackney-bridge","horn-ok-please","market-halls-canary-wharf","market-halls-oxford-street","market-halls-paddington","market-halls-victoria","market-place-vauxhall","mercato-metropolitano","mercato-metropolitano--mayfair","mercato-metropolitano--wood-wharf","vinegar-yard"],
    article: "src/content/articles/best-street-food-london.md",
  },
  {
    key: "markets-london",
    list: "markets",
    streetFoodFormats: ["Market Stall", "Counter", "Food Hall", "Pub Residency"],
        tableOnly: ["horn-ok-please","gujarati-rasoi","kolkati","borough-market","old-spitalfields-market","broadway-market"],
    exclude: ["seven-dials-market","tower-bridge-collective","arcade-food-hall","market-halls-victoria","market-halls-oxford-street","market-halls-canary-wharf","market-halls-paddington","flat-iron-square","gopals-corner","cutty-sark-street-food-market","brick-lane-market"],
    article: "src/content/articles/best-london-markets.md",
  },
];

const { restaurants } = JSON.parse(fs.readFileSync(IN, "utf8"));
const bySlug = new Map(restaurants.map((r) => [r.slug, r]));

// Must match the slugger Astro uses for heading anchors, or every articleAnchor
// on the map points at nothing. Headings in the guide are "Name, Area".
//
// ACCENTED LETTERS ARE KEPT. github-slugger, which Astro uses, preserves them:
// "50 Kalò, Trafalgar Square" becomes "50-kalò-trafalgar-square". A plain
// [^a-z0-9] class instead turns the "ò" into a separator and yields
// "50-kal-trafalgar-square", which points at nothing.
//
// That bug shipped once and the check below did not catch it, because the check
// built its list of valid ids with THIS SAME function - so both sides were
// wrong in the same way and agreed. Hence \p{L}: match the real slugger, and
// the comparison becomes meaningful again.
// github-slugger DELETES punctuation rather than treating it as a separator,
// so "Duck & Waffle" becomes "duck--waffle" - two hyphens, because the spaces
// either side of the ampersand each become one and the ampersand itself just
// disappears. Collapsing that run to a single hyphen produced "duck-waffle",
// which points at nothing.
//
// This check has now agreed with itself and been wrong TWICE - first on
// accented letters, then on ampersands - because both sides of the comparison
// call this function. Verify any change against the ids in the BUILT html.
//
// ACCENTED LETTERS ARE KEPT, for the same reason github-slugger keeps them:
// "50 Kalò" stays "50-kalò" rather than collapsing to "50-kal".
const slug = (s) =>
  s.toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "") // drop punctuation outright, do not collapse
    .replace(/\s/g, "-")                 // one hyphen per space
    .replace(/^-|-$/g, "");

const anchor = (r) => slug(`${r.name}, ${r.area}`);

const rank = (r, list) => {
  const hit = (r.lists ?? []).find((l) => l.startsWith(`${list}:`));
  return hit ? Number(hit.split(":")[1]) : 999;
};

const out = [];
const dropped = [];

for (const m of MAPS) {
  // A map selects by LIST tag, and may also select by venue FORMAT. Nothing
  // uses `formats` now: street food tried it and the narrowing it needed was
  // worse than the problem. Prefer a tag - it is an editorial decision recorded
  // once in the data, and nothing then depends on how a venue is spelled.
  const rows = restaurants
    .filter((r) => !r.branchOf && (
      (m.list && (r.lists ?? []).some((l) => l.split(":")[0] === m.list)) ||
      (m.formats && m.formats.some((f) => f.toLowerCase() === String(r.format ?? "").toLowerCase()))
    ))
    // `exclude` drops a row the LIST tag claims but the GUIDE does not cite.
    // A pin for a venue the article never mentions is worse than no pin: the
    // reader clicks it and finds nothing written about it.
    .filter((r) => !(m.exclude ?? []).includes(r.slug))
    .concat((m.also ?? []).map((s) => bySlug.get(s)).filter(Boolean))
    .sort((a, b) => rank(a, m.list) - rank(b, m.list));

  const markers = [];
  for (const r of rows) {
    if (!r.lat || !r.lng) { dropped.push(`${r.name} - no coordinates on the sheet`); continue; }
    const streetFood = m.streetFoodFormats.includes(r.format);
    markers.push({
      name: r.branchName ? `${r.name} (${r.branchName})` : r.name,
      area: r.area,
      ...(r.price ? { price: r.price } : {}),
      ...(r.station ? { station: r.station } : {}),
      latitude: r.lat,
      longitude: r.lng,
      type: streetFood ? "streetfood" : "editorial",
      // A venue the guide does not have a section for gets no anchor - a link
      // to a heading that is not there is worse than no link. On an unranked
      // map every row is expected to have one; the check below proves it.
      // `anchors` overrides the derived "Name, Area" slug for a heading that
      // carries editorial detail the sheet does not know about - the Italian
      // guide titles its regional sections "Norma, Fitzrovia — Sicilian", and
      // the region is the whole reason the section exists. Better to record the
      // real anchor than to flatten the heading to suit the exporter.
      ...((m.ranked && rank(r, m.list) === 999) || (m.tableOnly ?? []).includes(r.slug)
        ? {}
        : { articleAnchor: (m.anchors ?? {})[r.slug] ?? `#${anchor(r)}` }),
      ...(r.video ? { videoUrl: r.video } : {}),
    });
  }
  out.push({ key: m.key, markers, article: m.article });
}

// EVERY PIN'S LINK MUST LAND ON A HEADING. A marker whose articleAnchor points
// at nothing looks perfectly fine on the map and does nothing when clicked,
// which is the kind of breakage that survives for months. Renaming a venue on
// the sheet, or retitling its section, silently breaks the pair - so the pair
// is checked here, on the run that would introduce the break.
const brokenAnchors = [];
for (const { key, markers, article } of out) {
  if (!article || !fs.existsSync(article)) continue;
  const md = fs.readFileSync(article, "utf8");
  const ids = new Set([...md.matchAll(/^#{2,3} (.+)$/gm)].map(([, t]) => slug(t.trim())));
  for (const mk of markers) {
    if (mk.articleAnchor && !ids.has(mk.articleAnchor.slice(1))) {
      brokenAnchors.push(`${key}: ${mk.name} -> ${mk.articleAnchor} (no such heading in ${article})`);
    }
  }
}

const body = out.map(({ key, markers }) =>
  `  ${JSON.stringify(key)}: [\n` +
  markers.map((mk) =>
    "    {\n" +
    Object.entries(mk).map(([k, v]) => `      ${k}: ${JSON.stringify(v)},`).join("\n") +
    "\n    },",
  ).join("\n") +
  "\n  ],",
).join("\n");

fs.writeFileSync(OUT,
  `// GENERATED by scripts/export-restaurant-map.mjs - do not edit by hand.\n` +
  `// Coordinates come from the Restaurants v2 sheet. To move a pin, fix the row.\n` +
  `export type RestaurantMapMarker = {\n` +
  `  name: string;\n  area: string;\n  price?: string;\n  station?: string;\n` +
  `  latitude: number;\n  longitude: number;\n` +
  `  type: "editorial" | "video" | "streetfood";\n` +
  `  articleAnchor?: string;\n  videoUrl?: string;\n};\n\n` +
  `export const restaurantMaps: Record<string, RestaurantMapMarker[]> = {\n${body}\n};\n`,
);

for (const { key, markers } of out) {
  const n = (t) => markers.filter((m) => m.type === t).length;
  console.log(`${OUT}: ${key} - ${markers.length} pins (${n("editorial")} guide, ${n("streetfood")} street food, ${markers.filter((m) => m.videoUrl).length} with video)`);
}
if (dropped.length) {
  console.log(`\nOMITTED (${dropped.length}) - on the guide, absent from the map:`);
  dropped.forEach((d) => console.log(`  ${d}`));
  console.log("  Enriching these is a BILLED Places call. Ask before running it.");
}
if (brokenAnchors.length) {
  console.error(`\nBROKEN PIN LINKS (${brokenAnchors.length}) - the map is written, but these pins go nowhere:`);
  brokenAnchors.forEach((b) => console.error(`  ${b}`));
  console.error("  Fix the heading in the article, or the Name/Neighbourhood on the sheet.");
  process.exitCode = 1;
}
