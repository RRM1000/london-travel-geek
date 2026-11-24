// The deals finder's data (/articles/london-deals-near-me/): every live deal that has a London
// location, with its branches, and the station list for the "near" box. Built with the site, so
// the deals are the same ones the deals tables print; a deal past its end date is also dropped in
// the reader's browser. The page fetches it with ?v=<build time>, so a long cache is safe.
import type { APIRoute } from "astro";
// @ts-ignore - plain JS module
import { finderData } from "../lib/remark-deal-tables.mjs";

export const GET: APIRoute = () =>
  new Response(JSON.stringify(finderData()), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
