import type { MenuItem } from "../api/types";

/** Lower case with accents removed, so "creme" finds "Crème". */
export function normalizeSearch(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Searches the item's name and description. An empty query matches everything. */
export function itemMatches(item: MenuItem, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  return normalizeSearch(`${item.name} ${item.description ?? ""}`).includes(q);
}
