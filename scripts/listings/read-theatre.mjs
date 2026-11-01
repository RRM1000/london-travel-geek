// Upcoming shows from London Theatre Geek, for the major events calendar and
// the on-sale page. That site owns theatre dates, so nothing is researched
// twice: this reads its public shows table and writes src/data/theatre-shows.json.
//
// The publishable key only reads what the theatre site shows the public. Set
// THEATRE_SUPABASE_URL and THEATRE_SUPABASE_KEY. Without them this leaves the
// last file in place, so a refresh still builds.
import fs from "node:fs";

const OUT = "src/data/theatre-shows.json";
const base = process.env.THEATRE_SUPABASE_URL;
const key = process.env.THEATRE_SUPABASE_KEY;
if (!base || !key) {
  console.log("read-theatre: no credentials, keeping the last file");
  process.exit(0);
}

const get = async (path) => {
  const r = await fetch(`${base}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`read-theatre: ${r.status} on ${path}`);
  return r.json();
};

const today = new Date().toISOString().slice(0, 10);
const fields = "slug,name,status,venue_slug,genre,location,popularity,first_preview,press_night,opening_date,closing_date,booking_from,priority_booking_from";
const [shows, venues] = await Promise.all([
  get(`shows?select=${fields}&status=in.(live,announced)&or=(closing_date.is.null,closing_date.gte.${today})&limit=1000`),
  get("venues?select=slug,name&limit=1000"),
]);
if (!shows.length) throw new Error("read-theatre: no shows came back");

const venueName = new Map(venues.map((v) => [v.slug, v.name]));
const rows = shows
  .map((s) => ({
    slug: s.slug,
    name: s.name,
    venue: venueName.get(s.venue_slug) ?? "",
    venueSlug: s.venue_slug,
    location: s.location,
    genre: s.genre,
    popularity: s.popularity,
    firstPreview: s.first_preview,
    pressNight: s.press_night,
    opening: s.opening_date,
    closing: s.closing_date,
    bookingFrom: s.booking_from,
    priorityFrom: s.priority_booking_from,
  }))
  .sort((a, b) => a.slug.localeCompare(b.slug));

fs.writeFileSync(OUT, `${JSON.stringify({ generated: today, shows: rows }, null, 1)}\n`);
console.log(`read-theatre: ${rows.length} shows`);
