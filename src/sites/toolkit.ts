import type { SiteConfig } from "./types";

export const toolkitSite: SiteConfig = {
  id: "toolkit",
  theme: "utility",
  name: "Travel Toolkit Blog",
  shortName: "TT",
  description: "A reusable utility-first shell for practical travel advice.",
  accentLabel: "Travel essentials",
  navigation: [
    { label: "Airports", href: "/#categories" },
    { label: "eSIMs", href: "/#categories" },
    { label: "Money", href: "/#categories" },
    { label: "Gear", href: "/#categories" },
    { label: "Components", href: "/components/" },
  ],
  footerNavigation: [
    { label: "About", href: "/#about" },
    { label: "Contact", href: "/#contact" },
    { label: "Disclosure", href: "/#disclosure" },
    { label: "RSS Feed", href: "/rss.xml" },
  ],
};
