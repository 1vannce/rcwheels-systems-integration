import type { AppScreen } from "./role.type";

export type NavigationItem = {
  screen: AppScreen;
  label: string;
  href: string;
  /**
   * Extra path prefixes that belong to this screen, such as a detail page that
   * is not nested under the menu link. An exact href match always wins.
   */
  activePathPrefixes?: string[];
  /** False until the phase that owns the screen is built. */
  isBuilt: boolean;
};

export type NavigationGroup = {
  title: string;
  items: NavigationItem[];
};
