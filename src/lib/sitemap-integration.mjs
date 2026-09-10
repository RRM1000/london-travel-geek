// Writes sitemap.xml after the build, from the pages the build actually
// produced, rather than from a list someone has to remember to update.
//
// WHY THE OLD ENDPOINT WENT
// src/pages/sitemap.xml.ts listed pages by hand: the articles collection plus
// five hubs typed in one at a time. Every section added after it - /stay/, the
// eighty-six /restaurants/ pages, the /topics/ hubs, the tag pages, /guides/,
// /plaques/, /how-we-rank/ - was built, linked and indexable, and missing from
// the sitemap, because nothing made anyone add it. On 10 September 2026 it
// listed 171 of 631 pages. It also listed /rss.xml, which is not a page.
//
// THE RULE
// A page goes in if search engines may index it: it was built as a full HTML
// page, no robots or googlebot meta in its head says noindex, and its
// canonical - where it has one - points at itself. That is the signal Google
// reads, taken from the HTML Google fetches, so the sitemap and the pages
// cannot disagree, and a new section is listed the first time it is built.
//
// WHY A LOCAL BUILD WRITES AN EMPTY ONE
// Indexing is switched on per build by PUBLIC_ALLOW_INDEXING. With it off -
// every local build, and any preview built without it - every page carries
// noindex, so by the rule above nothing qualifies. That is correct rather than
// broken: a site asking not to be indexed should not advertise its URLs. To
// see the production sitemap locally, build with PUBLIC_ALLOW_INDEXING=true.
//
// lastmod is the page's own JSON-LD dateModified, which BaseLayout sets to
// updatedAt ?? publishedAt - the value the old endpoint used. Hub and tag
// pages declare none and get none.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const escapeXml = (value) =>
  value.replace(
    /[<>&'"]/g,
    (character) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[character] ?? character,
  );

// Attributes of one tag, names lower-cased. Enough for the markup this site
// emits; it is not a general HTML parser and does not need to be.
const attributes = (tag) =>
  Object.fromEntries(
    [...tag.matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)].map(([, name, value]) => [
      name.toLowerCase(),
      value.replace(/&amp;/g, "&"),
    ]),
  );

async function htmlFiles(dir) {
  const found = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await htmlFiles(full)));
    else if (entry.name.endsWith(".html")) found.push(full);
  }
  return found;
}

// The path a file in the output directory is served at: an index.html is its
// directory, with the trailing slash every canonical on this site uses.
function servedPath(root, file) {
  const rel = path.relative(root, file).split(path.sep).join("/");
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html")) {
    return `/${rel.slice(0, -"index.html".length)}`;
  }
  return `/${rel}`;
}

const isNoindex = (head) =>
  [...head.matchAll(/<meta\b[^>]*>/gi)]
    .map(([tag]) => attributes(tag))
    .some(
      (meta) =>
        /^(robots|googlebot)$/i.test(meta.name ?? "") &&
        /\bnoindex\b/i.test(meta.content ?? ""),
    );

function canonicalOf(head) {
  for (const [tag] of head.matchAll(/<link\b[^>]*>/gi)) {
    const link = attributes(tag);
    if ((link.rel ?? "").toLowerCase() === "canonical" && link.href) {
      return link.href;
    }
  }
  return undefined;
}

function lastModified(head) {
  const blocks = head.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const [, json] of blocks) {
    let data;
    try {
      data = JSON.parse(json);
    } catch {
      continue;
    }
    const graph = Array.isArray(data?.["@graph"]) ? data["@graph"] : [];
    for (const node of [data, ...graph].flat()) {
      const date = new Date(node?.dateModified ?? Number.NaN);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString().slice(0, 10);
      }
    }
  }
  return undefined;
}

export default function sitemap() {
  let site;

  return {
    name: "ltg-sitemap",
    hooks: {
      "astro:config:done": ({ config }) => {
        site = config.site;
      },
      "astro:build:done": async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const entries = [];
        const noindexed = [];
        const elsewhere = [];

        for (const file of await htmlFiles(root)) {
          const html = await fs.readFile(file, "utf8");
          const end = html.indexOf("</head>");
          // A verification file or a fragment copied from public/ is not a
          // page, however it is named.
          if (end === -1) continue;
          const head = html.slice(0, end);
          const served = servedPath(root, file);

          if (isNoindex(head)) {
            noindexed.push(served);
            continue;
          }

          const canonical = canonicalOf(head);
          let loc;
          if (canonical) {
            const url = new URL(canonical, site);
            if (decodeURI(url.pathname) !== served) {
              elsewhere.push(`${served} -> ${url.pathname}`);
              continue;
            }
            loc = url.href;
          } else if (site) {
            loc = new URL(served, site).href;
          } else {
            elsewhere.push(`${served} (no canonical and no site set)`);
            continue;
          }

          entries.push({ served, loc, lastmod: lastModified(head) });
        }

        // Code-point order, so the file diffs cleanly between builds.
        entries.sort((a, b) =>
          a.served < b.served ? -1 : a.served > b.served ? 1 : 0,
        );

        const urls = entries
          .map(
            ({ loc, lastmod }) =>
              `<url><loc>${escapeXml(loc)}</loc>${
                lastmod ? `<lastmod>${lastmod}</lastmod>` : ""
              }</url>`,
          )
          .join("");

        await fs.writeFile(
          path.join(root, "sitemap.xml"),
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
        );

        logger.info(
          `${entries.length} URLs written to sitemap.xml; ${noindexed.length} noindex page(s) left out.`,
        );
        if (entries.length === 0 && noindexed.length > 0) {
          logger.warn(
            'Every page is noindex, so the sitemap is empty. Expected when PUBLIC_ALLOW_INDEXING is not "true" - local and preview builds - and wrong for production.',
          );
        } else if (noindexed.length > 0 && noindexed.length <= 10) {
          logger.info(`Left out as noindex: ${noindexed.join(", ")}`);
        }
        if (elsewhere.length > 0) {
          logger.warn(
            `Left out because the canonical points elsewhere: ${elsewhere.join(", ")}`,
          );
        }
      },
    },
  };
}
