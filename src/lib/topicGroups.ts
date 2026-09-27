// Subheadings for the long topic/section pages (src/pages/topics/[category].astro).
// A category only groups once it has enough guides that a flat list gets
// unwieldy (GROUPING_THRESHOLD) - short sections stay a single list.
//
// Groups are derived from each article's tags rather than a hand-kept slug
// list, so a new guide in an existing category falls into a group on its own
// merit instead of silently landing in "More" until someone remembers to add
// it. The classification rules below were checked against every article in
// each category when they were written (27 Sep 2026) - see the per-category
// counts in the handoff for that pass. Anything a rule does not claim goes in
// "More", which is why it is always last.

export interface ArticleForGrouping {
  id: string;
  data: { tags: string[] };
}

type Rule<T extends ArticleForGrouping> = { group: string; test: (article: T) => boolean };

const norm = (s: string) => s.toLowerCase();

// Tags only, never the title - a title's own words ("...Tickets", "...and 4
// Festivals") false-matched keywords that were only ever meant to catch a
// tag like "tickets" or "festival".
const hasTag = <T extends ArticleForGrouping>(article: T, ...needles: string[]) => {
  const tags = article.data.tags.map(norm);
  return needles.some((needle) => tags.some((tag) => tag.includes(norm(needle))));
};

function thingsToDoRules<T extends ArticleForGrouping>(): Rule<T>[] {
  return [
    {
      group: "Seasonal and events",
      test: (a) =>
        hasTag(
          a,
          "christmas", "halloween", "bonfire night", "new year", "winter wonderland",
          "festival", "jazz", "music festivals", "autumn", "seasonal", "comic con",
          "hyper japan", "home and garden", "exhibitions", "conventions",
        ) || /^things-to-do-in-london-in-/.test(a.id),
    },
    {
      group: "Sport and big venues",
      test: (a) =>
        hasTag(
          a,
          "football", "tennis", "rugby", "running", "nfl", "premier league",
          "wimbledon", "marathon", "athletics", "stadium", "boxing", "ufc",
        ),
    },
    { group: "Walks", test: (a) => hasTag(a, "walks", "walking tours", "walking") },
    { group: "Day trips", test: (a) => hasTag(a, "days out", "day trips") },
    {
      group: "Attractions and museums",
      test: (a) =>
        hasTag(
          a,
          "museums", "galleries", "attractions", "historic sights", "historic houses",
          "parks", "gardens", "views", "viewpoints", "markets", "blue plaques",
          "street art", "filming locations", "palaces", "churches",
        ),
    },
    {
      group: "Shows and nights out",
      test: (a) =>
        hasTag(
          a,
          "theatre", "cinema", "comedy", "cabaret", "nightlife", "nights out",
          "live music", "music venues", "casinos", "evening plans", "immersive theatre",
        ),
    },
  ];
}

// A handful of food guides carry a generic "restaurants" tag alongside a
// deal- or timing-led angle ("cheap eats", "late night") - without this list
// they would read as just another cuisine, which is not the point of them.
const FOOD_EXCLUDE_FROM_CUISINE = new Set([
  "eat-in-london-guide",
  "cheap-eats-london",
  "late-night-eating-london",
  "christmas-day-restaurants-london",
]);

function foodAndDrinkRules<T extends ArticleForGrouping>(): Rule<T>[] {
  return [
    {
      group: "Cafés and sweet things",
      test: (a) =>
        hasTag(
          a,
          "bakeries", "pastries", "coffee", "cafes", "chocolate", "ice cream",
          "gelato", "dessert", "bubble tea", "breakfast", "brunch", "afternoon tea",
        ),
    },
    {
      group: "Pubs and bars",
      test: (a) =>
        hasTag(a, "pubs", "gastropubs", "beer", "craft beer", "real ale", "cocktail bars", "bars", "wine", "sunday roast"),
    },
    {
      group: "Restaurants by cuisine",
      test: (a) =>
        !FOOD_EXCLUDE_FROM_CUISINE.has(a.id) &&
        hasTag(a, "restaurants") &&
        !hasTag(a, "unusual", "special occasion", "rooftop", "riverside", "outdoor dining", "design", "photography"),
    },
    {
      group: "Cheap eats and deals",
      test: (a) =>
        hasTag(
          a,
          "cheap eats", "cheap-eats", "budget travel", "restaurant deals", "discount cards",
          "money saving", "kids eat free", "street food", "sandwiches", "first table", "eatclub",
        ),
    },
  ];
}

const STAY_HOTEL_TYPE_SLUGS = new Set([
  "aparthotels-london",
  "day-rooms-london",
  "pod-hotels-london",
  "windowless-hotel-rooms-london",
]);

function stayRules<T extends ArticleForGrouping>(): Rule<T>[] {
  return [
    {
      group: "Hotel types",
      test: (a) =>
        hasTag(a, "budget", "family", "hostels", "solo travel", "dog-friendly", "pets") ||
        STAY_HOTEL_TYPE_SLUGS.has(a.id),
    },
    { group: "Areas", test: (a) => /^where-to-stay-/.test(a.id) || a.id === "best-areas-to-stay-in-london" },
  ];
}

export function categoryGroupRules<T extends ArticleForGrouping>(category: string): Rule<T>[] | null {
  switch (category) {
    case "Things to do":
      return thingsToDoRules<T>();
    case "Food and drink":
      return foodAndDrinkRules<T>();
    case "Stay":
      return stayRules<T>();
    default:
      return null;
  }
}

// Render order for each category's groups - "More" is appended after these
// automatically, never listed here.
export const CATEGORY_GROUP_ORDER: Record<string, string[]> = {
  "Things to do": ["Seasonal and events", "Attractions and museums", "Walks", "Shows and nights out", "Day trips", "Sport and big venues"],
  "Food and drink": ["Restaurants by cuisine", "Pubs and bars", "Cheap eats and deals", "Cafés and sweet things"],
  "Stay": ["Areas", "Hotel types"],
};

// Long section pages only - a dozen cards under one heading needs no
// subdivision, and a thin single-item group would look like a mistake.
export const GROUPING_THRESHOLD = 15;

export const MORE_GROUP = "More";

// Where the tags put a guide in the wrong group. Slug -> group name.
const GROUP_OVERRIDES: Record<string, string> = {
  "science-events-london": "Seasonal and events",
  "bridgerton-london": "Attractions and museums",
};

// Splits already-sorted articles into named groups, preserving each group's
// incoming order (so sort by score first, then group). Returns null when the
// category has no rules of its own, or isn't long enough to bother.
export function groupArticles<T extends ArticleForGrouping>(
  category: string,
  articles: T[],
): Map<string, T[]> | null {
  const rules = categoryGroupRules<T>(category);
  if (!rules || articles.length <= GROUPING_THRESHOLD) return null;

  const order = CATEGORY_GROUP_ORDER[category] ?? [];
  const buckets = new Map<string, T[]>();
  for (const name of order) buckets.set(name, []);
  buckets.set(MORE_GROUP, []);

  for (const article of articles) {
    const rule = rules.find((r) => r.test(article));
    const group = GROUP_OVERRIDES[article.id] ?? rule?.group ?? MORE_GROUP;
    if (!buckets.has(group)) buckets.set(group, []);
    buckets.get(group)!.push(article);
  }

  for (const [name, items] of [...buckets]) {
    if (items.length === 0) buckets.delete(name);
  }
  return buckets;
}
