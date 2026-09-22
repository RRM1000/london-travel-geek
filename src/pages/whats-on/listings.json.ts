// The What's On listings, served as a static file the page fetches.
//
// About ten thousand performances: too many to inline into the page, so the
// shell paints first and the rows arrive here. The page puts ?v=<generated> on
// the URL, so each refresh of the data gets a fresh URL and a long cache is safe.
import type { APIRoute } from "astro";
import listings from "../../data/listings.json";

export const GET: APIRoute = () =>
  new Response(JSON.stringify(listings), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
