import type { APIRoute } from "astro";
import { activeSite } from "../sites";

export const prerender = true;

import { readFileSync } from "node:fs";

export const GET: APIRoute = () => {
  const isLondon = activeSite.id === "london";
  // Blue Hour navy circle. London embeds the real mark (white via the raster
  // set's source); toolkit keeps its drawn compass.
  const background = isLondon ? "#0E1B2C" : "#102536";
  const foreground = "#FFFFFF";
  const mark = isLondon
    ? `<image href="data:image/png;base64,${readFileSync("public/android-chrome-192x192.png").toString("base64")}" width="64" height="64"/>`
    : `<circle cx="32" cy="32" r="26" fill="${background}"/><circle cx="32" cy="32" r="19" fill="none" stroke="currentColor" stroke-width="4"/><path d="m41 23-5 13-13 5 5-13 13-5Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>`;

  return new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" style="color:${foreground}">${mark}</svg>`,
    { headers: { "Content-Type": "image/svg+xml" } },
  );
};
