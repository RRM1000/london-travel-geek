import type { APIRoute } from "astro";

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const indexingEnabled = import.meta.env.PUBLIC_ALLOW_INDEXING === "true";
  const siteOrigin = site ?? new URL("https://londontravelgeek.com");

  const content = indexingEnabled
    ? [
        "User-agent: *",
        "Allow: /",
        "",
        `Sitemap: ${new URL("/sitemap.xml", siteOrigin)}`,
        "",
      ].join("\n")
    : ["User-agent: *", "Disallow: /", ""].join("\n");

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};
