import { Badge, Button, Group, Paper, SegmentedControl, SimpleGrid, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { type ReportRange, ordersCsvUrl, useReport } from "../../../api/admin";
import { BarChart } from "../../../components/BarChart";
import { ErrorState } from "../../../components/ErrorState";
import { StatTile } from "../../../components/StatTile";
import { addDays, businessToday, formatDateTime, monthStart, shortDay } from "../../../lib/dates";
import { formatSen } from "../../../lib/money";
import { OrderDetailDrawer } from "../../staff/components/OrderDetailDrawer";

type Preset = "today" | "7d" | "30d" | "month" | "custom";

function rangeFor(preset: Preset, custom: { from: string; to: string }) {
  const today = businessToday();
  switch (preset) {
    case "today": return { from: today, to: today };
    case "7d": return { from: addDays(today, -6), to: today };
    case "30d": return { from: addDays(today, -29), to: today };
    case "month": return { from: monthStart(today), to: today };
    default: return custom;
  }
}

const rm = (v: number) => `RM${Math.round(v / 100).toLocaleString()}`;

export default function ReportsPage() {
  const { t } = useTranslation();
  const [preset, setPreset] = useState<Preset>("7d");
  const [custom, setCustom] = useState({ from: addDays(businessToday(), -13), to: businessToday() });
  const [groupBy, setGroupBy] = useState<ReportRange["group_by"]>("day");
  const [openId, setOpenId] = useState<number | null>(null);

  const { from, to } = rangeFor(preset, custom);
  const range = useMemo(() => ({ date_from: from, date_to: to, group_by: groupBy }), [from, to, groupBy]);
  const report = useReport(range);
  const r = report.data;

  const hours = useMemo(() => {
    if (!r) return [];
    const busy = r.hours.filter((h) => h.orders > 0).map((h) => h.hour);
    const lo = busy.length ? Math.min(...busy) : 0;
    const hi = busy.length ? Math.max(...busy) : 23;
    return r.hours.filter((h) => h.hour >= lo && h.hour <= hi);
  }, [r]);

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t("admin.nav.reports")}</Title>
        <Button component="a" href={ordersCsvUrl(range)} download variant="default" leftSection={<IconDownload size={16} />}>
          {t("admin.reports.csv")}
        </Button>
      </Group>

      {/* Date range first, in one row above everything it scopes. */}
      <Group gap="sm" align="flex-end">
        <SegmentedControl value={preset} onChange={(v) => setPreset(v as Preset)} data={[
          { value: "today", label: t("admin.reports.presets.today") },
          { value: "7d", label: t("admin.reports.presets.7d") },
          { value: "30d", label: t("admin.reports.presets.30d") },
          { value: "month", label: t("admin.reports.presets.month") },
          { value: "custom", label: t("admin.reports.presets.custom") },
        ]} />
        {preset === "custom" && (
          <>
            <TextInput type="date" size="xs" aria-label={t("admin.filters.from")} value={custom.from}
              onChange={(e) => setCustom({ ...custom, from: e.currentTarget.value })} />
            <TextInput type="date" size="xs" aria-label={t("admin.filters.to")} value={custom.to}
              onChange={(e) => setCustom({ ...custom, to: e.currentTarget.value })} />
          </>
        )}
        <SegmentedControl size="xs" value={groupBy} onChange={(v) => setGroupBy(v as ReportRange["group_by"])} data={[
          { value: "day", label: t("admin.reports.byDay") },
          { value: "week", label: t("admin.reports.byWeek") },
          { value: "month", label: t("admin.reports.byMonth") },
        ]} />
      </Group>

      {report.isError && !r ? <ErrorState onRetry={() => report.refetch()} /> : !r ? (
        <Text c="dimmed">{t("common.loading")}</Text>
      ) : (
        <Stack style={{ opacity: report.isPlaceholderData ? 0.6 : 1, transition: "opacity 150ms" }}>
          <SimpleGrid cols={{ base: 2, md: 4 }}>
            <StatTile label={t("admin.reports.sales")} value={formatSen(r.totals.sales_sen)} />
            <StatTile label={t("admin.today.orders")} value={String(r.totals.orders)} />
            <StatTile label={t("admin.today.avgOrder")} value={formatSen(r.totals.avg_order_sen)} />
            <StatTile label={t("admin.today.online")}
              value={`${r.totals.orders ? Math.round((r.totals.online_orders / r.totals.orders) * 100) : 0}%`}
              hint={t("admin.today.onlineHint", { online: r.totals.online_orders, counter: r.totals.counter_orders })} />
          </SimpleGrid>
          <Text size="xs" c="dimmed">{t("admin.reports.salesDefinition")}</Text>

          <SimpleGrid cols={{ base: 1, lg: 2 }}>
            <BarChart title={t(`admin.reports.salesBy.${groupBy}`)} valueLabel={t("admin.reports.sales")}
              format={formatSen} axisFormat={rm}
              data={r.periods.map((p) => ({
                key: p.period,
                label: groupBy === "day" ? shortDay(p.start) : groupBy === "week" ? shortDay(p.start) : p.period,
                detail: `${groupBy === "week" ? t("admin.reports.weekOf", { day: shortDay(p.start) }) : groupBy === "day" ? shortDay(p.start) : p.period} · ${t("admin.reports.ordersCount", { count: p.orders })}`,
                value: p.sales_sen,
              }))} />
            <BarChart title={t("admin.reports.byHour")} valueLabel={t("admin.reports.avgPerDay")}
              format={formatSen} axisFormat={rm}
              data={hours.map((h) => ({
                key: String(h.hour), label: `${h.hour}`,
                detail: `${String(h.hour).padStart(2, "0")}:00–${String(h.hour + 1).padStart(2, "0")}:00 · ${t("admin.reports.ordersCount", { count: h.orders })}`,
                value: h.avg_daily_sales_sen,
              }))} />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, lg: 2 }}>
            <Paper withBorder p="md">
              <Title order={5} mb="xs">{t("admin.reports.items")}</Title>
              <Table.ScrollContainer minWidth={300} mah={360}>
                <Table striped stickyHeader>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("admin.reports.item")}</Table.Th>
                      <Table.Th ta="right">{t("admin.reports.qty")}</Table.Th>
                      <Table.Th ta="right">{t("admin.reports.sales")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {r.items.map((i) => (
                      <Table.Tr key={i.menu_item_id} c={i.quantity === 0 ? "dimmed" : undefined}>
                        <Table.Td>
                          {i.name}{" "}
                          {i.quantity === 0 && <Badge size="xs" color="gray" variant="light">{t("admin.reports.notSold")}</Badge>}
                        </Table.Td>
                        <Table.Td ta="right" style={{ fontVariantNumeric: "tabular-nums" }}>{i.quantity}</Table.Td>
                        <Table.Td ta="right" style={{ fontVariantNumeric: "tabular-nums" }}>{formatSen(i.sales_sen)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Paper>

            <Stack>
              <Paper withBorder p="md">
                <Title order={5} mb="xs">{t("admin.reports.channels")}</Title>
                <Table>
                  <Table.Tbody>
                    {r.channels.length === 0 && <Table.Tr><Table.Td c="dimmed">—</Table.Td></Table.Tr>}
                    {r.channels.map((c) => (
                      <Table.Tr key={c.channel}>
                        <Table.Td>{t(`channel.${c.channel}`)}</Table.Td>
                        <Table.Td ta="right">{t("admin.reports.ordersCount", { count: c.orders })}</Table.Td>
                        <Table.Td ta="right" style={{ fontVariantNumeric: "tabular-nums" }}>{formatSen(c.sales_sen)}</Table.Td>
                        <Table.Td ta="right" c="dimmed">
                          {r.totals.sales_sen ? Math.round((c.sales_sen / r.totals.sales_sen) * 100) : 0}%
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Paper>
              <Paper withBorder p="md">
                <Title order={5}>{t("admin.reports.payments")}</Title>
                <Text size="xs" c="dimmed" mb="xs">{t("admin.reports.paymentsHint")}</Text>
                <Table.ScrollContainer minWidth={420}>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>{t("admin.reports.method")}</Table.Th>
                        <Table.Th ta="right">{t("admin.reports.in")}</Table.Th>
                        <Table.Th ta="right">{t("admin.reports.refunded")}</Table.Th>
                        <Table.Th ta="right">{t("admin.reports.net")}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {r.payments.map((p) => (
                        <Table.Tr key={p.method}>
                          <Table.Td>{t(`paymentMethod.${p.method}`)}</Table.Td>
                          <Table.Td ta="right" style={{ fontVariantNumeric: "tabular-nums" }}>{formatSen(p.charged_sen)}</Table.Td>
                          <Table.Td ta="right" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {p.refunded_sen ? `−${formatSen(p.refunded_sen)}` : "—"}
                          </Table.Td>
                          <Table.Td ta="right" fw={600} style={{ fontVariantNumeric: "tabular-nums" }}>{formatSen(p.net_sen)}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              </Paper>
            </Stack>
          </SimpleGrid>

          <Paper withBorder p="md">
            <Title order={5} mb="xs">{t("admin.reports.cancellations")}</Title>
            <Group gap="xl" mb="sm">
              <div>
                <Text fz={22} fw={700}>{r.cancellations.by_shop}</Text>
                <Text size="sm" c="dimmed">{t("admin.reports.cancelledByShop", { value: formatSen(r.cancellations.by_shop_value_sen) })}</Text>
              </div>
              <div>
                <Text fz={22} fw={700}>{r.cancellations.refunds}</Text>
                <Text size="sm" c="dimmed">{t("admin.reports.refundsMade", { value: formatSen(r.cancellations.refunded_sen) })}</Text>
              </div>
              <div>
                <Text fz={22} fw={700} c="dimmed">{r.cancellations.unpaid}</Text>
                <Text size="sm" c="dimmed">{t("admin.reports.unpaidOnline")}</Text>
              </div>
            </Group>
            {r.cancellations.rows.length > 0 && (
              <Table.ScrollContainer minWidth={600}>
                <Table highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("admin.orders.number")}</Table.Th>
                      <Table.Th>{t("admin.orders.time")}</Table.Th>
                      <Table.Th>{t("cancel.reason")}</Table.Th>
                      <Table.Th>{t("admin.reports.by")}</Table.Th>
                      <Table.Th ta="right">{t("common.total")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {r.cancellations.rows.map((c) => (
                      <Table.Tr key={c.order.id} style={{ cursor: "pointer" }} onClick={() => setOpenId(c.order.id)}>
                        <Table.Td fw={700}>{c.order.order_number} <Text span size="xs" c="dimmed" ff="monospace">{c.order.order_code}</Text></Table.Td>
                        <Table.Td>{formatDateTime(c.cancelled_at)}</Table.Td>
                        <Table.Td>{c.reason}</Table.Td>
                        <Table.Td c="dimmed">{c.cancelled_by ? t(`actor.${c.cancelled_by}`, { defaultValue: c.cancelled_by }) : "—"}</Table.Td>
                        <Table.Td ta="right">
                          {formatSen(c.order.total_sen)}{" "}
                          {c.order.payment_status === "paid" && <Badge size="xs" color="red">{t("admin.reports.notRefunded")}</Badge>}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Paper>
        </Stack>
      )}
      <OrderDetailDrawer orderId={openId} onClose={() => setOpenId(null)} />
    </Stack>
  );
}
