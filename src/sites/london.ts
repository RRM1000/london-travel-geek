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
    { label: "All guides", href: "/guides/" },
    { label: "Areas", href: "/topics/london-areas/" },
    { label: "Plan", href: "/topics/london-itineraries/" },
    { label: "Eat", href: "/topics/food-and-drink/" },
    { label: "SIM & eSIM", href: "/topics/travel-sim-cards/" },
  ],
  footerNavigation: [
    { label: "About", href: "/#about" },
    { label: "All guides", href: "/guides/" },
    { label: "Privacy", href: "/privacy/" },
  ],
};
