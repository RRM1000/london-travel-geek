// Affiliate link generation, shared by the activity and event exports.
//
// ONE PLACE FOR THE PARTNER ID. It was previously hardcoded in thirteen files
// across markdown and layouts; a programme change meant thirteen edits and a
// near-certain miss. Anything generated now comes from here.
//
// THE RULE: only link where there is a ticket to sell.
//
// GetYourGuide sells tours, tickets and experiences. It does not sell a walk
// through a free park, a pint in a pub, or a browse round a market. Putting
// "Book on GetYourGuide" under Postman's Park - a free Victorian memorial you
// walk into off the street - would be absurd, and the reader would rightly stop
// trusting every other link on the page. So the gate is deliberately narrow and
// errs towards NOT linking.
//
// A manually-entered Booking URL on the sheet ALWAYS wins over a generated one:
// a direct link to the venue's own booking page is better for the reader than a
// search on a reseller, and the commission is not worth the worse experience.

import fs from "node:fs";

export const GYG_PARTNER_ID = "WWP7I0R";

// Activity types where GetYourGuide plausibly has inventory. Everything absent
// from this list gets no link at all.
//
// Deliberately EXCLUDED, with reasons:
//   park, roof-garden, garden(free ones), market-visit, street-art, skate-park,
//   bookshop, record-shop, viewpoint  - mostly free, nothing to sell
//   cinema, music-venue, theatre                    - direct booking is better,
//                                                     and theatre is the sister
//                                                     site's subject
//   darts, bowling, axe-throwing, karaoke, arcade, ping-pong, shuffleboard,
//   escape-room, mini-golf, clay-shooting, racing-sim, cricket, board-games
//                                                   - competitive socialising is
//                                                     booked direct with the
//                                                     venue, not through a tours
//                                                     marketplace
const GYG_ACTIVITY_TYPES = new Set([
  "museum", "historic-house", "observation-wheel", "aquarium", "zoo",
  "planetarium", "climbing", "cable-car", "boating", "walking-tour",
  "gallery-experience", "immersive-game", "immersive-theatre", "garden",
  "sport-stadium", "cemetery", "food-tour", "distillery-tour", "brewery-tour",
  "masterclass",
]);

// Event types with sellable tickets. Festivals and seasonal street events are
// usually free and are caught by the free-price rule below anyway.
const GYG_EVENT_TYPES = new Set([
  "exhibition", "immersive-theatre", "secret-cinema", "installation",
  "concert", "dining-experience",
]);

// Free only when the price LEADS with it: "Free", "Free to browse", "Free entry
// off-peak".
//
// The first version tested for the word "free" ANYWHERE in the string, which
// silently killed the link on The Painted Hall - priced "About £19, under-16s
// free". A concession buried mid-sentence does not make a venue free, and that
// false positive costs the link on exactly the ticketed venues worth linking.
const isFree = (price) => /^\s*free\b/i.test(String(price ?? ""));

/**
 * A GetYourGuide SEARCH url for a venue, carrying the partner id.
 *
 * Search rather than a product deep-link ON PURPOSE: a product id would have to
 * be looked up and verified per venue, and a stale or guessed one sends the
 * reader to a 404 or - worse - somebody else's tour. A search always resolves to
 * something honest, and if GetYourGuide has nothing the reader sees an empty
 * result rather than a broken promise.
 */
export function gygSearchUrl(name, { city = "London" } = {}) {
  const q = `${name} ${city}`.replace(/\s+/g, " ").trim();
  return `https://www.getyourguide.com/s/?q=${encodeURIComponent(q)}&partner_id=${GYG_PARTNER_ID}`;
}

// Hand-verified product pages, keyed by activity slug - see data/gyg-tours.json
// for how they were chosen and the bar for adding one. Read once at module load;
// an empty or missing file just means every link stays a search, as before.
const TOUR_MAP = (() => {
  try {
    return JSON.parse(fs.readFileSync("data/gyg-tours.json", "utf8")).tours ?? {};
  } catch {
    return {};
  }
})();

/**
 * The tour page for a venue when we have verified one.
 *
 * getyourguide.com/activity/-t<id> is GetYourGuide's own canonical deep-link
 * form - the one their exports emit - so it survives a tour being retitled,
 * which a slug-bearing url would not.
 */
export function gygTourUrl(slug, { cmp } = {}) {
  const t = TOUR_MAP[slug];
  if (!t?.tourId) return undefined;
  const campaign = cmp ? `&cmp=${encodeURIComponent(cmp)}` : "";
  return `https://www.getyourguide.com/activity/-t${t.tourId}?partner_id=${GYG_PARTNER_ID}${campaign}`;
}

/** Everything data/gyg-tours.json knows about a venue, or undefined. */
export function gygTour(slug) {
  return TOUR_MAP[slug];
}

/** Affiliate link for an activity row, or undefined when none should be shown. */
export function activityAffiliate(row) {
  if (row.bookingUrl) return undefined;              // a real booking url wins
  if (!GYG_ACTIVITY_TYPES.has(row.type)) return undefined;
  if (isFree(row.price)) return undefined;
  // A verified product page beats a search: the reader lands on a price and a
  // rating rather than on a list to sift. cmp tags the click to its guide, so
  // it appears as its own row in the partner dashboard's Campaigns report
  // instead of falling into no_reseller_campaign.
  const direct = gygTourUrl(row.slug, { cmp: row.guide ? `${row.guide}-activity` : undefined });
  return { url: direct ?? gygSearchUrl(row.name), network: "getyourguide" };
}

/** Affiliate link for an event row, or undefined when none should be shown. */
export function eventAffiliate(row) {
  if (row.bookingUrl) return undefined;
  if (!GYG_EVENT_TYPES.has(row.type)) return undefined;
  if (isFree(row.price)) return undefined;
  return { url: gygSearchUrl(row.name), network: "getyourguide" };
}

// ===========================================================================
// HOTELS: SEVERAL NETWORKS, ONE RESOLVER
//
// A hotel can be bookable through more than one programme - IHG runs on both
// Awin and Impact, and almost anything is also sellable through an aggregator.
// So a row does NOT store a link. It stores a BRAND, and the link is resolved
// here at export time from the brand plus whichever programmes are switched on.
// Change networks, or lose one, and you re-export rather than re-editing
// hundreds of rows by hand.
//
// NOTHING GENERATES UNTIL A PROGRAMME IS ENABLED AND ITS IDS ARE FILLED IN.
// Every entry below ships disabled with empty ids on purpose: a tracking link
// invented from a plausible-looking URL pattern would look completely normal,
// earn nothing, and quite possibly send readers somewhere wrong. Join the
// programme, paste the real ids, flip enabled to true.
//
// PUBLISHER IDS ARE NOT SECRETS but they are account identifiers, so they read
// from the environment first and fall back to the literal below. Set
// AWIN_PUBLISHER_ID / IMPACT_PUBLISHER_ID in .env.local rather than committing
// them if you would rather they stayed out of git.
// ===========================================================================

const AWIN_PUBLISHER_ID = process.env.AWIN_PUBLISHER_ID ?? "";
const IMPACT_PUBLISHER_ID = process.env.IMPACT_PUBLISHER_ID ?? "";

/** Awin's deep-link format is stable and documented: cread.php with a ued target. */
const awin = (advertiserId, destination) =>
  `https://www.awin1.com/cread.php?awinmid=${advertiserId}&awinaffid=${AWIN_PUBLISHER_ID}&ued=${encodeURIComponent(destination)}`;

/**
 * Impact gives each programme its OWN tracking domain, so there is no single
 * format to hardcode. `linkTemplate` is copied from that programme's dashboard
 * and must contain {DEST}; anything without one stays disabled.
 */
const impact = (linkTemplate, destination) =>
  linkTemplate ? linkTemplate.replace("{DEST}", encodeURIComponent(destination)) : "";

// brand key -> the programmes that can sell it, best first.
export const HOTEL_PROGRAMMES = {
  "premier-inn": [
    { network: "awin", advertiser: "3916", enabled: false, home: "https://www.premierinn.com/" },
  ],
  travelodge: [
    // 1% on a completed stay. Kept for completeness, but see the note in
    // write-hotels.mjs - it barely covers the cost of the link.
    { network: "awin", advertiser: "1586", enabled: false, home: "https://www.travelodge.co.uk/" },
  ],
  hilton: [
    { network: "awin", advertiser: "3624", enabled: false, home: "https://www.hilton.com/" },
  ],
  ihg: [
    { network: "awin", advertiser: "", enabled: false, home: "https://www.ihg.com/" },
    { network: "impact", linkTemplate: "", enabled: false, home: "https://www.ihg.com/" },
  ],
  marriott: [
    { network: "impact", linkTemplate: "", enabled: false, home: "https://www.marriott.com/" },
  ],
  accor: [
    { network: "awin", advertiser: "", enabled: false, home: "https://all.accor.com/" },
  ],
  hostelworld: [
    // CPA on the deposit rather than a percentage of the stay, and the rate is
    // the highest of anything here - the obvious programme for the hostel rows.
    { network: "awin", advertiser: "", enabled: false, home: "https://www.hostelworld.com/" },
  ],
  // The catch-all for independents and anything whose own brand has no
  // programme. Deliberately LAST in every lookup.
  aggregator: [
    { network: "awin", advertiser: "", enabled: false, home: "https://uk.hotels.com/" },
  ],
};

/**
 * Resolve the best available affiliate link for a hotel row.
 *
 * Order: a hand-entered direct booking url beats everything, then the brand's
 * own programme, then the aggregator fallback. Returns undefined when nothing
 * is enabled - which is the state this ships in.
 */
export function hotelAffiliate(row) {
  if (row.bookingUrl) return undefined;

  const chain = [
    ...(HOTEL_PROGRAMMES[row.brand] ?? []),
    ...HOTEL_PROGRAMMES.aggregator,
  ];

  for (const p of chain) {
    if (!p.enabled) continue;
    const destination = row.website || p.home;
    if (p.network === "awin") {
      if (!p.advertiser || !AWIN_PUBLISHER_ID) continue;
      return { url: awin(p.advertiser, destination), network: "awin" };
    }
    if (p.network === "impact") {
      const url = impact(p.linkTemplate, destination);
      if (!url || !IMPACT_PUBLISHER_ID) continue;
      return { url, network: "impact" };
    }
  }
  return undefined;
}

/** Which programmes are live, for the export to report honestly. */
export function enabledHotelProgrammes() {
  const live = [];
  for (const [brand, list] of Object.entries(HOTEL_PROGRAMMES))
    for (const p of list) if (p.enabled) live.push(`${brand}:${p.network}`);
  return live;
}
