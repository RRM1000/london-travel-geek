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
import { awinUrl, skiddleUrl } from "../../scripts/lib/affiliate.mjs";

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

// Roam Compare sends clicks through the same Nomad account on Impact with the
// same partner and ad ids, so without a tag Impact cannot say which site a
// sale came from. Impact links get subId1=londontravelgeek and subId2 set to
// the article's slug; both show as columns in Impact's action reports. Roam
// Compare tags its own as subId1=roamcompare. Other links pass through.
const IMPACT_HOSTS = ["pxf.io", "sjv.io", "ojrq.net", "7eer.net", "evyy.net"];
function tagImpactClick(value, filePath) {
  try {
    const url = new URL(value);
    const impact =
      IMPACT_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`)) ||
      /^imp\.i\d+\.net$/.test(url.hostname);
    if (!impact) return value;
    const slug = String(filePath).replace(/\\/g, "/").split("/").pop().replace(/\.mdx?$/, "");
    if (!url.searchParams.has("subId1")) url.searchParams.set("subId1", "londontravelgeek");
    if (!url.searchParams.has("subId2") && slug && slug !== "an article") url.searchParams.set("subId2", slug);
    return url.toString();
  } catch {
    return value;
  }
}

const slugOf = (filePath) => String(filePath).replace(/\\/g, "/").split("/").pop().replace(/\.mdx?$/, "");

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
      // Plain skiddle.com links in prose earn too: Skiddle tracks with a tag on
      // the url rather than a redirect, so the reader lands on the same page.
      // The article slug goes in skcampaign, so Skiddle's reports say which
      // guide sold the ticket.
      const isWeb = /^https?:\/\//.test(node.url ?? "");
      // Awin advertisers (London Box Office) wrap the destination in Awin's
      // redirect, with the article slug as clickref.
      const awin = isWeb ? awinUrl(node.url, slugOf(where)) : undefined;
      if (awin) {
        node.url = awin.url;
        node.data = node.data || {};
        node.data.hProperties = {
          ...(node.data.hProperties || {}),
          target: "_blank",
          rel: "sponsored nofollow noopener",
          "data-affiliate": "awin",
          "data-venue": awin.label,
          class: "hotel-link",
        };
        node.children.push({ type: "html", value: '<span class="hotel-link__ad">ad</span>' });
        return;
      }
      const tagged = isWeb ? skiddleUrl(node.url, slugOf(where)) : undefined;
      if (tagged) {
        node.url = tagged;
        node.data = node.data || {};
        node.data.hProperties = {
          ...(node.data.hProperties || {}),
          target: "_blank",
          rel: "sponsored nofollow noopener",
          "data-affiliate": "skiddle",
          class: "hotel-link",
        };
        node.children.push({ type: "html", value: '<span class="hotel-link__ad">ad</span>' });
        return;
      }
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
      node.url = tagImpactClick(link.url, where);
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
