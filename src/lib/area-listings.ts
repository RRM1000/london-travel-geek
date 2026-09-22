// Picks the listings for an area guide's "Coming up near X" strip. Shared by
// the component and by ArticleLayout, which needs to know whether the strip
// will render before it adds the heading to the table of contents.
import { addDays, upcoming, type Listings, type Placed } from "./whats-on";

const DAYS = 14;
const MAX = 10;
const PER_VENUE = 3;

// TfL names and the guides' names differ in small ways: "Hammersmith (Dist&Picc
// Line)", "King's Cross St. Pancras", "St Paul's" / "St. Paul's".
const norm = (s: string) =>
  s.toLowerCase().replace(/\(.*?\)/g, "").replace(/&/g, "and").replace(/\bst\.?\b/g, "st").replace(/[^a-z0-9]+/g, " ").trim();

export function areaListings(data: Listings, stations: string[]): Placed[] {
  const want = new Set(stations.map(norm));
  const venues = new Set(data.venues.flatMap((v, i) => (want.has(norm(v[2])) ? [i] : [])));
  if (!venues.size) return [];

  const from = data.generated;
  const soon = upcoming(data.rows.filter((r) => venues.has(r[4])), from, addDays(from, DAYS - 1));

  // The next performance of each show, then no more than three per venue, so
  // Soho Theatre's twenty shows a night do not crowd out the rest of Soho.
  const shows = new Set<string>();
  const perVenue = new Map<number, number>();
  const out: Placed[] = [];
  for (const p of soon) {
    const show = `${p.r[4]}|${p.r[2].toLowerCase()}`;
    if (shows.has(show)) continue;
    const n = perVenue.get(p.r[4]) ?? 0;
    if (n >= PER_VENUE) continue;
    shows.add(show);
    perVenue.set(p.r[4], n + 1);
    out.push(p);
    if (out.length >= MAX) break;
  }
  return out;
}
