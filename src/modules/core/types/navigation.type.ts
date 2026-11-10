import type { AppScreen } from "./role.type";

export type NavigationItem = {
  screen: AppScreen;
  label: string;
  href: string;
  /** False until the phase that owns the screen is built. */
  isBuilt: boolean;
};

export type NavigationGroup = {
  title: string;
  items: NavigationItem[];
};
