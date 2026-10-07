/**
 * What this device remembers for a guest: their name and phone, and links to recent orders.
 * Storage can be unavailable (private mode, blocked site data), so every access is guarded and
 * the app works without it.
 */

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export type GuestDetails = { name: string; phone: string };
export type RecentOrder = { token: string; number: string; code?: string; placedAt: string; totalSen: number };

const DETAILS = "guest";
const RECENT = "recent-orders";
const MAX_RECENT = 5;

export const loadDetails = () => readJson<GuestDetails>(DETAILS, { name: "", phone: "" });
export const saveDetails = (d: GuestDetails) => writeJson(DETAILS, d);

export const loadRecent = () => readJson<RecentOrder[]>(RECENT, []);
export function rememberOrder(order: RecentOrder) {
  writeJson(RECENT, [order, ...loadRecent().filter((o) => o.token !== order.token)].slice(0, MAX_RECENT));
}

export function forgetOrder(token: string) {
  writeJson(RECENT, loadRecent().filter((o) => o.token !== token));
}
