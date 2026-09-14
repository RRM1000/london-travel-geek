// Resolves `[Any text](partner:some-key)` in article markdown to an affiliate
// link from src/data/partnerLinks.json, at build time.
//
// The same reasoning as remark-hotel-links: a tracking URL typed into prose is
// wrong the first time the programme changes its link format, and nothing
// tells you. One JSON file holds every eSIM and similar partner link, so a
// changed id is one edit rather than a search through articles.
//
// It also keeps the disclosure honest. Every resolved link carries
// rel="sponsored", the data-affiliate attribute the analytics and the
// rel-enforcing script in BaseLayout already look for, and the same "ad" chip
// the hotel links use.
//
// An unknown key degrades to plain text and warns, rather than throwing - a
// throw inside a remark plugin blanks the whole article body.
import fs from "node:fs";
import { visit } from "unist-util-visit";

const DATA = "src/data/partnerLinks.json";
const SCHEME = /^partner:([a-z0-9-]+)$/;

let cache = { mtimeMs: -1, links: {} };
function links() {
  let mtimeMs;
  try {
    mtimeMs = fs.statSync(DATA).mtimeMs;
  } catch {
    return cache.links;
  }
  if (mtimeMs !== cache.mtimeMs) {
    try {
      cache = { mtimeMs, links: JSON.parse(fs.readFileSync(DATA, "utf8")).links ?? {} };
    } catch {
      // Mid-write, most likely. Keep the previous map.
    }
  }
  return cache.links;
}

function degrade(node) {
  const text = (node.children ?? [])
    .map((c) => (typeof c.value === "string" ? c.value : ""))
    .join("");
  node.type = "text";
  node.value = text;
  delete node.children;
  delete node.url;
  delete node.data;
}

export default function remarkPartnerLinks() {
  return (tree, file) => {
    const where = file?.history?.[0] ?? "an article";
    visit(tree, "link", (node) => {
      const m = SCHEME.exec(node.url ?? "");
      if (!m) return;
      const link = links()[m[1]];
      if (!link?.url) {
        console.warn(
          `[remark-partner-links] "${m[1]}" is not in ${DATA} (${where}). Rendered as plain text.`,
        );
        degrade(node);
        return;
      }
      node.url = link.url;
      node.data = node.data || {};
      node.data.hProperties = {
        ...(node.data.hProperties || {}),
        target: "_blank",
        rel: "sponsored nofollow noopener",
        "data-affiliate": link.network || "",
        class: "hotel-link",
      };
      node.children.push({ type: "html", value: '<span class="hotel-link__ad">ad</span>' });
    });
  };
}
