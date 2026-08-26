// Turns Astro's unresolved markdown-image placeholders into real optimised
// <img> tags.
//
// WHY THIS EXISTS
// Area guides do not render through Astro's normal `render(entry)` path.
// splitAreaGuideBody chops the body into fragments and [...id].astro renders
// each one through a hand-built createMarkdownProcessor, so the closing
// sections can be placed around the data-driven ones.
//
// That hand-built processor does everything the real pipeline does EXCEPT
// images. Astro's markdown step emits a placeholder - <img __ASTRO_IMAGE_="{
// src, alt, index }"> - and it is Astro's own internal Content component that
// later swaps each placeholder for an optimised <picture>. A fragment rendered
// outside that component keeps the placeholder, which browsers render as
// nothing at all: no src, no image, no error.
//
// The result was that EVERY inline image in EVERY area guide was invisible on
// the live site while looking perfectly correct in the markdown, in the build
// log and in a grep of the built HTML - the filename is right there in the
// placeholder's JSON. Sixteen guides, silently.
//
// So this resolves them the same way Astro would: look the file up in an eager
// glob of the assets tree, run it through getImage(), and write the real tag.
import { getImage } from "astro:assets";

// Eager, because this runs at build time and the module graph has to contain
// every candidate up front - a dynamic import cannot be resolved from a string
// path that only exists inside markdown.
const ASSETS = import.meta.glob<{ default: ImageMetadata }>(
  "/src/assets/articles/**/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG}",
  { eager: true },
);

const PLACEHOLDER = /<img\s+__ASTRO_IMAGE_="([^"]*)"\s*\/?>/g;

function decode(s: string): string {
  return s
    .replace(/&#x22;/g, '"').replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'").replace(/&#39;/g, "'")
    .replace(/&#x26;/g, "&").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function attr(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/"/g, "&quot;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * @param html   Rendered fragment that may contain __ASTRO_IMAGE_ placeholders.
 * @param fromId Article id, e.g. "covent-garden-area-guide". Markdown paths are
 *               written relative to src/content/articles/, so they are resolved
 *               against that directory rather than against the site root.
 */
export async function resolveMarkdownImages(html: string, fromId: string): Promise<string> {
  if (!html || !html.includes("__ASTRO_IMAGE_")) return html;

  const jobs: Promise<{ token: string; tag: string }>[] = [];
  for (const match of html.matchAll(PLACEHOLDER)) {
    const token = match[0];
    let spec: { src?: string; alt?: string };
    try {
      spec = JSON.parse(decode(match[1]));
    } catch {
      continue; // malformed placeholder: leave it alone rather than guess
    }
    if (!spec.src) continue;

    // "../../assets/articles/x/y.jpg" from src/content/articles/<id>.md
    const url = new URL(spec.src, `file:///src/content/articles/${fromId}.md`);
    const key = decodeURIComponent(url.pathname);
    const mod = ASSETS[key];

    if (!mod) {
      // Loud, but not fatal: one missing file should not fail the whole build.
      console.warn(`  resolveMarkdownImages: no asset for "${spec.src}" in ${fromId} (looked for ${key})`);
      continue;
    }

    jobs.push(
      getImage({ src: mod.default, format: "webp", widths: [420, 800, 1200], sizes: "(min-width: 48rem) 45rem, 100vw" })
        .then((img) => ({
          token,
          tag:
            `<img src="${attr(img.src)}"` +
            (img.srcSet?.attribute ? ` srcset="${attr(img.srcSet.attribute)}"` : "") +
            ` sizes="(min-width: 48rem) 45rem, 100vw"` +
            ` alt="${attr(spec.alt ?? "")}"` +
            ` width="${mod.default.width}" height="${mod.default.height}"` +
            ` loading="lazy" decoding="async">`,
        })),
    );
  }

  let out = html;
  for (const { token, tag } of await Promise.all(jobs)) {
    out = out.replace(token, tag);
  }
  return out;
}
