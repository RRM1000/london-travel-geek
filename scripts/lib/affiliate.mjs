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

// ===========================================================================
// SKIDDLE: A TAG, NOT A REDIRECT
//
// Skiddle does not wrap the destination the way Awin and Impact do. You append
// sktag to the skiddle.com url you were already linking to, and the reader goes
// exactly where they were going anyway. That has a consequence worth stating
// plainly: for a Skiddle url the direct booking link and the affiliate link are
// THE SAME PAGE, so there is no reader cost to earning on it - unlike a reseller
// search, which trades a good page for a commission.
//
// It ships disabled. SKIDDLE_TAG is an account id, and inventing one credits a
// stranger for every sale the site makes, silently and indefinitely. Set
// SKIDDLE_TAG in .env.local once it is confirmed in the affiliate dashboard.
// ===========================================================================

const SKIDDLE_TAG = process.env.SKIDDLE_TAG ?? "";

/**
 * The same Skiddle url, carrying our tag. undefined for anything else.
 *
 * Host-checked rather than string-matched: appending sktag to a non-Skiddle url
 * earns nothing and leaks an account id to whoever runs that domain. Returns the
 * url untouched if it already carries a tag, so re-exporting cannot double-tag
 * and a hand-entered tagged url on the sheet is left exactly as it was typed.
 */
export function skiddleUrl(destination) {
  if (!SKIDDLE_TAG || !destination) return undefined;
  let u;
  try { u = new URL(String(destination)); } catch { return undefined; }
  // Exact host or a true subdomain of it. Spelled out rather than pattern-matched
  // because the obvious regex for this quietly accepts notskiddle.com and
  // skiddle.com.attacker.net, which is how an account id ends up on a stranger's
  // domain. An equality test cannot be read wrong.
  const host = u.hostname.toLowerCase();
  if (host !== "skiddle.com" && !host.endsWith(".skiddle.com")) return undefined;
  if (u.searchParams.has("sktag")) return u.toString();
  u.searchParams.set("sktag", SKIDDLE_TAG);
  return u.toString();
}

// How each network is named to the reader. Here rather than in the components
// because the link text was hardcoded to "GetYourGuide" back when that was the
// only programme - which would have labelled the first Skiddle link with a
// competitor's name.
const NETWORK_LABEL = {
  getyourguide: "GetYourGuide",
  skiddle: "Skiddle",
  ticketmaster: "Ticketmaster",
};

/** What to call a network on the page, falling back to something honest. */
export function networkLabel(network) {
  return NETWORK_LABEL[network] ?? "our ticketing partner";
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

/** Affiliate link for an event row, or undefined when none should be shown.
 *
 * EVENTS DO NOT GENERATE A SEARCH LINK, and this is the one place the site
 * deliberately differs from activities above.
 *
 * The old rule inferred a link from type + not-free, on the assumption that a
 * ticketed exhibition is probably sold on GetYourGuide. It usually is not, and
 * the failure is invisible: GetYourGuide's search NEVER returns nothing. Of 159
 * queries in data/gyg-query-probe.json, zero came back empty - "BT Tower
 * London" returns an airport lounge and a Beefeater tour. So a generated search
 * link for something GetYourGuide does not stock lands the reader on three
 * unrelated tours behind a link marked "ad": no commission, and a worse page
 * than if we had linked nowhere.
 *
 * 31 of the 45 links it produced were exhibitions - Whistler, Constable, NIGO -
 * which is exactly the category GetYourGuide does not sell.
 *
 * So the sheet now carries an explicit Affiliate URL, filled only where a
 * product genuinely exists, and this returns it or nothing. Evidence rather
 * than inference. Activities keep their fallback because gygTourUrl resolves a
 * verified product first and the search is only its backstop.
 */
export function eventAffiliate(row) {
  // SKIDDLE IS THE ONE EXCEPTION TO "a real booking url wins", because for
  // Skiddle the two links are the same page. Tagging a booking url does not
  // move the reader, cost them anything, or swap a venue's own page for a
  // reseller's - it adds a query parameter. So there is no reason to forgo it,
  // and `replacesBooking` tells the export to tag the link in place and keep
  // calling it "Book direct", which is what it still is.
  const taggedBooking = skiddleUrl(row.bookingUrl);
  if (taggedBooking) {
    return {
      url: taggedBooking, network: "skiddle",
      label: networkLabel("skiddle"), replacesBooking: true,
    };
  }
  if (row.bookingUrl) return undefined;              // a real booking url wins
  if (!row.affiliateUrl) return undefined;
  const network = row.affiliateNetwork || "getyourguide";
  // A Skiddle url in the Affiliate URL column gets tagged too - otherwise a
  // correctly-filled row earns nothing because someone pasted the plain link.
  const url = skiddleUrl(row.affiliateUrl) ?? row.affiliateUrl;
  return { url, network, label: networkLabel(network) };
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

// CJ calls this the PID, or Promotional Property ID. It is PER SITE, not per
// account: this is londontravelgeek.co.uk's, and the theatre site has its own
// (101730660). Using the wrong one still pays - into the other site's reporting
// - so the failure is invisible and the numbers quietly become fiction.
//
// NOT the account number in the CJ header. That is the CID, it looks just as
// much like an id, and links built with it earn nothing at all.
const CJ_PID = process.env.CJ_PID ?? "101875905";

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

/**
 * CJ's documented deep link: /links/<PID>/type/dlg/<destination>.
 *
 * anrdoezrs.net looks like a domain someone made up to phish you and is one of
 * four CJ tracking domains, alongside jdoqocy.com, dpbolvw.net and tkqlhce.com.
 * They are interchangeable, so a link generated in the dashboard often carries a
 * different one than this - that is not a mismatch and not a bug.
 *
 * The destination is NOT encoded. dlg takes the url whole, appended after the
 * path, and encoding it produces a link that resolves to a CJ error page rather
 * than the hotel - the opposite convention to Awin's ued parameter above, which
 * is exactly the kind of difference that gets missed when copying one network's
 * builder to make another.
 */
const cj = (destination) =>
  CJ_PID ? `https://www.anrdoezrs.net/links/${CJ_PID}/type/dlg/${destination}` : "";

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
  //
  // Hotels.com (CJ advertiser 5275597) is the first programme on this table to
  // go live, and it is the aggregator rather than a brand because that is what
  // it is: it will sell a room in almost any hotel on the Hotels sheet, which
  // is the whole reason a catch-all exists.
  // ACCEPTED, WIRED, AND DELIBERATELY OFF. The CJ plumbing below is finished and
  // tested; what is missing is a destination worth sending anyone to.
  //
  // These links render PER HOTEL, under a named row. The only destination this
  // programme can legally be paid for is a Hotels.com url, and the only one we
  // can generate without knowing the property is their home page - so clicking
  // "Book" under The Hoxton would land the reader on the Hotels.com front door
  // to start their search again. This file already refuses that trade in its
  // opening lines: the commission is not worth the worse experience.
  //
  // To switch on: add a Hotels.com property url per row - a sheet column, or a
  // map like data/gyg-tours.json - and pass it as the destination. Then the link
  // lands on the hotel, and the commission is earned rather than hoped for.
  aggregator: [
    { network: "cj", enabled: false, home: "https://uk.hotels.com/", ownDomainOnly: true },
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
    // A programme can only be paid for traffic to ITS OWN advertiser. For a brand
    // programme the advertiser is the brand, so the hotel's own website is the
    // right destination. For the aggregator it is not: wrapping premierinn.com
    // in a Hotels.com link sends the reader to Premier Inn through a redirect
    // that earns nothing, and looks completely normal while doing it - the same
    // failure the GetYourGuide search links were switched off for.
    const destination = p.ownDomainOnly ? p.home : (row.website || p.home);
    if (p.network === "awin") {
      if (!p.advertiser || !AWIN_PUBLISHER_ID) continue;
      return { url: awin(p.advertiser, destination), network: "awin" };
    }
    if (p.network === "impact") {
      const url = impact(p.linkTemplate, destination);
      if (!url || !IMPACT_PUBLISHER_ID) continue;
      return { url, network: "impact" };
    }
    if (p.network === "cj") {
      const url = cj(destination);
      if (!url) continue;
      return { url, network: "cj" };
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
