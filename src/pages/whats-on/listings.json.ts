// The What's On listings, served as a static file the page fetches.
//
// About ten thousand performances: too many to inline into the page, so the
// shell paints first and the rows arrive here. The page puts ?v=<generated> on
// the URL, so each refresh of the data gets a fresh URL and a long cache is safe.
import type { APIRoute } from "astro";
import listings from "../../data/listings.json";
import { withExhibitions } from "../../lib/exhibitions";
import type { Listings } from "../../lib/whats-on";

// Folds in the exhibitions and conventions from events.json, same as the
// page itself - see index.astro for why this can't just live in listings.json.
const merged = withExhibitions(listings as unknown as Listings);

export const GET: APIRoute = () =>
  new Response(JSON.stringify(merged), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
