import data from "../data/restaurants.json";

export type Restaurant = {
  slug: string;
  name: string;
  cuisine?: string;
  style?: string;
  specialities?: string[];
  format?: string;
  chainType?: string;
  /** "yes" when the row is a reliable standby rather than a destination. */
  fallback?: string;
  context?: string;
  area?: string;
  zone?: string;
  district?: string;
  borough?: string;
  guide?: string;
  address?: string;
  postcode?: string;
  lat?: number;
  lng?: number;
  station?: string;
  walkMin?: number;
  price?: string;
  deals?: string[];
  /** Price, days and times in prose. A deal tag alone is not publishable. */
  dealDetail?: string;
  /** ISO date a human last read these terms off the venue's own site. */
  dealChecked?: string;
  /** The exact page or PDF the terms were read from. */
  dealSource?: string;
  booking?: string;
  bookingUrl?: string;
  website?: string;
  setting?: string;
  outdoor?: string;
  noise?: string;
  goodFor?: string[];
  dietary?: string;
  whyGo?: string;
  signature?: string;
  opNote?: string;
  signals?: string;
  lists?: string[];
  /** Chapter deep link into a published food video that visits this venue. */
  video?: string;
};

export type Facet = { value: string; slug: string; count: number };

export const restaurants = data.restaurants as Restaurant[];
export const facets = data.facets as {
  cuisine: Facet[];
  area: Facet[];
  speciality: Facet[];
  price: Facet[];
};
export const generated = data.generated as string;
export const withCoords = data.withCoords as number;

export const slugify = (t: string) =>
  t.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Only facet values with enough rows get their own page. A route for a single
 * restaurant is a thin page that competes with the guide it came from, which is
 * the opposite of what these routes are for.
 */
export const MIN_ROWS_FOR_ROUTE = 4;

export type FilterRoute = {
  kind: "cuisine" | "area" | "speciality";
  slug: string;
  value: string;
  count: number;
};

export function filterRoutes(): FilterRoute[] {
  const out: FilterRoute[] = [];
  for (const kind of ["cuisine", "area", "speciality"] as const) {
    for (const f of facets[kind]) {
      // Area routes are exempt from the minimum: a guide must always have a
      // page to link to, even a thin one. Cuisine and speciality still need the
      // threshold, or we ship near-empty pages that compete with the guides.
      if (kind !== "area" && f.count < MIN_ROWS_FOR_ROUTE) continue;
      out.push({ kind, slug: f.slug, value: f.value, count: f.count });
    }
  }
  return out;
}

export function matches(r: Restaurant, route: FilterRoute): boolean {
  if (route.kind === "cuisine") return slugify(r.cuisine ?? "") === route.slug;
  // Matches on the AREA GUIDE. Neighbourhood is too granular to deep-link
  // from a guide: Canary Wharf's three rows sit under two neighbourhoods, so a
  // neighbourhood-keyed route left the guide with nowhere to point.
  if (route.kind === "area") return (r.guide ?? "").replace(/-area-guide$/, "") === route.slug;
  return (r.specialities ?? []).some((s) => slugify(s) === route.slug);
}

/**
 * Destinations first, fallbacks last. A standby should never be the first thing
 * a reader sees on a page about where to eat - see fallbackRule in the playbook.
 */
export function sortForDisplay(list: Restaurant[]): Restaurant[] {
  return [...list].sort((a, b) => {
    const fa = a.fallback === "yes" ? 1 : 0;
    const fb = b.fallback === "yes" ? 1 : 0;
    if (fa !== fb) return fa - fb;
    return a.name.localeCompare(b.name);
  });
}
