export type SiteId = "london" | "toolkit";
export type ThemeId = "editorial" | "utility";

export interface NavigationChild {
  label: string;
  href: string;
  note?: string;
}

export interface NavigationItem {
  label: string;
  href: string;
  /** One-line description shown in the mega-menu panel. */
  description?: string;
  /**
   * Key into the header's image map for the mega-menu feature card.
   * A string rather than an ImageMetadata import so this config file
   * stays plain data - SiteHeader owns the actual asset imports.
   */
  imageKey?: string;
  /** Links listed in the mega-menu panel. Absent = plain link, no panel. */
  children?: NavigationChild[];
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
