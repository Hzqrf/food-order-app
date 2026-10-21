import type { ShopOut } from "../api/types";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** The shop's local weekday (0 = Sunday) and minutes since midnight. */
function shopClock(timeZone: string, now: Date): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = DAYS.indexOf(get("weekday").toLowerCase().slice(0, 3) as (typeof DAYS)[number]);
  return { day, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/**
 * When the shop closes today, or when it next opens (how many days from now, and that day's key), from the weekly
 * hours in the shop's timezone. A window that ends before it starts runs past midnight.
 * Null when the shop has no hours at all.
 */
export function hoursLine(shop: ShopOut, now = new Date()):
  { allDay: true } | { openUntil: string } | { opensAt: string; dayOffset: number; day: string } | null {
  const { day, minutes } = shopClock(shop.timezone, now);
  const windows = (d: number) => (shop.opening_hours[DAYS[(d + 7) % 7]] ?? []) as string[][];

  // Like the server, a window that starts and ends at the same time means open around the clock.
  if (windows(day).some(([start, end]) => start === end)) return { allDay: true };

  for (const [start, end] of windows(day)) {
    const s = toMinutes(start), e = toMinutes(end);
    if (e > s ? minutes >= s && minutes < e : minutes >= s) return { openUntil: end };
  }
  // Still inside last night's window that runs past midnight.
  for (const [start, end] of windows(day - 1)) {
    if (toMinutes(end) <= toMinutes(start) && minutes < toMinutes(end)) return { openUntil: end };
  }
  for (let offset = 0; offset < 8; offset++) {
    const starts = windows(day + offset).map(([start]) => start)
      .filter((start) => offset > 0 || toMinutes(start) > minutes).sort();
    if (starts.length) return { opensAt: starts[0], dayOffset: offset, day: DAYS[(day + offset) % 7] };
  }
  return null;
}

/** "22:00" becomes "10:00pm". */
export function clockLabel(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 === 0 ? 12 : h % 12}:${hhmm.slice(3, 5)}${h < 12 ? "am" : "pm"}`;
}
