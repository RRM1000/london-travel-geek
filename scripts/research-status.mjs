// Reports which research passes have actually run for a cuisine, and which
// publishers from the playbook are still unread.
//
// Exists because "did we do the video pass?" was answered from memory twice and
// wrong both times. Run this BEFORE calling a cuisine finished.
//
//   node scripts/research-status.mjs british
//   node scripts/research-status.mjs            # all cuisines with a file
//
import fs from "node:fs";
import path from "node:path";
import { readTab } from "./sheets.mjs";

const playbook = JSON.parse(fs.readFileSync("data/research-playbook.json", "utf8"));
const DIR = "data/consensus";
const arg = process.argv[2]?.toLowerCase();

const cuisines = arg
  ? [arg]
  : fs.readdirSync(DIR).filter((f) => f.endsWith(".json") && !f.startsWith("_"))
      .map((f) => f.replace(/\.json$/, ""));

const rows = await readTab("Restaurants v2");
const norm = (s) => String(s ?? "").toLowerCase();

for (const cuisine of cuisines) {
  const file = path.join(DIR, `${cuisine}.json`);
  if (!fs.existsSync(file)) { console.log(`${cuisine}: no consensus file`); continue; }
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const usable = data.sources.filter((s) => s.names?.length);
  const domains = new Set(usable.map((s) => {
    try { return new URL(s.url).hostname.replace(/^www\./, ""); } catch { return s.name; }
  }));
  const scopes = new Set(usable.map((s) => s.scope).filter(Boolean));
  const cuisineRows = rows.filter((r) => norm(r.Cuisine) === cuisine && r.Status === "open");

  console.log(`\n=== ${cuisine.toUpperCase()} - ${cuisineRows.length} open rows ===`);

  // Which publishers named in the playbook are actually present?
  const known = [
    ...playbook.publishers.awards,
    ...playbook.publishers.majorGuides,
    ...playbook.publishers.blogsAndMagazines,
  ];
  const present = known.filter((p) =>
    usable.some((s) => norm(s.name).includes(norm(p).split(" (")[0])),
  );
  const missing = known.filter((p) => !present.includes(p));

  const line = (ok, label, detail) =>
    console.log(`  ${ok ? "OK  " : "TODO"}  ${label.padEnd(14)} ${detail}`);

  line(domains.size >= 12, "consensus", `${domains.size} domains, ${usable.length} lists (target 12+)`);
  line(scopes.has("awards"), "awards", scopes.has("awards")
    ? `awards lists present`
    : `NO AWARDS SOURCE - this is how Fallow was missed`);
  line(cuisineRows.some((r) => /video-research/i.test(r.Source)), "video",
    cuisineRows.filter((r) => /video-research/i.test(r.Source)).length + " row(s) sourced from video");
  line(cuisineRows.some((r) => /last30days/i.test(r.Source)), "last30days",
    cuisineRows.filter((r) => /last30days/i.test(r.Source)).length + " row(s) sourced from it");
  const subtypes = [...scopes].filter((s) => s !== "awards" && s !== "general");
  line(subtypes.length > 0, "subtypes", subtypes.join(", ") || "none run");
  const minis = cuisineRows.filter((r) => r["Chain Type"] === "mini-chain");
  const flagship = cuisineRows.filter((r) => r["Location Basis"] === "flagship-only");
  line(flagship.length === 0, "branches",
    `${minis.length} mini-chain(s), ${flagship.length} still flagship-only`);
  const noPlace = cuisineRows.filter((r) => !r["Place ID"]).length;
  line(noPlace === 0, "places", `${cuisineRows.length - noPlace}/${cuisineRows.length} enriched (BILLED - ask first)`);

  if (missing.length) {
    console.log(`\n  publishers not yet read (${missing.length}):`);
    console.log(`    ${missing.join(", ")}`);
  }
}
