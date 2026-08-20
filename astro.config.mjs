import { defineConfig } from "astro/config";
import remarkAreaRestaurants from "./src/lib/remark-area-restaurants.mjs";
import rehypeTableAlign from "./src/lib/rehype-table-align.mjs";

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
  markdown: {
    remarkPlugins: [remarkAreaRestaurants],
    rehypePlugins: [rehypeTableAlign],
  },
  vite: {
    define: {
      __SITE_ID__: JSON.stringify(siteId),
    },
  },
});
