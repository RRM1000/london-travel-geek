// Turn captured Hotels.com typeahead results into property URLs, but only
// where the name genuinely matches.
//
// HOW THE URLS ARE FOUND
// Hotels.com has no CJ product feed, so there is no catalogue to join against.
// What works is two cheap requests per property, run in the browser against
// uk.hotels.com so they carry the site's own session:
//
//   1. /api/v4/typeahead/<name>            -> a gaiaId
//   2. /h<gaiaId>.Hotel-Information        -> 302s to the canonical /hoNNN/ url
//
// The second is the useful discovery: the Expedia-style path redirects to the
// Hotels.com property page, so no page has to be rendered.
//
// WHY THIS SCRIPT EXISTS RATHER THAN JUST PASTING THE RESULTS
// The typeahead returns the best match for a STRING, not the right property.
// In the first batch of 23 it confidently returned:
//
//   hub by Premier Inn Covent Garden -> Covent Garden Hotel, Firmdale Hotels
//   Premier Inn London Stratford     -> Stratford Hotel
//   Staycity Aparthotels Dalston     -> a url for Kingsland Locke
//
// Three wrong in twenty-three, each of them a real London hotel that would
// have looked plausible in the sheet and sent readers - and commission - to a
// competitor of the place we recommended. So nothing is accepted on the
// typeahead's word alone.
//
//   node scripts/resolve-hotels-com-urls.mjs <captured.json>
//
// Accepted matches are merged into data/hotels-com-urls.json. Everything else
// is listed for a human to look at, which is the point.
import fs from "node:fs";

const STORE = "data/hotels-com-urls.json";

// Words that carry no identifying weight - every other London hotel has them.
const NOISE = new Set([
  "hotel", "hotels", "london", "the", "a", "and", "by", "at", "in", "of",
  "england", "united", "kingdom", "uk", "inn", "rooms", "aparthotel",
  "aparthotels", "hostel", "apartments", "collection", "hilton", "marriott",
]);

const tokens = (s) =>
  new Set(
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, " ")
      .split(/[\s'-]+/)
      .filter((w) => w.length > 1 && !NOISE.has(w)),
  );

/**
 * Every distinctive word in the name we asked for must appear in the name we
 * got back. "Premier Stratford" against "Stratford" fails on `premier`, which
 * is exactly the case that went wrong. Brand words are deliberately NOT in the
 * noise list where they identify the operator - only where every hotel has them.
 */
function verdict(asked, got, url) {
  const a = tokens(asked);
  const g = tokens(got);
  if (!a.size) return { ok: false, why: "nothing distinctive in the name" };
  const missing = [...a].filter((w) => !g.has(w));
  if (missing.length) return { ok: false, why: `matched name is missing: ${missing.join(", ")}` };

  // The url slug is generated from the property's own name, so a name that
  // agrees with the title but not the url means the redirect went elsewhere -
  // the Staycity/Locke case. Some properties redirect to a bare /hoNNN/ with
  // no slug at all, and there is nothing to cross-check there: the name match
  // has to stand on its own rather than fail for want of evidence.
  const last = (url || "").split("/").filter(Boolean).pop() || "";
  if (/^ho\d+$/i.test(last)) return { ok: true };
  const slugWords = tokens(last);
  const strongest = [...a].sort((x, y) => y.length - x.length)[0];
  if (strongest && slugWords.size && !slugWords.has(strongest)) {
    return { ok: false, why: `url slug does not contain "${strongest}"` };
  }
  return { ok: true };
}

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error("usage: node scripts/resolve-hotels-com-urls.mjs <captured.json>");
  process.exit(2);
}
const captured = JSON.parse(fs.readFileSync(file, "utf8"));
const store = fs.existsSync(STORE) ? JSON.parse(fs.readFileSync(STORE, "utf8")) : {};

const accepted = [], rejected = [], nothing = [];
for (const r of captured) {
  if (!r.url) { nothing.push(r); continue; }
  const v = verdict(r.name, r.matched, r.url);
  if (!v.ok) { rejected.push({ ...r, why: v.why }); continue; }
  store[r.slug] = {
    url: r.url,
    note: `Resolved ${new Date().toISOString().slice(0, 10)} via Hotels.com typeahead -> /h<gaiaId>.Hotel-Information redirect. Matched "${r.matched}".`,
  };
  accepted.push(r);
}

fs.writeFileSync(STORE, JSON.stringify(store, null, 1));

console.log(`${captured.length} captured: ${accepted.length} accepted, ${rejected.length} rejected, ${nothing.length} with no result\n`);
if (rejected.length) {
  console.log("REJECTED - the typeahead found something, but not this property:");
  for (const r of rejected) console.log(`  ${r.slug}\n    asked : ${r.name}\n    got   : ${r.matched}\n    why   : ${r.why}`);
  console.log();
}
if (nothing.length) {
  console.log("NO RESULT - needs a different search term or is not sold on Hotels.com:");
  for (const r of nothing) console.log(`  ${r.slug}  (${r.name})${r.note ? " - " + r.note : ""}`);
  console.log();
}
console.log(`${STORE} now holds ${Object.keys(store).filter((k) => !k.startsWith("_")).length} url(s).`);
