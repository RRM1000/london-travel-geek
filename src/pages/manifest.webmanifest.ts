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
          src: "/android-chrome-192x192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/android-chrome-512x512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/apple-touch-icon.png",
          sizes: "180x180",
          type: "image/png",
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
