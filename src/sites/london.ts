import type { SiteConfig } from "./types";

export const londonSite: SiteConfig = {
  id: "london",
  theme: "editorial",
  name: "London Travel Geek",
  shortName: "LTG",
  description:
    "Practical, carefully researched London travel guides for getting around, choosing where to stay and making more of every day.",
  accentLabel: "London, clearly explained",
  navigation: [
    { label: "Explore", href: "/#articles" },
    { label: "Areas", href: "/articles/best-areas-to-stay-and-visit-london/" },
    { label: "Plan", href: "/articles/london-itineraries-by-days-and-interests/" },
    { label: "Eat", href: "/articles/eat-in-london-guide/" },
    { label: "SIM & eSIM", href: "/articles/travel-sim-esim-topic-hub/" },
  ],
  footerNavigation: [
    { label: "About", href: "/#about" },
    { label: "Latest guides", href: "/#articles" },
    { label: "Privacy", href: "/privacy/" },
  ],
};
