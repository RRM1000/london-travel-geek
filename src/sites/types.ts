export type SiteId = "london" | "toolkit";
export type ThemeId = "editorial" | "utility";

export interface NavigationChild {
  label: string;
  href: string;
  note?: string;
  /**
   * Calendar months (1-12) this link is worth surfacing in. Absent = always.
   *
   * Filtered at BUILD time, not in the browser, so the season only turns over
   * when the site is rebuilt. That is fine because every deploy rebuilds, but
   * it does mean a site left unbuilt for months would show a stale season -
   * hence `seasonalFallback` below, which is what shows when nothing matches.
   */
  months?: number[];
}

export interface NavigationSection {
  title: string;
  children: NavigationChild[];
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
  /**
   * An optional second, titled column in the panel - used for the seasonal
   * strand, where what a visitor wants in October is not what they want in
   * June. Entries carrying `months` are filtered to the current one.
   */
  secondary?: NavigationSection;
  /** Shown when every `secondary` entry is out of season. */
  seasonalFallback?: NavigationChild[];
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
