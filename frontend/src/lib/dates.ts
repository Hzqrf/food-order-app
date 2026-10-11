export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function minutesSince(iso: string | null | undefined, now = Date.now()): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

// Business days turn over at 4 am, as on the server (DAY_CLOSE_HOUR), so a late-night sale counts
// towards the evening before.
const DAY_CLOSE_HOUR = 4;

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function businessToday(): string {
  return isoDay(new Date(Date.now() - DAY_CLOSE_HOUR * 3_600_000));
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoDay(d);
}

export function monthStart(iso: string): string {
  return `${iso.slice(0, 8)}01`;
}

/** "7 Oct" for chart axes and table rows. */
export function shortDay(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString([], { day: "numeric", month: "short" });
}
