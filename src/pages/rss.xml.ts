import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { activeSite } from "../sites";

export const GET: APIRoute = async (context) => {
  const siteOrigin = context.site ?? new URL("https://www.londontravelgeek.co.uk");
  const articles = (await getCollection("articles"))
    .filter(
      (entry) => !entry.data.draft && entry.data.sites.includes(activeSite.id),
    )
    .sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());

  return rss({
    title: activeSite.name,
    description: activeSite.description,
    site: siteOrigin,
    items: articles.map((article) => ({
      title: article.data.title,
      pubDate: article.data.publishedAt,
      description: article.data.description,
      link: `/articles/${article.id}/`,
      categories: [article.data.category, ...article.data.tags],
    })),
    customData: `<language>en-GB</language>`,
  });
};
