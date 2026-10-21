/** Gross margin in percent (1 decimal), or null when there is no cost or no price to compare. */
export function marginPct(priceSen: number, costSen: number | null): number | null {
  if (costSen === null || priceSen <= 0) return null;
  return Math.round(((priceSen - costSen) / priceSen) * 1000) / 10;
}
