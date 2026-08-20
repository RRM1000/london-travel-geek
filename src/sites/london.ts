import type { SiteConfig } from "./types";

export const londonSite: SiteConfig = {
  id: "london",
  theme: "editorial",
  name: "London Travel Geek",
  shortName: "LTG",
  description:
    "Practical, carefully researched London travel guides for getting around, exploring top neighbourhoods and making more of every day.",
  accentLabel: "The No-Fluff Travel Handbook",
  navigation: [
    { label: "Eat & Drink", href: "/topics/food-and-drink/" },
    { label: "Areas", href: "/topics/london-areas/" },
    { label: "Plan", href: "/topics/london-itineraries/" },
    { label: "Transport", href: "/topics/getting-around-london/" },
    { label: "SIM & eSIM", href: "/topics/travel-sim-cards/" },
    { label: "All Guides", href: "/guides/" },
  ],
  footerNavigation: [
    { label: "About", href: "/#about" },
    { label: "All guides", href: "/guides/" },
    { label: "Privacy", href: "/privacy/" },
    { label: "RSS Feed", href: "/rss.xml" },
  ],
};
