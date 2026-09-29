// Ask Search Console whether Google has indexed a page, and if not, why.
//
//   node scripts/inspect-url.mjs best-street-food-london [another-slug ...]
//
import { google } from "googleapis";
import fs from "node:fs";
import { KEY_PATH } from "./sheets.mjs";

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(fs.readFileSync(KEY_PATH, "utf8")),
  scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
});
const sc = google.searchconsole({ version: "v1", auth });
for (const slug of process.argv.slice(2)) {
  const inspectionUrl = `https://www.londontravelgeek.co.uk/articles/${slug}/`;
  const r = (await sc.urlInspection.index.inspect({ requestBody: { inspectionUrl, siteUrl: "sc-domain:londontravelgeek.co.uk" } })).data.inspectionResult?.indexStatusResult ?? {};
  console.log(`${slug}\n  verdict: ${r.verdict}  coverage: ${r.coverageState}\n  indexing: ${r.indexingState}  robots: ${r.robotsTxtState}  fetch: ${r.pageFetchState}\n  last crawl: ${r.lastCrawlTime ?? "never"}  google canonical: ${r.googleCanonical ?? "-"}  user canonical: ${r.userCanonical ?? "-"}\n  found via: ${(r.referringUrls ?? []).slice(0, 3).join(", ") || "-"}  sitemaps: ${(r.sitemap ?? []).join(", ") || "-"}`);
}
