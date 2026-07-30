import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { activeSite } from "../sites";

export const prerender = true;

const escapeXml = (value: string) =>
  value.replace(
    /[<>&'"]/g,
    (character) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[character] ?? character,
  );

export const GET: APIRoute = async ({ site }) => {
  const siteOrigin = site ?? new URL("https://londontravelgeek.com");
  const articles = (await getCollection("articles"))
    .filter(
      (entry) =>
        !entry.data.draft && entry.data.sites.includes(activeSite.id),
    )
    .map((entry) => ({
      path: `/articles/${entry.id}/`,
      modified: entry.data.updatedAt ?? entry.data.publishedAt,
    }));

  const pages = [
    { path: "/", modified: undefined },
    { path: "/privacy/", modified: undefined },
    ...articles,
  ];

  const urls = pages
    .map(({ path, modified }) => {
      const location = escapeXml(new URL(path, siteOrigin).toString());
      const lastModified = modified
        ? `<lastmod>${modified.toISOString().slice(0, 10)}</lastmod>`
        : "";

      return `<url><loc>${location}</loc>${lastModified}</url>`;
    })
    .join("");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
      },
    },
  );
};
