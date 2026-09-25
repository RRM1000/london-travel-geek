export const categoryToSlug = (category: string) =>
  category
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export const categoryHref = (category: string) =>
  `/topics/${categoryToSlug(category)}/`;

export const tagToSlug = (tag: string) =>
  tag
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export const tagHref = (tag: string) => `/tags/${tagToSlug(tag)}/`;

// A tag gets its own page only when this many published guides carry it. Below
// that the page is one or two cards under a heading: thin to Google, and it
// reads like a guide in a browser tab ("All Points East guides") when it isn't.
export const MIN_TAG_GUIDES = 3;

// Guides per tag, keyed by slug so "Soho" and "soho" count as one tag.
export const countTags = (articles: { data: { tags: string[] } }[]) => {
  const counts = new Map<string, number>();
  for (const article of articles) {
    for (const slug of new Set(article.data.tags.map(tagToSlug))) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }
  return counts;
};

const tagDisplayOverrides: Record<string, string> = {
  eSIM: "eSIM",
  "Wi-Fi": "Wi-Fi",
  "Wi‑Fi": "Wi‑Fi",
};

export const formatTag = (tag: string) =>
  tagDisplayOverrides[tag] ??
  `${tag.charAt(0).toLocaleUpperCase("en-GB")}${tag.slice(1)}`;
