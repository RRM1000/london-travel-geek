import { defineConfig } from "astro/config";
import remarkAreaRestaurants from "./src/lib/remark-area-restaurants.mjs";
import remarkHotelLinks from "./src/lib/remark-hotel-links.mjs";
import remarkPartnerLinks from "./src/lib/remark-partner-links.mjs";
import remarkBigEvents from "./src/lib/remark-big-events.mjs";
import remarkStayStrips from "./src/lib/remark-stay-strips.mjs";
import remarkSubmitEvent from "./src/lib/remark-submit-event.mjs";
import remarkVenueListings from "./src/lib/remark-venue-listings.mjs";
import remarkVenueDeals from "./src/lib/remark-venue-deals.mjs";
import remarkUntil from "./src/lib/remark-until.mjs";
import remarkWwMap from "./src/lib/remark-ww-map.mjs";
import remarkBmMap from "./src/lib/remark-bm-map.mjs";
import remarkDealTables, { remarkAreaDeals, remarkTopicDeals, remarkOtherDeals } from "./src/lib/remark-deal-tables.mjs";
import rehypeTableAlign from "./src/lib/rehype-table-align.mjs";
import rehypeTableResponsive from "./src/lib/rehype-table-responsive.mjs";
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
    remarkPlugins: [remarkDealTables, remarkAreaRestaurants, remarkAreaDeals, remarkTopicDeals, remarkOtherDeals, remarkHotelLinks, remarkPartnerLinks, remarkStayStrips, remarkBigEvents, remarkSubmitEvent, remarkVenueListings, remarkVenueDeals, remarkUntil, remarkWwMap, remarkBmMap],
    rehypePlugins: [rehypeTableAlign, rehypeTableResponsive],
  },
  vite: {
    define: {
      __SITE_ID__: JSON.stringify(siteId),
    },
  },
});
