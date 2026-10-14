/** A change against a comparison value, shaped for MetricCard. Nothing to compare with gives no delta. */
export function percentChange(current: number, previous: number): { delta?: string; direction?: "up" | "down" } {
  if (!previous) return {};
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.05) return { delta: "0%" };
  return { delta: `${Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}%`, direction: pct > 0 ? "up" : "down" };
}
