export type SiteId = "london" | "toolkit";
export type ThemeId = "editorial" | "utility";

export interface NavigationItem {
  label: string;
  href: string;
}

export interface SiteConfig {
  id: SiteId;
  theme: ThemeId;
  name: string;
  shortName: string;
  description: string;
  accentLabel: string;
  navigation: NavigationItem[];
  footerNavigation: NavigationItem[];
}
