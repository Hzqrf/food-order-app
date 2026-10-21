/** A change against a comparison value, shaped for MetricCard. Nothing to compare with gives no delta. */
export function percentChange(current: number, previous: number): { delta?: string; direction?: "up" | "down" } {
  // A percentage of zero or of a loss (profit can go negative) would point the arrow the wrong way.
  if (previous <= 0) return {};
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.05) return { delta: "0%" };
  return { delta: `${Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}%`, direction: pct > 0 ? "up" : "down" };
}

type ProfitTotals = { gross_profit_sen: number; cost_coverage_pct: number | null };

/**
 * Gross profit against the previous period, only when both periods have a cost on every sale.
 * While costs are still being entered, profit covers different shares of sales, so the change
 * would mostly measure coverage, not trading.
 */
export function profitChange(current: ProfitTotals, previous: ProfitTotals): { delta?: string; direction?: "up" | "down" } {
  if (current.cost_coverage_pct !== 100 || previous.cost_coverage_pct !== 100) return {};
  return percentChange(current.gross_profit_sen, previous.gross_profit_sen);
}
