/** Money is an integer number of sen everywhere. These are the only conversions. */

export function formatSen(sen: number): string {
  const sign = sen < 0 ? "-" : "";
  const abs = Math.abs(sen);
  const ringgit = Math.floor(abs / 100).toLocaleString("en-MY");
  return `${sign}RM${ringgit}.${String(abs % 100).padStart(2, "0")}`;
}

export function senToRinggit(sen: number): number {
  return sen / 100;
}

export function ringgitToSen(rm: number | string): number {
  const n = typeof rm === "string" ? Number(rm) : rm;
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
