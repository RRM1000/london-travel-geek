// Pull Hotels.com property urls from CJ, which is where they are published.
//
// Replaces scripts/find-hotels-com-urls.mjs, which tried to rebuild the same
// catalogue out of search results and could not - Hotels.com blocks scripts,
// and the search engines rate-limited. This asks the advertiser instead, so the
// ids are correct by construction rather than by fuzzy name match.
//
// NEEDS A PERSONAL ACCESS TOKEN, generated in the CJ account (Developer Portal
// > Authentication > Personal Access Tokens). Put it in .env.local as
// CJ_TOKEN=... - it is a credential, unlike the PID, and does not belong in git.
//
//   node scripts/cj-product-feed.mjs --schema     # what the API actually offers
//   node scripts/cj-product-feed.mjs --search "The Hoxton Shoreditch"
//   node scripts/cj-product-feed.mjs --all        # every hotel in the sheet
//
// WHY --schema FIRST. CJ's GraphQL schema has changed more than once and the
// published examples disagree with each other. Rather than hardcode a query
// from documentation and debug a 400, the first run introspects the live schema
// and prints the product query's real arguments and fields. Write the query
// from what comes back, not from what a blog post says.
import fs from "node:fs";

const ENDPOINT = "https://ads.api.cj.com/query";
const CJ_PID = "101875905";           // londontravelgeek.co.uk - see lib/affiliate.mjs
const HOTELS_COM_AID = "5275597";     // Hotels.com UK, from the CJ listing

// .env.local is not loaded by node, and adding a dotenv dependency for one
// variable is not worth it.
function envLocal(key) {
  if (process.env[key]) return process.env[key];
  try {
    const line = fs
      .readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .find((l) => l.trim().startsWith(`${key}=`));
    return line ? line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") : undefined;
  } catch {
    return undefined;
  }
}

const TOKEN = envLocal("CJ_TOKEN");
if (!TOKEN) {
  console.error(
    "No CJ_TOKEN.\n\n" +
      "  1. developers.cj.com > Authentication > Personal Access Tokens\n" +
      "  2. add CJ_TOKEN=... to .env.local (already gitignored)\n" +
      "  3. run this again\n",
  );
  process.exit(1);
}

async function gql(query) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    // The body carries CJ's own explanation, which is more useful than the code.
    console.error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
    process.exit(1);
  }
  const json = JSON.parse(text);
  if (json.errors) {
    console.error("GraphQL errors:\n" + JSON.stringify(json.errors, null, 1).slice(0, 900));
    process.exit(1);
  }
  return json.data;
}

if (process.argv.includes("--schema")) {
  const data = await gql(`{
    __schema { queryType { fields { name description
      args { name type { name kind ofType { name kind } } } } } }
  }`);
  for (const f of data.__schema.queryType.fields) {
    console.log(`\n${f.name}`);
    if (f.description) console.log(`  ${f.description.slice(0, 150)}`);
    for (const a of f.args) {
      const t = a.type.name ?? a.type.ofType?.name ?? a.type.kind;
      console.log(`    ${a.name}: ${t}`);
    }
  }
  console.log(
    `\nPID ${CJ_PID}, Hotels.com advertiser ${HOTELS_COM_AID}.` +
      `\nWrite the product query from the fields above, then re-run with --search.`,
  );
  process.exit(0);
}

console.log(
  "Run --schema first. The product query is deliberately not hardcoded here:\n" +
    "CJ's schema has changed more than once and the published examples disagree,\n" +
    "so the query gets written from the live introspection rather than from docs.",
);
