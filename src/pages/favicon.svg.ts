import type { APIRoute } from "astro";
import { activeSite } from "../sites";

export const prerender = true;

export const GET: APIRoute = () => {
  const isLondon = activeSite.id === "london";
  const background = isLondon ? "#132A38" : "#102536";
  const foreground = isLondon ? "#FFFDF8" : "#F7FAFA";
  const mark = isLondon
    ? '<circle cx="21" cy="34" r="11" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="43" cy="34" r="11" fill="none" stroke="currentColor" stroke-width="4"/><path d="M32 34h1M10 28l-5-4M54 28l5-4" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M27 34h10" stroke="#B52D36" stroke-width="4" stroke-linecap="round"/>'
    : '<circle cx="32" cy="32" r="19" fill="none" stroke="currentColor" stroke-width="4"/><path d="m41 23-5 13-13 5 5-13 13-5Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>';

  return new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" style="color:${foreground}"><rect width="64" height="64" rx="14" fill="${background}"/>${mark}</svg>`,
    { headers: { "Content-Type": "image/svg+xml" } },
  );
};
