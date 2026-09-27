// Folds the public exhibitions and conventions from events.json into the
// What's On listings, at build time.
//
// events.json otherwise only surfaces through AreaEvents on an area guide
// with a matching `area:` frontmatter - and ExCeL, Olympia and Alexandra
// Palace have none, so almost none of these ever showed anywhere. This never
// writes back to listings.json: that file is regenerated daily by
// scripts/listings/export-site.mjs (a GitHub Action) and would lose these
// rows on the next run. Both the What's On page and its JSON endpoint call
// this on the same base data, so the merged result - and its cache stamp -
// stay identical.
import type { Listings, Row, Venue } from "./whats-on";
import eventsData from "../data/events.json";

type ExpoEvent = {
  slug: string; name: string; type: string; venue: string;
  startsOn?: string; endsOn?: string; price?: string; zone?: string;
  guide?: string;
};

// ExCeL and Olympia each have two stations; this names the one nearest the
// halls these shows actually use. Alexandra Palace, Battersea Park and
// Somerset House already have a single obvious one.
const STATION: Record<string, string> = {
  "ExCeL London": "Custom House",
  "Olympia London": "Kensington (Olympia)",
  "Alexandra Palace": "Alexandra Palace",
  "Battersea Park": "Battersea Park",
  "Somerset House": "Temple",
};

// A show with its own guide links there; everything else falls back to the
// hub, which covers the whole calendar and links on to each organiser.
const OWN_PAGE: Record<string, string> = {
  "mcm-comic-con-london-oct": "/articles/mcm-comic-con-london/",
  "ideal-home-show": "/articles/ideal-home-show-london/",
};
const HUB = "/articles/exhibitions-conventions-london/";

// "Olympia London (The Grand Hall)" -> "Olympia London", so the three halls
// share one row in the venues table instead of fragmenting it (and Alexandra
// Palace's own hall variants land on the entry the daily listings already use).
const baseVenueName = (v: string) => v.replace(/\s+\([^)]*\)\s*$/, "").trim();

// The 31 public exhibitions and conventions: every exhibition-convention row,
// plus the handful of seasonal and sporting-event rows that are really the
// same thing (Olympia's Christmas fairs, ExCeL's Christmas shows, the London
// International Horse Show) and have no area guide of their own to surface
// them either.
function isConventionShow(e: ExpoEvent) {
  if (e.type === "exhibition-convention") return true;
  return (e.type === "seasonal" || e.type === "sporting-event") &&
    !e.guide && /^(ExCeL London|Olympia London)\b/.test(e.venue || "");
}

// "£45-49 day pass; £75-85 weekend" -> [45, 85]. "Ticketed - check current
// price" has no figure, so both come back null. A single figure written with
// "from" keeps its floor and leaves the top open, matching how the rest of
// the site's from-prices behave.
export function parsePrice(text?: string): [number | null, number | null] {
  if (!text) return [null, null];
  const nums: number[] = [];
  const re = /£\s?(\d+(?:\.\d{1,2})?)(?:\s?-\s?(\d+(?:\.\d{1,2})?))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    nums.push(parseFloat(m[1]));
    if (m[2]) nums.push(parseFloat(m[2]));
  }
  if (!nums.length) return /free/i.test(text) ? [0, 0] : [null, null];
  const lo = Math.min(...nums), hi = Math.max(...nums);
  if (nums.length === 1 && /from|onwards/i.test(text)) return [lo, null];
  return [lo, hi];
}

/** A copy of `base` with the exhibitions and conventions folded in as their
 *  own category - `base` itself (the imported JSON module) is never mutated,
 *  so a second call in the same build sees the same starting point. */
export function withExhibitions(base: Listings): Listings {
  const cats = [...base.cats];
  const catIdx = new Map(cats.map((c, i) => [c, i]));
  const venues: Venue[] = base.venues.map((v) => [...v] as Venue);
  const venueIdx = new Map(venues.map((v, i) => [v[0], i]));
  function venueIndex(name: string, zone: string, station: string): number {
    if (!venueIdx.has(name)) { venueIdx.set(name, venues.length); venues.push([name, zone, station]); }
    return venueIdx.get(name)!;
  }
  // Every merged row is the same one category, added once.
  if (!catIdx.has("expo")) { catIdx.set("expo", cats.length); cats.push("expo"); }
  const cIdx = catIdx.get("expo")!;

  const rows: Row[] = [];
  for (const e of eventsData.events as ExpoEvent[]) {
    if (!isConventionShow(e) || !e.startsOn) continue;
    const start = e.startsOn;
    const end = e.endsOn || e.startsOn;
    const venueName = baseVenueName(e.venue);
    const vIdx = venueIndex(venueName, e.zone ?? "", STATION[venueName] ?? "");
    const [priceFrom, priceTo] = parsePrice(e.price);
    rows.push([
      start,                                    // 0 date
      "",                                       // 1 time - these run all day
      e.name,                                   // 2 title
      cIdx,                                     // 3 category
      vIdx,                                     // 4 venue
      priceFrom,                                // 5
      priceTo,                                  // 6
      "",                                       // 7 onSaleFrom - always on general sale
      0,                                         // 8 availability
      end !== start ? `${start} to ${end}` : "", // 9 run - a whole run, like a museum exhibition
      OWN_PAGE[e.slug] ?? HUB,                  // 10 url
      "Our guide",                              // 11 linkLabel
      base.generated,                           // 12 firstSeen
      "",                                       // 13 access
      "",                                       // 14 presales
    ]);
  }

  return { ...base, cats, venues, rows: [...base.rows, ...rows], count: base.count + rows.length };
}
