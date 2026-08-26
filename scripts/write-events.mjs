// Sole owner of the "Events" tab. Same contract as write-activities.mjs: this
// file is the source of truth, the sheet is the output, nothing else writes it.
//
// WHY A THIRD TAB RATHER THAN MORE ACTIVITY ROWS
// An activity is a place that is there next year. An event has an END DATE, and
// that one difference changes everything downstream:
//
//   - It must EXPIRE BY ITSELF. A restaurant row that goes stale is wrong; an
//     event row that goes stale is a page telling a reader to visit something
//     that closed last month. export-events.mjs drops anything already ended,
//     so the site cannot publish a finished run even if nobody tidies the sheet.
//   - It needs a DATE RANGE on the page. "Closes 13 September" is the single
//     most important fact about a limited run and no activity column carries it.
//   - It is worth flagging when a run is ENDING SOON, which is meaningless for
//     a permanent venue.
//
// Putting these in Activities would mean every activity row needed date logic
// it does not have, and the Activities tab would slowly fill with dead shows.
//
// The LOCATION SPINE matches Restaurants v2 and Activities exactly, so
// scripts/enrich.mjs works on this tab unchanged. Do not rename those columns.
//
//   node scripts/write-events.mjs [--dry-run]
//
import fs from "node:fs";
import { writeTab } from "./sheets.mjs";

const TODAY = new Date().toISOString().slice(0, 10);

const COLUMNS = [
  // --- shared spine: identical names to the other two tabs ---
  { key: "slug", head: "Slug" },
  { key: "name", head: "Name" },
  { key: "status", head: "Status" },
  { key: "statusChecked", head: "Status Checked" },
  // --- what it is ---
  { key: "eventType", head: "Event Type" },
  { key: "style", head: "Style" },
  { key: "venue", head: "Venue" },
  // --- WHEN. The reason this tab exists. ---
  { key: "startsOn", head: "Starts On" },
  { key: "endsOn", head: "Ends On" },
  { key: "recurring", head: "Recurring" },
  // The DURABLE fact for anything annual: "August bank holiday weekend",
  // "second Saturday in November". Exact dates for a given year go stale within
  // months and often are not published a year ahead; this does not. It is what
  // the page falls back to once an edition has been and gone.
  { key: "typicalWhen", head: "Typical When" },
  // --- where ---
  { key: "hood", head: "Neighbourhood" },
  { key: "borough", head: "Borough" },
  { key: "areaGuide", head: "Area Guide" },
  { key: "zone", head: "Zone" },
  { key: "district", head: "District" },
  { key: "address", head: "Address" },
  { key: "postcode", head: "Postcode" },
  { key: "lat", head: "Lat" },
  { key: "lng", head: "Lng" },
  { key: "placeId", head: "Place ID" },
  { key: "station", head: "Nearest Station" },
  { key: "walkMin", head: "Walk Min" },
  // --- planning a visit ---
  { key: "agePolicy", head: "Age Policy" },
  { key: "duration", head: "Typical Duration" },
  { key: "pricePerPerson", head: "Price Per Person" },
  { key: "bookingRequired", head: "Booking Required" },
  { key: "indoorOutdoor", head: "Indoor / Outdoor" },
  { key: "stepFree", head: "Step-Free" },
  // --- editorial ---
  { key: "whyGo", head: "Why Go" },
  { key: "opSummary", head: "Operational Summary" },
  { key: "goodFor", head: "Good For" },
  { key: "lists", head: "Lists" },
  // --- provenance ---
  { key: "website", head: "Website" },
  { key: "bookingUrl", head: "Booking URL" },
  { key: "source", head: "Source" },
  { key: "firstSeen", head: "First Seen" },
  { key: "lastChecked", head: "Last Checked" },
];

const VOCAB = {
  eventType: [
    "immersive-theatre", "exhibition", "installation", "secret-cinema",
    "dining-experience", "seasonal", "festival", "concert",
  ],
  agePolicy: ["all-ages", "family-friendly", "over-18", "over-18-evenings", "over-16", "adults-only"],
  bookingRequired: ["required", "recommended", "walk-in"],
  indoorOutdoor: ["indoor", "outdoor", "both"],
  stepFree: ["", "yes", "no", "partial"],
  recurring: ["", "annual", "seasonal"],
};

// Same discipline as the other two tabs.
const HOODS = {
  "Notting Hill":         { zone: "1–2", district: "West" },
  "Kensington":           { zone: "1–2", district: "West" },
  "Chelsea":              { zone: "1–2", district: "West" },
  "Richmond":             { zone: "4",   district: "West" },
  "South Kensington":     { zone: "1",   district: "West" },
  "Marylebone":           { zone: "1",   district: "Central" },
  "City of London":       { zone: "1",   district: "Central" },
  "St James's":           { zone: "1",   district: "Central" },
  "Greenwich":            { zone: "2–3", district: "South" },
  "Hackney":              { zone: "2",   district: "East" },
  "Battersea":            { zone: "1",   district: "South" },
  "Bermondsey":           { zone: "1–2", district: "South" },
  "Covent Garden":        { zone: "1",   district: "Central" },
  "South Bank":           { zone: "1",   district: "Central" },
  "Waterloo":             { zone: "1",   district: "Central" },
  "Westminster":          { zone: "1",   district: "Central" },
  "Soho":                 { zone: "1",   district: "Central" },
  "Islington":            { zone: "1–2", district: "North" },
  "King's Cross":         { zone: "1",   district: "North" },
  "Stratford":            { zone: "3",   district: "East" },
  "Greenwich Peninsula":  { zone: "2",   district: "East" },
  "Fulham":               { zone: "2",   district: "West" },
  "Wembley":              { zone: "4",   district: "North" },
};

const base = { status: "open", statusChecked: TODAY, firstSeen: TODAY, lastChecked: TODAY };

const ROWS = [
  // ============================================================================
  // SOURCED FROM ONE AGGREGATOR, 2026-08-20.
  //
  // immersiverumours.com/current-shows-london, supplied by the site owner. It is
  // a good, specialist, actively-maintained list - but it is ONE DOMAIN, and the
  // playbook counts consensus in distinct publisher domains for a reason. Every
  // row below therefore says where it came from and whether it was independently
  // confirmed. Immersive runs are the shortest-lived category on this site: five
  // closed venues have already been caught on other passes.
  //
  // Shows in areas with no guide were NOT written: Bridge Command (Vauxhall),
  // Chat Noir (West Kensington), Mundo Pixar and Bubble Planet (Wembley Park),
  // Wake The Tiger (White City), Room 13 (Clapham Junction), Paradox Museum
  // (Knightsbridge - the guide is still a dangling reference). They have nowhere
  // to appear, so a row would be an orphan.
  //
  // The four "at-home" entries were skipped outright: a phone or WhatsApp game
  // has no London location and belongs to neither tab.
  // ============================================================================
  {
    ...base, slug: "peaky-blinders-underworld",
    name: "Peaky Blinders: Underworld",
    eventType: "immersive-theatre", style: "Walk-through Shelby underworld",
    venue: "Arches London Bridge",
    startsOn: "2026-08-13", endsOn: "2027-01-03",
    hood: "Bermondsey", borough: "Southwark", areaGuide: "bermondsey-area-guide",
    address: "8 Bermondsey Street",
    agePolicy: "over-16", duration: "About an hour",
    pricePerPerson: "From about £20",
    bookingRequired: "required", indoorOutdoor: "indoor",
    whyGo: "Starts in a rebuilt Garrison Tavern, then a hidden door drops you into the Shelby underworld to wander, meet actors and work things out for yourself.",
    opSummary: "In the railway arches at 8 Bermondsey Street - the aggregator files it under London Bridge, which sends people to the wrong side of the station.",
    goodFor: "groups, date",
    lists: "events",
    source: "immersiverumours.com 2026-08-20, VERIFIED via Variety, ianVisits, BroadwayWorld and peakyblinders.london. Sources differ on the close date - 30 Dec vs 3 Jan; the later official date is used and the row should be rechecked in December.",
  },
  {
    ...base, slug: "the-traitors-live-experience",
    name: "The Traitors: Live Experience",
    eventType: "immersive-theatre", style: "Playable version of the TV format",
    venue: "Covent Garden",
    startsOn: "", endsOn: "2026-11-08",
    hood: "Covent Garden", borough: "Westminster", areaGuide: "covent-garden-area-guide",
    address: "Covent Garden, WC2",
    agePolicy: "over-18", duration: "About 90 minutes",
    bookingRequired: "required", indoorOutdoor: "indoor",
    whyGo: "You sit at the Round Table, you are secretly assigned Faithful or Traitor, and you have to lie to a room of strangers for an hour and a half.",
    opSummary: "Booked as an individual rather than a group, so you play with strangers unless you buy out a sitting - which is the point of the format.",
    goodFor: "groups, date",
    lists: "events",
    source: "immersiverumours.com 2026-08-20. NEEDS VERIFYING - single source for the 8 November close date.",
  },
  {
    ...base, slug: "grease-immersive-battersea",
    name: "Grease: The Immersive Movie Musical",
    eventType: "immersive-theatre", style: "Live musical staged around the audience",
    venue: "Battersea Park",
    startsOn: "", endsOn: "2026-09-13",
    hood: "Battersea", borough: "Wandsworth", areaGuide: "battersea-area-guide",
    address: "Battersea Park",
    agePolicy: "all-ages", duration: "An evening",
    bookingRequired: "required", indoorOutdoor: "indoor",
    whyGo: "The film staged as a live musical with the audience inside the set rather than in front of it, in a purpose-built venue in Battersea Park.",
    opSummary: "CLOSES 13 SEPTEMBER 2026 - a short run, and the nearest thing on this list to already being over.",
    goodFor: "groups, families, date",
    lists: "events",
    source: "immersiverumours.com 2026-08-20. NEEDS VERIFYING - single source.",
  },
  {
    ...base, slug: "luminiscence-westminster-cathedral",
    name: "LUMINISCENCE",
    eventType: "concert", style: "360-degree projection concert in a cathedral",
    venue: "Westminster Cathedral",
    startsOn: "", endsOn: "2026-09-27",
    hood: "Westminster", borough: "Westminster", areaGuide: "westminster-area-guide",
    address: "42 Francis Street",
    agePolicy: "all-ages", duration: "About an hour",
    bookingRequired: "required", indoorOutdoor: "indoor",
    stepFree: "yes",
    whyGo: "Projection mapped across the inside of Westminster Cathedral with live music - the unfinished blackened brick above the marble takes the light unusually well.",
    opSummary: "In the cathedral itself, which is otherwise free to enter. Closes 27 September 2026.",
    goodFor: "date, solo, groups",
    lists: "events",
    source: "immersiverumours.com 2026-08-20. NEEDS VERIFYING - single source.",
  },
  {
    ...base, slug: "the-magicians-table",
    name: "The Magician's Table",
    eventType: "immersive-theatre", style: "Close-up magic for a small room",
    venue: "Waterloo",
    startsOn: "", endsOn: "2026-08-30",
    hood: "Waterloo", borough: "Lambeth", areaGuide: "south-bank-area-guide",
    address: "Waterloo, SE1",
    agePolicy: "over-18", duration: "About 90 minutes",
    bookingRequired: "required", indoorOutdoor: "indoor",
    whyGo: "Close-up magic performed at arm's length for a small audience, where the whole effect depends on there being nowhere for the performer to hide.",
    opSummary: "CLOSES 30 AUGUST 2026 - days away at the time of writing. Check before recommending it to anyone.",
    goodFor: "date, groups",
    lists: "events",
    source: "immersiverumours.com 2026-08-20. NEEDS VERIFYING - single source, and closing imminently.",
  },
  {
    ...base, slug: "ramses-pharaohs-gold",
    name: "Ramses and the Pharaohs' Gold",
    eventType: "exhibition", style: "Egyptian treasures from Cairo",
    venue: "Battersea Power Station",
    startsOn: "", endsOn: "2026-08-30",
    hood: "Battersea", borough: "Wandsworth", areaGuide: "battersea-area-guide",
    address: "Battersea Power Station",
    agePolicy: "all-ages", duration: "About two hours",
    bookingRequired: "required", indoorOutdoor: "indoor",
    stepFree: "yes",
    whyGo: "A hundred and eighty objects out of the Egyptian Museum in Cairo, shown inside the Power Station - including material that has not travelled before.",
    opSummary: "CLOSES 30 AUGUST 2026. Ticketed and separate from the free shopping floors around it.",
    goodFor: "families, solo, groups",
    lists: "events",
    source: "immersiverumours.com 2026-08-20, corroborated by batterseapowerstation.co.uk during the earlier Battersea activities pass.",
  },
  {
    ...base, slug: "larger-than-life-wallace-gromit",
    name: "Larger Than Life: Starring Wallace & Gromit",
    eventType: "exhibition", style: "Aardman sets, models and animation",
    venue: "King's Cross",
    startsOn: "2026-10-14", endsOn: "",
    hood: "King's Cross", borough: "Camden", areaGuide: "kings-cross-area-guide",
    address: "King's Cross, N1C",
    agePolicy: "family-friendly", duration: "About 90 minutes",
    bookingRequired: "recommended", indoorOutdoor: "indoor",
    stepFree: "yes",
    whyGo: "Aardman's actual sets and models up close, where you can see the thumbprints left in the plasticine.",
    opSummary: "OPENS 14 OCTOBER 2026 - not open yet. No published closing date.",
    goodFor: "families",
    lists: "events",
    source: "immersiverumours.com 2026-08-20. NEEDS VERIFYING - single source.",
  },
  {
    ...base, slug: "phantom-peak-stratford",
    name: "Phantom Peak",
    eventType: "immersive-theatre", style: "Open-world town you explore at your own pace",
    venue: "Westfield Stratford City",
    startsOn: "2026-12-04", endsOn: "",
    hood: "Stratford", borough: "Newham", areaGuide: "stratford-area-guide",
    address: "Westfield Stratford City",
    agePolicy: "family-friendly", duration: "Three hours or more",
    bookingRequired: "required", indoorOutdoor: "indoor",
    whyGo: "A whole built town with more than twenty parallel storylines running at once - you pick which to follow and cannot see them all in one visit.",
    opSummary: "OPENS 4 DECEMBER 2026 at Westfield Stratford City. The original Canada Water venue CLOSED on 28 February 2026 after 625 performances - older guides still send people there.",
    goodFor: "groups, families, date",
    lists: "events",
    source: "immersiverumours.com 2026-08-20, VERIFIED via phantompeak.com, Time Out, Blooloop and BroadwayWorld. The Canada Water closure is the important fact here.",
  },
  {
    ...base, slug: "club-nvrlnd",
    name: "Club NVRLND",
    eventType: "immersive-theatre", style: "Peter Pan as a nightclub musical",
    venue: "Waterloo",
    startsOn: "2026-11-14", endsOn: "2027-01-31",
    hood: "Waterloo", borough: "Lambeth", areaGuide: "south-bank-area-guide",
    address: "Waterloo, SE1",
    agePolicy: "over-18", duration: "An evening",
    bookingRequired: "required", indoorOutdoor: "indoor",
    whyGo: "Peter Pan rewritten as a club night, with the cast performing around a dancefloor you are standing on rather than a stage you face.",
    opSummary: "Runs 14 November 2026 to 31 January 2027. Over-18.",
    goodFor: "groups, date, celebration",
    lists: "events",
    source: "immersiverumours.com 2026-08-20. NEEDS VERIFYING - single source.",
  },
  {
    ...base, slug: "sophies-surprise-christmas",
    name: "Sophie's Surprise Christmas Party",
    eventType: "seasonal", style: "Circus and comedy Christmas show",
    venue: "Soho",
    startsOn: "2026-11-13", endsOn: "2027-01-10",
    recurring: "annual", typicalWhen: "Mid-November to early January",
    hood: "Soho", borough: "Westminster", areaGuide: "soho-area-guide",
    address: "Soho, W1",
    agePolicy: "over-18", duration: "An evening",
    bookingRequired: "required", indoorOutdoor: "indoor",
    whyGo: "Circus, cabaret and comedy in a Christmas show that is emphatically not for children, and returns most years.",
    opSummary: "Runs 13 November 2026 to 10 January 2027. Over-18 - the name is misleading and families do turn up expecting otherwise.",
    goodFor: "groups, date, celebration",
    lists: "events",
    source: "immersiverumours.com 2026-08-20. NEEDS VERIFYING - single source.",
  },
  {
    ...base, slug: "waldorf-project-chapter-five",
    name: "The Waldorf Project: Chapter Five / KAIHOGYO",
    eventType: "installation", style: "Long-form sensory art",
    venue: "Islington",
    startsOn: "2026-11-19", endsOn: "2026-12-20",
    hood: "Islington", borough: "Islington", areaGuide: "islington-area-guide",
    address: "Islington, N1",
    agePolicy: "over-18", duration: "Several hours",
    bookingRequired: "required", indoorOutdoor: "indoor",
    whyGo: "A sustained sensory work rather than a show with a running time - the Waldorf Project's chapters are closer to endurance art than theatre.",
    opSummary: "Runs 19 November to 20 December 2026. Over-18, and demanding by design - not a casual evening out.",
    goodFor: "solo, date",
    lists: "events",
    source: "immersiverumours.com 2026-08-20. NEEDS VERIFYING - single source.",
  },
  {
    ...base, slug: "secret-cinema-pirates-caribbean",
    name: "Secret Cinema Presents Pirates of the Caribbean",
    eventType: "secret-cinema", style: "Film screening inside a built world",
    venue: "North Greenwich",
    startsOn: "2027-02-16", endsOn: "2027-04-25",
    hood: "Greenwich Peninsula", borough: "Greenwich", areaGuide: "greenwich-area-guide",
    address: "North Greenwich, SE10",
    agePolicy: "family-friendly", duration: "An evening",
    bookingRequired: "required", indoorOutdoor: "indoor",
    whyGo: "Secret Cinema's format: a full set built around the film, actors in it, and you in costume before the screening starts.",
    opSummary: "16 February to 25 April 2027 - the furthest ahead on this list. Costume is expected rather than optional.",
    goodFor: "groups, families, date",
    lists: "events",
    source: "immersiverumours.com 2026-08-20. NEEDS VERIFYING - single source, and far enough out that dates commonly move.",
  },

  // ==========================================================================
  // THE ANNUAL CALENDAR, 2026-08-20
  //
  // These recur every year, so TYPICAL WHEN is the load-bearing field and the
  // exact dates are a bonus. Where an edition has already happened this year -
  // the Marathon ran on 26 April - the export clears the dates and the page
  // falls back to "returns each April" rather than quoting a date in the past.
  //
  // Dates below are the 2026 editions where confirmed. Anything not confirmed
  // carries Typical When only, deliberately: a made-up date is worse than an
  // honest "late June".
  // ==========================================================================
  {
    ...base, slug: "notting-hill-carnival",
    name: "Notting Hill Carnival",
    eventType: "festival", style: "Europe's largest street carnival",
    venue: "Ladbroke Grove and Westbourne Park",
    startsOn: "2026-08-29", endsOn: "2026-08-31",
    recurring: "annual", typicalWhen: "The August bank holiday weekend",
    hood: "Notting Hill", borough: "Kensington and Chelsea", areaGuide: "notting-hill-area-guide",
    address: "Ladbroke Grove, W11",
    agePolicy: "all-ages", duration: "A full day",
    pricePerPerson: "Free",
    bookingRequired: "walk-in", indoorOutdoor: "outdoor",
    stepFree: "partial",
    whyGo: "Two million people, Europe's biggest street carnival, led by London's Caribbean communities since 1966 - sound systems, mas bands and steel pan through the streets of W11, and free.",
    opSummary: "SUNDAY IS FAMILY DAY and much calmer than Monday. Ladbroke Grove and Westbourne Park stations go exit-only or shut entirely - plan the walk out before you go in.",
    goodFor: "groups, families",
    lists: "events, free",
    source: "Annual calendar 2026-08-20; Wikipedia and visitlondon. MOVED FROM THE ACTIVITIES TAB, where it sat as a seasonal street-art row - a two-day annual event is an event, and the activities tab had no way to say when it runs.",
  },
  {
    ...base, slug: "london-marathon",
    name: "The London Marathon",
    eventType: "festival", style: "Mass-participation marathon through the city",
    venue: "Blackheath to The Mall",
    startsOn: "2026-04-26", endsOn: "2026-04-26",
    recurring: "annual", typicalWhen: "A Sunday in late April",
    hood: "Greenwich", borough: "Greenwich", areaGuide: "greenwich-area-guide",
    address: "Blackheath, SE3",
    agePolicy: "all-ages", duration: "A full morning",
    pricePerPerson: "Free to watch",
    bookingRequired: "walk-in", indoorOutdoor: "outdoor",
    stepFree: "partial",
    whyGo: "Free to watch and one of the great days in the London calendar - the start is on Blackheath, and the course runs through Greenwich, Tower Bridge and Canary Wharf to The Mall.",
    opSummary: "FREE TO WATCH but it closes a great many roads and the DLR and Jubilee line are packed all morning. Greenwich around the 10km mark is one of the best and loudest stretches.",
    goodFor: "families, groups, solo",
    lists: "events, free",
    source: "Annual calendar 2026-08-20; the 2026 race ran 26 April. Filed to Greenwich because the start and the best early miles are there; the finish is in Westminster.",
  },
  {
    ...base, slug: "pride-in-london",
    name: "Pride in London",
    eventType: "festival", style: "Parade and stages across central London",
    venue: "Hyde Park Corner to Whitehall",
    startsOn: "2026-07-04", endsOn: "2026-07-04",
    recurring: "annual", typicalWhen: "A Saturday in late June or early July",
    hood: "Soho", borough: "Westminster", areaGuide: "soho-area-guide",
    address: "Soho and Trafalgar Square",
    agePolicy: "all-ages", duration: "A full day",
    pricePerPerson: "Free",
    bookingRequired: "walk-in", indoorOutdoor: "outdoor",
    stepFree: "partial",
    whyGo: "The parade runs through the middle of town to Whitehall, and Soho - which is the reason Pride is here at all - becomes one continuous street party for the day.",
    opSummary: "Free. Soho is closed to traffic and rammed; Old Compton Street is the centre of it. Trafalgar Square and Golden Square hold the free stages.",
    goodFor: "groups, families, solo",
    lists: "events, free",
    source: "Annual calendar 2026-08-20; the 2026 parade was 4 July, though one source listed it as to be confirmed. Typical When is the durable fact.",
  },
  {
    ...base, slug: "hyde-park-winter-wonderland",
    name: "Hyde Park Winter Wonderland",
    eventType: "seasonal", style: "Christmas market, rides and ice rink",
    venue: "Hyde Park",
    startsOn: "2026-11-19", endsOn: "2027-01-03",
    recurring: "annual", typicalWhen: "Mid-November to early January",
    hood: "Kensington", borough: "Westminster", areaGuide: "kensington-area-guide",
    address: "Hyde Park, W2",
    agePolicy: "all-ages", duration: "An afternoon or evening",
    pricePerPerson: "Free entry off-peak, timed ticket at peak",
    bookingRequired: "recommended", indoorOutdoor: "outdoor",
    stepFree: "partial",
    whyGo: "A hundred and fifty-odd rides, bars and market stalls across Hyde Park, plus the largest outdoor ice rink in the city - the biggest Christmas thing London does.",
    opSummary: "Entry is free at quiet times and ticketed at peak, but the RIDES AND RINK ARE PAID SEPARATELY and it adds up fast. Weekday afternoons are the only calm slots.",
    goodFor: "families, groups, date",
    lists: "events",
    source: "Annual calendar 2026-08-20; hydeparkwinterwonderland.com gives 19 Nov 2026 to 3 Jan 2027. NOTE: no London event called 'Christmasland' could be found - this is almost certainly what was meant.",
  },
  {
    ...base, slug: "christmas-at-kew",
    name: "Christmas at Kew",
    eventType: "seasonal", style: "After-dark illuminated trail through the gardens",
    venue: "Royal Botanic Gardens, Kew",
    startsOn: "", endsOn: "",
    recurring: "annual", typicalWhen: "Mid-November to early January, after dark",
    hood: "Richmond", borough: "Richmond upon Thames", areaGuide: "richmond-area-guide",
    address: "Kew, Richmond",
    agePolicy: "all-ages", duration: "About 90 minutes",
    bookingRequired: "required", indoorOutdoor: "outdoor",
    stepFree: "yes",
    whyGo: "A mile-and-a-half illuminated trail through Kew after dark, ending at the Palm House lit up and reflected in the pond - the best of London's Christmas light trails.",
    opSummary: "Timed entry and it sells out weeks ahead, especially at weekends. Outdoors for ninety minutes in December - dress for it properly.",
    goodFor: "families, date, groups",
    lists: "events",
    source: "Annual calendar 2026-08-20. Dates for the coming edition not yet confirmed, so Typical When only - deliberately, rather than guessing.",
  },
  {
    ...base, slug: "lord-mayors-show",
    name: "The Lord Mayor's Show",
    eventType: "festival", style: "A procession that has run since 1215",
    venue: "The City of London",
    startsOn: "2026-11-14", endsOn: "2026-11-14",
    recurring: "annual", typicalWhen: "The second Saturday in November",
    hood: "City of London", borough: "City of London", areaGuide: "city-of-london-area-guide",
    address: "Mansion House to the Royal Courts of Justice",
    agePolicy: "all-ages", duration: "A morning, with fireworks at dusk",
    pricePerPerson: "Free",
    bookingRequired: "walk-in", indoorOutdoor: "outdoor",
    stepFree: "partial",
    whyGo: "A procession that has run every year since 1215 - state coach, livery companies, floats and a river of marching bands through the Square Mile, followed by fireworks on the Thames.",
    opSummary: "Free and one of the oldest civic events in the world. Get a spot on Cheapside or Fleet Street early; the fireworks are from the river at dusk.",
    goodFor: "families, groups, solo",
    lists: "events, free",
    source: "Annual calendar 2026-08-20; 14 November 2026 confirmed.",
  },
  {
    ...base, slug: "chelsea-flower-show",
    name: "RHS Chelsea Flower Show",
    eventType: "festival", style: "The world's most famous flower show",
    venue: "Royal Hospital Chelsea",
    startsOn: "", endsOn: "",
    recurring: "annual", typicalWhen: "Five days in late May",
    hood: "Chelsea", borough: "Kensington and Chelsea", areaGuide: "chelsea-area-guide",
    address: "Royal Hospital Chelsea, Royal Hospital Road",
    agePolicy: "all-ages", duration: "A full day",
    bookingRequired: "required", indoorOutdoor: "outdoor",
    stepFree: "partial",
    whyGo: "Show gardens built from nothing in three weeks on the grounds of Wren's hospital, then dismantled - the most-watched gardening event anywhere, and over a century old.",
    opSummary: "Tickets go months ahead and RHS members get first refusal. It takes over the Royal Hospital grounds entirely, so the free walk there is off for the duration.",
    goodFor: "groups, date, solo",
    lists: "events",
    source: "Annual calendar 2026-08-20. Late May annually; specific dates not carried because they move and are published a year out.",
  },
  {
    ...base, slug: "bbc-proms",
    name: "The BBC Proms",
    eventType: "concert", style: "Eight weeks of concerts, standing tickets from a few pounds",
    venue: "Royal Albert Hall",
    startsOn: "", endsOn: "",
    recurring: "annual", typicalWhen: "Mid-July to mid-September",
    hood: "South Kensington", borough: "Kensington and Chelsea", areaGuide: "south-kensington-area-guide",
    address: "Kensington Gore",
    agePolicy: "all-ages", duration: "An evening",
    pricePerPerson: "Promming tickets from about £8",
    bookingRequired: "recommended", indoorOutdoor: "indoor",
    stepFree: "yes",
    whyGo: "Eight weeks of world-class orchestral music where you can stand in the arena for the price of a pint - the Promming tickets are the whole point and are sold on the day.",
    opSummary: "PROMMING TICKETS ARE SOLD ON THE DAY and cannot be booked - queue at the hall. Everything else books months ahead. The Last Night is balloted.",
    goodFor: "solo, date, groups",
    lists: "events",
    source: "Annual calendar 2026-08-20. Runs mid-July to mid-September each year at the Royal Albert Hall.",
  },
  {
    ...base, slug: "trooping-the-colour",
    name: "Trooping the Colour",
    eventType: "festival", style: "The King's Birthday Parade",
    venue: "Horse Guards Parade and The Mall",
    startsOn: "", endsOn: "",
    recurring: "annual", typicalWhen: "A Saturday in mid-June",
    hood: "St James's", borough: "Westminster", areaGuide: "westminster-area-guide",
    address: "Horse Guards Parade, SW1A",
    agePolicy: "all-ages", duration: "A morning",
    pricePerPerson: "Free from The Mall",
    bookingRequired: "walk-in", indoorOutdoor: "outdoor",
    stepFree: "partial",
    whyGo: "Fourteen hundred soldiers, two hundred horses and four hundred musicians on Horse Guards, ending with the RAF flypast over the Palace balcony.",
    opSummary: "Seats on Horse Guards are BALLOTED months ahead, but The Mall is free and unticketed and gets you the procession and the flypast. Arrive very early for a spot on the rail.",
    goodFor: "families, groups, solo",
    lists: "events, free",
    source: "Annual calendar 2026-08-20. Mid-June annually; the balloted seating is the fact most visitors do not know.",
  },
  {
    ...base, slug: "new-years-eve-fireworks",
    name: "New Year's Eve Fireworks",
    eventType: "festival", style: "Midnight fireworks from the Thames",
    venue: "The Thames, by the London Eye",
    startsOn: "", endsOn: "",
    recurring: "annual", typicalWhen: "31 December, midnight",
    hood: "South Bank", borough: "Lambeth", areaGuide: "south-bank-area-guide",
    address: "Victoria Embankment and the South Bank",
    agePolicy: "all-ages", duration: "About fifteen minutes",
    pricePerPerson: "Ticketed viewing areas",
    bookingRequired: "required", indoorOutdoor: "outdoor",
    stepFree: "partial",
    whyGo: "Twelve minutes of fireworks fired from barges and the London Eye itself, watched by a hundred thousand people along the river.",
    opSummary: "THE RIVERSIDE VIEWING AREAS ARE TICKETED and sell out in autumn - it stopped being free years ago. Without a ticket the embankments are closed and you will not see it.",
    goodFor: "groups, date",
    lists: "events",
    source: "Annual calendar 2026-08-20. The ticketing is the important fact - a lot of guides still describe this as a free event.",
  },
  {
    ...base, slug: "chinese-new-year-london",
    name: "Chinese New Year in Chinatown",
    eventType: "festival", style: "Parade, lion dances and stage performances",
    venue: "Chinatown and Trafalgar Square",
    startsOn: "", endsOn: "",
    recurring: "annual", typicalWhen: "Late January or February, on the lunar new year",
    hood: "Soho", borough: "Westminster", areaGuide: "soho-area-guide",
    address: "Gerrard Street and Trafalgar Square",
    agePolicy: "all-ages", duration: "A full day",
    pricePerPerson: "Free",
    bookingRequired: "walk-in", indoorOutdoor: "outdoor",
    stepFree: "partial",
    whyGo: "The largest Chinese New Year celebration outside Asia - a parade from Trafalgar Square into Chinatown, lion dances between the restaurants, and free stages all day.",
    opSummary: "Free. The date moves with the lunar calendar, so it is late January some years and well into February others. Chinatown restaurants need booking weeks ahead that weekend.",
    goodFor: "families, groups, solo",
    lists: "events, free",
    source: "Annual calendar 2026-08-20. Date moves with the lunar calendar, which is exactly why Typical When rather than a fixed date.",
  },
  {
    ...base, slug: "bfi-london-film-festival",
    name: "BFI London Film Festival",
    eventType: "festival", style: "Two weeks of premieres and previews",
    venue: "BFI Southbank and venues across London",
    startsOn: "", endsOn: "",
    recurring: "annual", typicalWhen: "Two weeks in October",
    hood: "South Bank", borough: "Lambeth", areaGuide: "south-bank-area-guide",
    address: "Belvedere Road",
    agePolicy: "all-ages", duration: "A film, or a fortnight",
    bookingRequired: "required", indoorOutdoor: "indoor",
    stepFree: "yes",
    whyGo: "Around three hundred films over a fortnight, many of them months before general release, centred on BFI Southbank and spread across the city.",
    opSummary: "Public booking opens in September and the galas go first. Ordinary screenings stay available much longer and cost about the price of a normal cinema ticket.",
    goodFor: "solo, date, groups",
    lists: "events",
    source: "Annual calendar 2026-08-20. October annually, centred on BFI Southbank.",
  },
  {
    ...base, slug: "open-house-london",
    name: "Open House Festival",
    eventType: "festival", style: "Buildings normally closed, open free for a weekend",
    venue: "Across London",
    startsOn: "", endsOn: "",
    recurring: "annual", typicalWhen: "A weekend in September",
    hood: "City of London", borough: "City of London", areaGuide: "",
    address: "Across London",
    agePolicy: "all-ages", duration: "A weekend",
    pricePerPerson: "Free",
    bookingRequired: "recommended", indoorOutdoor: "both",
    whyGo: "Several hundred buildings that are shut for the rest of the year open their doors for free - private houses, livery halls, tunnels, towers and government buildings.",
    opSummary: "FREE, but the good ones are balloted or need booking the moment listings go live in August. Plenty are first-come, and the queues start early.",
    goodFor: "solo, groups, date",
    lists: "events, free",
    source: "Annual calendar 2026-08-20; programme.openhouse.org.uk, which surfaced repeatedly during the City activities pass.",
  },
  {
    ...base, slug: "frieze-london",
    name: "Frieze London",
    eventType: "festival", style: "Contemporary art fair in Regent's Park",
    venue: "Regent's Park",
    startsOn: "", endsOn: "",
    recurring: "annual", typicalWhen: "Four days in October",
    hood: "Marylebone", borough: "Westminster", areaGuide: "marylebone-area-guide",
    address: "Regent's Park, NW1",
    agePolicy: "all-ages", duration: "A full day",
    bookingRequired: "required", indoorOutdoor: "indoor",
    stepFree: "yes",
    whyGo: "One of the biggest contemporary art fairs in the world, in a temporary structure in Regent's Park, with Frieze Masters and a free sculpture park alongside it.",
    opSummary: "The fairs are ticketed and expensive; THE SCULPTURE PARK IN THE ENGLISH GARDENS IS FREE and open to anyone walking through the park.",
    goodFor: "solo, date, groups",
    lists: "events",
    source: "Annual calendar 2026-08-20. The free sculpture park is the part worth knowing about.",
  },
  {
    ...base, slug: "diwali-trafalgar-square",
    name: "Diwali on the Square",
    eventType: "festival", style: "Free Diwali celebration in Trafalgar Square",
    venue: "Trafalgar Square",
    startsOn: "", endsOn: "",
    recurring: "annual", typicalWhen: "A Sunday in October or November",
    hood: "Westminster", borough: "Westminster", areaGuide: "westminster-area-guide",
    address: "Trafalgar Square, WC2N",
    agePolicy: "all-ages", duration: "An afternoon",
    pricePerPerson: "Free",
    bookingRequired: "walk-in", indoorOutdoor: "outdoor",
    stepFree: "yes",
    whyGo: "Free dance, music and food in Trafalgar Square for one of the largest Diwali celebrations outside India, run by the Mayor's office.",
    opSummary: "Free and unticketed. The date follows the lunar calendar and the nearest convenient Sunday, so it shifts between October and November.",
    goodFor: "families, groups, solo",
    lists: "events, free",
    source: "Annual calendar 2026-08-20.",
  },
  {
    ...base, slug: "wimbledon-championships",
    name: "The Championships, Wimbledon",
    eventType: "festival", style: "The grass-court Grand Slam",
    venue: "All England Club, SW19",
    startsOn: "", endsOn: "",
    recurring: "annual", typicalWhen: "Two weeks from late June",
    hood: "Richmond", borough: "Richmond upon Thames", areaGuide: "",
    address: "Church Road, Wimbledon SW19",
    agePolicy: "all-ages", duration: "A full day",
    bookingRequired: "required", indoorOutdoor: "outdoor",
    stepFree: "partial",
    whyGo: "The oldest tennis tournament in the world, and the only Grand Slam still played on grass.",
    opSummary: "Main tickets come through a public BALLOT months ahead. The QUEUE is the alternative - camping overnight for grounds passes, and a genuine London institution in itself.",
    goodFor: "groups, families, date",
    lists: "events",
    source: "Annual calendar 2026-08-20. Filed to Richmond as the nearest guide - SW19 has no guide of its own, so this is a stretch and should move if a Wimbledon guide is ever written.",
  },
  {
    ...base, slug: "bonfire-night-london",
    name: "Bonfire Night Fireworks",
    eventType: "seasonal", style: "Firework displays across the city",
    venue: "Parks across London",
    startsOn: "", endsOn: "",
    recurring: "annual", typicalWhen: "The weekend nearest 5 November",
    hood: "Hackney", borough: "Hackney", areaGuide: "",
    address: "Victoria Park and parks across London",
    agePolicy: "all-ages", duration: "An evening",
    pricePerPerson: "Free to ticketed depending on the park",
    bookingRequired: "recommended", indoorOutdoor: "outdoor",
    whyGo: "Borough displays in the big parks - Victoria Park is among the largest - on the weekend nearest the fifth of November.",
    opSummary: "Some borough displays are free and some now ticket to control numbers; it varies by park and changes year to year. Check the borough rather than assuming.",
    goodFor: "families, groups",
    lists: "events",
    source: "Annual calendar 2026-08-20. Deliberately vague on price because it genuinely varies by borough and year.",
  },

  // ===================== LOCAL FETES PASS =====================
  // User-requested: small, free, local-scale festivals - the shape of thing that
  // sits well below Carnival or the Marathon but is still worth a day trip if a
  // visitor's dates line up. Checked against all five site sheets - clean.
  {
    ...base, slug: "greenwich-fair",
    name: "Greenwich Fair",
    eventType: "festival", style: "Free street theatre, circus and family entertainment",
    venue: "General Wolfe Piazza, Greenwich Park",
    startsOn: "2026-08-22", endsOn: "2026-08-23",
    recurring: "annual", typicalWhen: "August bank holiday weekend, as part of the Greenwich+Docklands International Festival",
    hood: "Greenwich", borough: "Greenwich", areaGuide: "greenwich-area-guide",
    address: "General Wolfe Piazza, Observatory Hill, Greenwich Park", postcode: "SE10 8XJ",
    agePolicy: "family-friendly", duration: "An afternoon",
    pricePerPerson: "Free",
    bookingRequired: "walk-in", indoorOutdoor: "outdoor",
    stepFree: "partial",
    whyGo: "Two free afternoons of street theatre, circus, puppetry and acrobatics at the top of Greenwich Park - the closing weekend of GDIF, and small enough to still feel like a local fete rather than a festival.",
    opSummary: "No booking - just turn up. A level access route runs from the Blackheath Gate (about 15 minutes); the step-free route from St Mary's Gate is uphill and takes 10-15 minutes.",
    goodFor: "families, groups, solo",
    lists: "events, free",
    source: "royalgreenwich.gov.uk and festival.org (GDIF's own site) cross-checked",
  },
  {
    ...base, slug: "north-end-road-summer-festival",
    name: "North End Road Summer Festival",
    eventType: "festival", style: "Traffic-free street festival on a Victorian market street",
    venue: "North End Road",
    startsOn: "2026-07-12", endsOn: "2026-07-12",
    recurring: "annual", typicalWhen: "A Saturday in July",
    hood: "Fulham", borough: "Hammersmith and Fulham", areaGuide: "",
    address: "North End Road",
    agePolicy: "family-friendly", duration: "A day",
    pricePerPerson: "Free",
    bookingRequired: "walk-in", indoorOutdoor: "outdoor",
    whyGo: "North End Road's market has traded six days a week since the 1880s; once a year the council closes it to traffic and adds 150-plus stalls, live music, street entertainers and free kids' workshops on top of the regular fruit-and-veg traders.",
    opSummary: "10am-6pm, free, no booking. Award-winning as a community market (Best Community/Parish Market, Great British Market Awards 2019) - genuinely council-run rather than a private promotion.",
    goodFor: "families, groups, solo",
    lists: "events, free",
    source: "lbhf.gov.uk (council's own event pages, 2023-2025 recurrences) cross-checked",
  },

  // ===================== KING'S CROSS + WEMBLEY =====================
  // From kingscross.co.uk/whats-on, taking only what RECURS. That page is
  // mostly summer pop-ups running two or three weeks; entered with their
  // literal dates they would have expired before anyone read them. Summer
  // Sounds and the Classic Car Boot Sale are annual fixtures, so they go in
  // as recurring with Typical When - the same treatment as Notting Hill
  // Carnival, and the reason the export keeps them between editions.
  {
    ...base, slug: "kings-cross-summer-sounds",
    name: "Summer Sounds",
    eventType: "festival", style: "Free open-air live music",
    venue: "Granary Square, King's Cross",
    startsOn: "", endsOn: "",
    recurring: "annual", typicalWhen: "Mid-to-late August, over about ten days",
    hood: "King's Cross", borough: "Camden", areaGuide: "kings-cross-area-guide",
    address: "Granary Square", postcode: "N1C 4AB",
    agePolicy: "all-ages", duration: "An evening",
    pricePerPerson: "Free",
    bookingRequired: "walk-in", indoorOutdoor: "outdoor",
    stepFree: "yes",
    whyGo: "Ten days of free live music outdoors by the fountains at Granary Square - no ticket, no booking, and one of the better free things London puts on in August.",
    opSummary: "Free and unticketed, so it gets busy at the front. The canal steps behind the square are the sensible place to sit. Dates shift slightly each year.",
    goodFor: "families, groups, date",
    lists: "events, free",
    source: "kingscross.co.uk what's on, described there as the annual festival returning.",
  },
  {
    ...base, slug: "classic-car-boot-sale-kings-cross",
    name: "The Classic Car Boot Sale",
    eventType: "festival", style: "Vintage traders, classic cars and street food",
    venue: "Granary Square, Lewis Cubitt Square and Coal Drops Yard",
    startsOn: "", endsOn: "",
    recurring: "annual", typicalWhen: "Twice a year - a spring edition around April and an autumn one in September",
    hood: "King's Cross", borough: "Camden", areaGuide: "kings-cross-area-guide",
    address: "Granary Square and Lewis Cubitt Square", postcode: "N1C 4AB",
    agePolicy: "all-ages", duration: "A day",
    pricePerPerson: "Free to browse",
    bookingRequired: "walk-in", indoorOutdoor: "outdoor",
    stepFree: "yes",
    whyGo: "Over a hundred vintage traders and seventy-odd classic cars spread across three King's Cross squares, plus the UK's largest open-air Charity Super.Mkt. It passed its tenth year at King's Cross in 2025.",
    opSummary: "Runs 10am to 6pm across two days, and happens TWICE a year rather than once - check which edition is next before planning around it.",
    goodFor: "families, groups, solo",
    lists: "events, free",
    source: "kingscross.co.uk and hemingwaydesign.co.uk (the organisers) cross-checked.",
  },
  {
    ...base, slug: "mundo-pixar-wembley",
    name: "Mundo Pixar Experience",
    eventType: "exhibition", style: "Walk-through recreations of fourteen Pixar films",
    venue: "Wembley Park",
    startsOn: "2026-02-13", endsOn: "2026-11-01",
    recurring: "", typicalWhen: "",
    hood: "Wembley", borough: "Brent", areaGuide: "",
    address: "Fulton Road, Wembley Park", postcode: "HA9 0TF",
    agePolicy: "family-friendly", duration: "About 90 minutes",
    pricePerPerson: "Varies; family tickets available",
    bookingRequired: "required", indoorOutdoor: "indoor",
    stepFree: "yes",
    whyGo: "Fourteen Pixar worlds rebuilt at full size across 3,500 square metres - Andy's room from Toy Story at toy scale, the Monsters, Inc. scare floor, Flo's café from Cars. The London run has a room built for it that no other city got.",
    opSummary: "Closes 1 November 2026 and the organisers say it does not return afterwards. Wembley Park station, then a short walk past the stadium.",
    goodFor: "families, groups",
    lists: "events",
    source: "thewaltdisneycompany.eu and wembleypark.com cross-checked.",
  },
];

// ------------------------------------------------- merge geocoding cache ---
// data/geo-cache.json is produced by scripts/geocode-listings.mjs. Merging
// here rather than writing to the sheet directly means this script stays the
// single owner of the tab, and the Places lookups survive every rebuild.
// Hand-written values win, matching write-restaurants-v2.mjs's enrichment merge.
const GEO_PATH = "data/geo-cache.json";
const GEO_MAP = { postcode: "postcode", lat: "lat", lng: "lng", placeId: "placeId" };
let geocoded = 0;
if (fs.existsSync(GEO_PATH)) {
  const cache = JSON.parse(fs.readFileSync(GEO_PATH, "utf8"));
  for (const r of ROWS) {
    const e = cache[`events:${r.slug}`];
    if (!e) continue;
    for (const [col, key] of Object.entries(GEO_MAP)) {
      const v = e[key];
      if (v === undefined || v === "" || v === null) continue;
      if (String(r[col] ?? "").trim() !== "") continue;
      r[col] = String(v);
      geocoded++;
    }
  }
}

// --------------------------------------------------------------- validate ---
const errors = [];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
for (const r of ROWS) {
  for (const [field, allowed] of Object.entries(VOCAB)) {
    const v = String(r[field] ?? "");
    if (v === "") continue;
    if (!allowed.includes(v))
      errors.push(`${r.slug}: ${field} = "${v}" is not in [${allowed.filter(Boolean).join(", ")}]`);
  }
  if (r.hood && !HOODS[r.hood]) errors.push(`${r.slug}: neighbourhood "${r.hood}" is not in HOODS`);
  for (const f of ["startsOn", "endsOn"]) {
    const v = String(r[f] ?? "");
    if (v && !ISO.test(v)) errors.push(`${r.slug}: ${f} = "${v}" is not YYYY-MM-DD`);
  }
  if (r.startsOn && r.endsOn && r.endsOn < r.startsOn)
    errors.push(`${r.slug}: ends before it starts`);

  // ANNUAL events are the exception to everything below. The London Marathon
  // ran on 26 April 2026 and will run again next spring; a row that expires in
  // April is worse than useless. They must carry Typical When, which is the
  // fact that stays true, and they are never dropped by the export.
  if (r.recurring === "annual") {
    if (!r.typicalWhen)
      errors.push(`${r.slug}: recurring annual events must have a Typical When ("August bank holiday weekend") - exact dates go stale, that does not`);
  } else if (!r.startsOn && !r.endsOn) {
    // A one-off with neither date is an activity that wandered into this tab.
    errors.push(`${r.slug}: has no start and no end date - if it runs indefinitely it belongs in Activities`);
  }
}
if (errors.length) {
  console.error(`${errors.length} error(s):`);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
for (const r of ROWS) {
  const h = HOODS[r.hood];
  if (h) { r.zone ??= h.zone; r.district ??= h.district; }
}
const seen = new Set();
for (const r of ROWS) {
  if (seen.has(r.slug)) { console.error(`duplicate slug: ${r.slug}`); process.exit(1); }
  seen.add(r.slug);
}

const header = COLUMNS.map((c) => c.head);
const rows = ROWS.map((r) => COLUMNS.map((c) => String(r[c.key] ?? "")));

const dryRun = process.argv.includes("--dry-run");
if (!dryRun) await writeTab("Events", header, rows);
else console.log("DRY RUN - nothing written to the sheet");

console.log(`${rows.length} rows x ${header.length} columns for "Events"`);

// Reports. The point of this tab is that time passes, so say what time has done.
// An annual event whose edition has passed is NOT ended - it comes round again,
// and the export keeps it and falls back to Typical When. Only one-offs end.
const ended = ROWS.filter((r) => r.endsOn && r.endsOn < TODAY && r.recurring !== "annual");
const betweenEditions = ROWS.filter((r) => r.endsOn && r.endsOn < TODAY && r.recurring === "annual");
const soon = ROWS.filter((r) => r.endsOn && r.endsOn >= TODAY && r.endsOn <= addDays(TODAY, 30));
const future = ROWS.filter((r) => r.startsOn && r.startsOn > TODAY);
function addDays(iso, n) {
  const d = new Date(iso); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
console.log(`  ${ROWS.length - ended.length} currently publishable, ${ended.length} already ended`);
if (ended.length) console.log(`  ENDED (export will drop these): ${ended.map((r) => r.name).join(", ")}`);
if (betweenEditions.length) console.log(`  BETWEEN EDITIONS (kept, shown as Typical When): ${betweenEditions.map((r) => `${r.name} - ${r.typicalWhen}`).join("; ")}`);
if (soon.length) console.log(`  ENDING WITHIN 30 DAYS - recheck before relying on: ${soon.map((r) => `${r.name} (${r.endsOn})`).join(", ")}`);
if (future.length) console.log(`  NOT OPEN YET: ${future.map((r) => `${r.name} (${r.startsOn})`).join(", ")}`);
const unverified = ROWS.filter((r) => /NEEDS VERIFYING/.test(r.source));
console.log(`  ${unverified.length} row(s) are single-source and need verifying`);
const withCoords = ROWS.filter((r) => r.lat).length;
console.log(`  ${withCoords}/${ROWS.length} rows have coordinates (${geocoded} field(s) merged from data/geo-cache.json this run)`);
