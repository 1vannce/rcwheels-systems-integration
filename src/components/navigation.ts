import type { NavigationGroup, NavigationItem } from "@/modules/core";

/**
 * The menu entry that owns the current path. An exact menu link wins; then a
 * detail page falls back to its list, including `activePathPrefixes` entries
 * that are not nested under the menu link (for example a request detail page).
 */
export function findActiveNavigationItem(
  groups: NavigationGroup[],
  pathname: string,
): NavigationItem | undefined {
  const items = groups.flatMap((group) => group.items);
  const exact = items.find((item) => item.href === pathname);

  if (exact) {
    return exact;
  }

  return items.find(
    (item) =>
      pathname.startsWith(`${item.href}/`) ||
      item.activePathPrefixes?.some((prefix) => pathname.startsWith(prefix)),
  );
}
