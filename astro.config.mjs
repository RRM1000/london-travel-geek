import { defineConfig } from "astro/config";
import remarkAreaRestaurants from "./src/lib/remark-area-restaurants.mjs";
import remarkHotelLinks from "./src/lib/remark-hotel-links.mjs";
import rehypeTableAlign from "./src/lib/rehype-table-align.mjs";
import sitemap from "./src/lib/sitemap-integration.mjs";

const siteId = process.env.SITE_ID ?? "london";
const siteUrl = process.env.SITE_URL ?? "https://www.londontravelgeek.co.uk";

if (!["london", "toolkit"].includes(siteId)) {
  throw new Error(
    `Unknown SITE_ID "${siteId}". Expected "london" or "toolkit".`,
  );
}

export default defineConfig({
  site: siteUrl,
  output: "static",
  // Builds sitemap.xml from every indexable page the build produced. See the
  // file for why this replaced a hand-maintained endpoint.
  integrations: [sitemap()],
  markdown: {
    remarkPlugins: [remarkAreaRestaurants, remarkHotelLinks],
    rehypePlugins: [rehypeTableAlign],
  },
  vite: {
    define: {
      __SITE_ID__: JSON.stringify(siteId),
    },
  },
});
