// Photos for spreadsheet-driven rows, matched by slug. No sheet column.
//
// WHY CONVENTION AND NOT A COLUMN
// A "Photo" column would be a second copy of a fact the repo already holds, and
// the two can drift: whoever edits the Google Sheet cannot see src/assets, so a
// typo or a renamed file becomes a broken image that only shows up in a browser.
// This is the same trap export-restaurant-map.mjs was built to avoid with
// coordinates - one place a fact is written down.
//
// So: drop a file at src/assets/sheet/<slug>.jpg and the row shows a photo.
// Remove it and the row renders exactly as it does today. A row can never point
// at a file that is not there, because nothing points at anything - the file
// either exists or it does not.
//
// REUSE IS THE POINT. Several of these photos already sit in an article body
// (seven-dials-market.jpg is in the Covent Garden guide AND is the natural card
// image for the seven-dials-market activity row). Rather than keep two copies,
// this also searches the per-article asset folders, so one file serves both.
//
// Coverage is reported by scripts/report-sheet-photos.mjs - run it to see which
// rows have a photo and which do not, since that is the one thing a convention
// hides that a column would have shown.
import { getImage } from "astro:assets";

// Eager: this runs at build time and the module graph must contain every
// candidate up front. A path that only exists as a string in JSON cannot be
// resolved by a dynamic import.
const DEDICATED = import.meta.glob<{ default: ImageMetadata }>(
  "/src/assets/sheet/*.{jpg,jpeg,png,webp,avif}",
  { eager: true },
);
const ARTICLE = import.meta.glob<{ default: ImageMetadata }>(
  "/src/assets/articles/**/*.{jpg,jpeg,png,webp,avif}",
  { eager: true },
);

/** slug -> ImageMetadata. Dedicated files win over an article's copy. */
const BY_SLUG = new Map<string, ImageMetadata>();
for (const [path, mod] of Object.entries(ARTICLE)) {
  const slug = path.split("/").pop()!.replace(/\.[^.]+$/, "");
  if (!BY_SLUG.has(slug)) BY_SLUG.set(slug, mod.default);
}
for (const [path, mod] of Object.entries(DEDICATED)) {
  BY_SLUG.set(path.split("/").pop()!.replace(/\.[^.]+$/, ""), mod.default);
}

export function hasSheetPhoto(slug: string): boolean {
  return BY_SLUG.has(slug);
}

export interface SheetPhoto {
  src: string;
  srcset?: string;
  sizes: string;
  width: number;
  height: number;
}

/**
 * Card-sized optimised photo for a row, or null when there is no file for it.
 * Callers must handle null - that is the normal case, not an error.
 */
export async function sheetPhoto(slug: string): Promise<SheetPhoto | null> {
  const found = BY_SLUG.get(slug);
  if (!found) return null;
  // `width` is set as well as `widths`, and deliberately. With `widths` alone
  // Astro builds a correct 320/640 srcset but leaves `src` pointing at the
  // FULL-SIZE original - a 553KB fallback behind a 14rem thumbnail, which is
  // what a browser without srcset support downloads, and what some preload
  // heuristics fetch regardless. Pinning `width` makes the fallback the 640
  // variant instead.
  const CARD_W = 640;
  const img = await getImage({
    src: found,
    format: "webp",
    width: CARD_W,
    widths: [320, CARD_W],
    sizes: "(min-width: 48rem) 14rem, 40vw",
  });
  // Intrinsic size of the variant actually served, so the aspect-ratio box the
  // browser reserves matches the file and the card does not shift on load.
  const height = Math.round((found.height / found.width) * CARD_W);
  return {
    src: img.src,
    srcset: img.srcSet?.attribute || undefined,
    sizes: "(min-width: 48rem) 14rem, 40vw",
    width: CARD_W,
    height,
  };
}

/** Resolve many at once, keyed by slug, skipping rows with no file. */
export async function sheetPhotos(slugs: string[]): Promise<Map<string, SheetPhoto>> {
  const out = new Map<string, SheetPhoto>();
  await Promise.all(
    [...new Set(slugs)].map(async (s) => {
      const p = await sheetPhoto(s);
      if (p) out.set(s, p);
    }),
  );
  return out;
}
