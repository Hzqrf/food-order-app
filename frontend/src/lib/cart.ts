import type { CartLineIn, MenuItem, MenuOut } from "../api/types";

/** A cart line holds ids only. Prices here are for display; the server re-prices every order. */
export type CartLine = {
  key: string;
  itemId: number;
  optionIds: number[];
  quantity: number;
  note?: string;
};

export function lineKey(itemId: number, optionIds: number[]): string {
  return `${itemId}:${[...optionIds].sort((a, b) => a - b).join(",")}`;
}

export function indexMenu(menu: MenuOut | undefined): Map<number, MenuItem> {
  const map = new Map<number, MenuItem>();
  menu?.categories.forEach((c) => c.items.forEach((i) => map.set(i.id, i)));
  return map;
}

export function unitPrice(item: MenuItem, optionIds: number[]): number {
  const deltas = item.groups.flatMap((g) => g.options).filter((o) => optionIds.includes(o.id));
  return item.price_sen + deltas.reduce((sum, o) => sum + o.price_delta_sen, 0);
}

export function optionNames(item: MenuItem, optionIds: number[], name: (o: { name: string; name_ms?: string | null }) => string) {
  return item.groups
    .flatMap((g) => g.options)
    .filter((o) => optionIds.includes(o.id))
    .map(name)
    .join(", ");
}

export function cartTotal(lines: CartLine[], items: Map<number, MenuItem>): number {
  return lines.reduce((sum, l) => {
    const item = items.get(l.itemId);
    return item ? sum + unitPrice(item, l.optionIds) * l.quantity : sum;
  }, 0);
}

export function toRequestLines(lines: CartLine[]): CartLineIn[] {
  return lines.map((l) => ({
    menu_item_id: l.itemId,
    quantity: l.quantity,
    option_ids: l.optionIds,
    note: l.note || null,
  }));
}

export function needsOptionsSheet(item: MenuItem): boolean {
  return item.groups.some((g) => g.min_select > 0);
}
