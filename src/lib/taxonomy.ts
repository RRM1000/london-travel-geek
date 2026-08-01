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

const tagDisplayOverrides: Record<string, string> = {
  eSIM: "eSIM",
  "Wi-Fi": "Wi-Fi",
  "Wi‑Fi": "Wi‑Fi",
};

export const formatTag = (tag: string) =>
  tagDisplayOverrides[tag] ??
  `${tag.charAt(0).toLocaleUpperCase("en-GB")}${tag.slice(1)}`;
