// The search index, built once at build time and served as a static file.
//
// WHY AN ENDPOINT AND NOT DATA EMBEDDED IN /search
// The index covers guides, restaurants and activities - roughly nine hundred
// records. Inlining that into the page would make every visit to /search carry
// the payload before anything renders. As a separate file the browser caches it,
// and the page shell paints immediately.
//
// The header search box used to submit to /guides/, which never read the query
// at all: /guides/, /guides/?q=soho and /guides/?q=nonsense returned byte-identical
// HTML. This is a static site, so a GET parameter can never filter server-side -
// the work has to happen either at build time or in the browser. It happens here
// and in /search.
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { activeSite } from "../sites";
import restaurantData from "../data/restaurants.json";
import activityData from "../data/activities.json";
import eventData from "../data/events.json";
import hotelData from "../data/hotels.json";
import hiddenLondonData from "../data/hiddenLondon.json";

type Record = {
  /** g = guide, r = restaurant, a = activity, e = event, h = hotel, s = hidden London spot. Short because it repeats ~950 times. */
  t: "g" | "r" | "a" | "e" | "h" | "s";
  n: string;
  u: string;
  d?: string;
  /** Extra words to match on that are not shown: tags, cuisine, area. */
  k?: string;
};

export const GET: APIRoute = async () => {
  const records: Record[] = [];

  const articles = (await getCollection("articles")).filter(
    (a) => !a.data.draft && a.data.sites.includes(activeSite.id),
  );

  // slug -> the first article whose body links to that hotel. Without this a
  // hotel in an area with no guide (Wembley, say) had nowhere to point and the
  // result sent the reader to the front page.
  const hotelArticle = new Map<string, string>();
  for (const a of articles) {
    for (const m of a.body?.matchAll(/\]\(hotel:([a-z0-9-]+)\)/g) ?? []) {
      const slug = a.id.replace(/\.mdx?$/, "");
      const held = hotelArticle.get(m[1]);
      // First article wins, unless a later one is named after the place: the
      // Novotel is linked from both the citywide stay guide and the Wembley
      // guide, and somebody searching Wembley wants the Wembley one.
      if (!held) hotelArticle.set(m[1], slug);
      else if (!held.includes("area-guide") && slug.length < held.length) hotelArticle.set(m[1], slug);
    }
  }
  for (const a of articles) {
    records.push({
      t: "g",
      n: a.data.title,
      u: `/articles/${a.id}/`,
      d: a.data.description,
      k: [a.data.category, ...(a.data.tags ?? []), a.data.area?.name]
        .filter(Boolean)
        .join(" "),
    });
  }

  // Restaurants and activities have no page of their own - they live inside a
  // guide and on the filtered restaurant routes. Point at the area page, which
  // is where a reader can actually act on the result.
  for (const r of restaurantData.restaurants as any[]) {
    if (!r.name) continue;
    const area = r.guide ? String(r.guide).replace(/-area-guide$/, "") : null;
    records.push({
      t: "r",
      n: r.name,
      u: area ? `/restaurants/area/${area}` : "/restaurants",
      d: r.whyGo,
      k: [r.cuisine, r.area, r.style, ...(r.specialities ?? []), r.price]
        .filter(Boolean)
        .join(" "),
    });
  }

  for (const v of activityData.activities as any[]) {
    if (!v.name) continue;
    records.push({
      t: "a",
      n: v.name,
      u: v.guide ? `/articles/${v.guide}/#things-to-do` : "/topics/things-to-do/",
      d: v.whyGo,
      k: [v.type, v.area, v.style, v.price].filter(Boolean).join(" "),
    });
  }

  // Events are already filtered to live runs by export-events.mjs, so a finished
  // show cannot be searched for and then found to have closed.
  for (const e of eventData.events as any[]) {
    if (!e.name) continue;
    records.push({
      t: "e",
      n: e.name,
      u: e.guide ? `/articles/${e.guide}/#whats-on` : "/topics/things-to-do/",
      d: e.whyGo,
      k: [e.type, e.area, e.style, e.venue].filter(Boolean).join(" "),
    });
  }

  for (const h of hotelData.hotels as any[]) {
    if (!h.name) continue;
    // An article whose slug carries the hotel area beats a citywide guide.
    const areaSlug = String(h.area ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const areaMatch = areaSlug
      ? [...hotelArticle.entries()].find(([slug, art]) => slug === h.slug && art.includes(areaSlug))?.[1]
      : undefined;
    const featured = areaMatch ?? hotelArticle.get(h.slug);
    records.push({
      t: "h",
      n: h.name,
      u: h.guide
        ? `/articles/${h.guide}/#places-to-stay`
        : featured
          ? `/articles/${featured}/`
          : "/stay/",
      d: h.whyGo,
      k: [h.propertyType, h.area, h.style, h.priceBand].filter(Boolean).join(" "),
    });
  }

  for (const s of hiddenLondonData.spots as any[]) {
    if (!s.name) continue;
    records.push({
      t: "s",
      n: s.name,
      u: s.guide ? `/articles/${s.guide}/#hidden-london` : "/articles/hidden-london-secret-places/",
      d: s.whyGo,
      k: [s.type, s.subject, s.area].filter(Boolean).join(" "),
    });
  }

  // Cached hard and invalidated by the ?v= stamp that /search puts on the URL.
  //
  // This was max-age=3600 with no stamp, which meant anyone who had searched in
  // the last hour kept getting the previous deploy's index - caught in testing
  // when the page insisted there were zero guides while the file on disk had
  // fifty-one. The stamp changes whenever the data does, so a long max-age is
  // now safe and a stale index is not possible.
  return new Response(JSON.stringify({ n: records.length, records }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
};
