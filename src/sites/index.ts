import { londonSite } from "./london";
import { toolkitSite } from "./toolkit";
import type {
  SiteConfig,
  SiteId,
  NavigationItem,
  NavigationChild,
  NavigationSection,
} from "./types";

const sites: Record<SiteId, SiteConfig> = {
  london: londonSite,
  toolkit: toolkitSite,
};

export const activeSite = sites[__SITE_ID__];
export { sites };
export type { SiteConfig, SiteId, NavigationItem, NavigationChild, NavigationSection };
