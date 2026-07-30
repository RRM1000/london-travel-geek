import type { APIRoute } from "astro";
import { activeSite } from "../sites";

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      name: activeSite.name,
      short_name: activeSite.shortName,
      description: activeSite.description,
      start_url: "/",
      display: "standalone",
      background_color: "#f6f3eb",
      theme_color: "#132a38",
      icons: [
        {
          src: "/apple-touch-icon.png",
          sizes: "180x180",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/favicon.svg",
          sizes: "any",
          type: "image/svg+xml",
          purpose: "any",
        },
      ],
    }),
    {
      headers: {
        "Content-Type": "application/manifest+json; charset=utf-8",
      },
    },
  );
