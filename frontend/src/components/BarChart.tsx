import { Box, Group, Paper, SegmentedControl, Table, Text, Title } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export type Bar = { key: string; label: string; detail?: string; value: number };

// One series, one hue: Mantine orange 8. Validated for >= 3:1 against the white surface.
const BAR = "#e8590c";
const BAR_HOVER = "#c2410c";
const GRID = "var(--mantine-color-gray-2)";
const MAX_BAR = 24;
const M = { top: 12, right: 8, bottom: 24, left: 56 };

function niceStep(max: number, ticks: number): number {
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

/**
 * A single-series column chart in plain SVG. Bars are at most 24px wide with a 4px rounded top and
 * a square foot on the baseline; each column's full height is its hover/focus target. A table view
 * carries every value for readers who can't or don't want to hover.
 */
export function BarChart({ title, data, format, axisFormat, height = 220, valueLabel }: {
  title: string;
  data: Bar[];
  format: (v: number) => string;
  axisFormat?: (v: number) => string;
  height?: number;
  valueLabel: string;
}) {
  const { t } = useTranslation();
  const { ref, width } = useElementSize();
  const [view, setView] = useState<"chart" | "table">("chart");
  const [active, setActive] = useState<number | null>(null);

  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = height - M.top - M.bottom;
  const max = Math.max(...data.map((d) => d.value), 0);
  const step = max > 0 ? niceStep(max, 4) : 1;
  const top = max > 0 ? Math.ceil(max / step) * step : 4;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const band = data.length ? innerW / data.length : 0;
  const barW = Math.min(MAX_BAR, Math.max(2, band - 2)); // keep at least a 2px gap between neighbours
  const y = (v: number) => M.top + innerH - (v / top) * innerH;
  // Thin the x labels so they never collide (~44px per label).
  const every = Math.max(1, Math.ceil((data.length * 44) / Math.max(innerW, 1)));
  const hovered = active !== null ? data[active] : null;

  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="xs">
        <Title order={5}>{title}</Title>
        <SegmentedControl size="xs" value={view} onChange={(v) => setView(v as "chart" | "table")}
          data={[{ value: "chart", label: t("charts.chart") }, { value: "table", label: t("charts.table") }]} />
      </Group>
      {view === "table" ? (
        <Table.ScrollContainer minWidth={240} mah={height + 40}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th />
                <Table.Th ta="right">{valueLabel}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.map((d) => (
                <Table.Tr key={d.key}>
                  <Table.Td>{d.detail ?? d.label}</Table.Td>
                  <Table.Td ta="right" style={{ fontVariantNumeric: "tabular-nums" }}>{format(d.value)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      ) : (
        <Box ref={ref} pos="relative" h={height}>
          {width > 0 && (
            <svg width={width} height={height} role="img" aria-label={title} style={{ display: "block" }}>
              {ticks.map((v) => (
                <g key={v}>
                  <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
                  <text x={M.left - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11}
                    fill="var(--mantine-color-dimmed)" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {(axisFormat ?? format)(v)}
                  </text>
                </g>
              ))}
              {data.map((d, i) => {
                const cx = M.left + band * i + band / 2;
                const h = (d.value / top) * innerH;
                const x0 = cx - barW / 2;
                const base = M.top + innerH;
                const r = Math.min(4, barW / 2, h);
                return (
                  <g key={d.key}>
                    {h > 0 && (
                      <path fill={active === i ? BAR_HOVER : BAR}
                        d={`M${x0},${base} V${base - h + r} Q${x0},${base - h} ${x0 + r},${base - h} H${x0 + barW - r} Q${x0 + barW},${base - h} ${x0 + barW},${base - h + r} V${base} Z`} />
                    )}
                    {/* Count back from the newest bar so the latest period is always labelled. */}
                    {(data.length - 1 - i) % every === 0 && (
                      <text x={cx} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--mantine-color-dimmed)">
                        {d.label}
                      </text>
                    )}
                    {/* The whole column is the target: easier than hitting a thin bar. */}
                    <rect x={M.left + band * i} y={M.top} width={band} height={innerH} fill="transparent"
                      tabIndex={0} aria-label={`${d.detail ?? d.label}: ${format(d.value)}`}
                      onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)}
                      onFocus={() => setActive(i)} onBlur={() => setActive(null)} style={{ outline: "none" }} />
                  </g>
                );
              })}
            </svg>
          )}
          {hovered && active !== null && (
            <Paper shadow="sm" withBorder px="xs" py={4} pos="absolute" style={{
              pointerEvents: "none", top: 0,
              left: Math.min(Math.max(M.left + band * active + band / 2 - 60, 0), Math.max(width - 120, 0)),
            }}>
              <Text fw={700} size="sm">{format(hovered.value)}</Text>
              <Text size="xs" c="dimmed">{hovered.detail ?? hovered.label}</Text>
            </Paper>
          )}
        </Box>
      )}
    </Paper>
  );
}
