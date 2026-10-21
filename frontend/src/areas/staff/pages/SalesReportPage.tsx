import { Badge, Group, Stack, Table, Tabs, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { useReport } from "../../../api/admin";
import { ErrorState } from "../../../components/ErrorState";
import { formatDateTime, shortDay } from "../../../lib/dates";
import { formatSen } from "../../../lib/money";
import { PageHeader } from "../console/PageHeader";
import { defaultPeriod, type Period, PeriodPicker } from "../console/PeriodPicker";
import { SectionCard } from "../console/SectionCard";
import { tokens } from "../../../ui/tokens";

const METHODS = ["cash", "qr_counter", "card_terminal", "gateway"] as const;
const num = { style: { fontVariantNumeric: "tabular-nums" as const } };
const peak = (h: number | null) => (h === null ? "—" : `${String(h).padStart(2, "0")}:00–${String(h + 1).padStart(2, "0")}:00`);

/** Takings broken down by day, by item, by channel, plus what was cancelled. */
export default function SalesReportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>(() => defaultPeriod("monthly"));
  const range = useMemo(() => ({ date_from: period.date_from, date_to: period.date_to, group_by: "day" as const }),
    [period.date_from, period.date_to]);
  const report = useReport(range);
  const r = report.data;
  const periodLabel = period.date_from === period.date_to ? shortDay(period.date_from)
    : `${shortDay(period.date_from)} – ${shortDay(period.date_to)}`;

  return (
    <Stack gap={20}>
      <PageHeader title={t("console.report.title")} subtitle={t("console.report.subtitle")} />
      <SectionCard>
        <Group justify="space-between" gap="md" wrap="wrap">
          <PeriodPicker value={period} onChange={setPeriod} />
          <Text fz={13} c="dimmed">{periodLabel}</Text>
        </Group>
      </SectionCard>

      {report.isError && !r ? <ErrorState onRetry={() => report.refetch()} /> : !r ? (
        <Text c="dimmed">{t("common.loading")}</Text>
      ) : (
        <Tabs defaultValue="day" variant="pills" keepMounted={false} style={{ opacity: report.isPlaceholderData ? 0.6 : 1 }}>
          <Tabs.List mb={20}>
            <Tabs.Tab value="day">{t("console.report.byDay")}</Tabs.Tab>
            <Tabs.Tab value="item">{t("console.report.byItem")}</Tabs.Tab>
            <Tabs.Tab value="channel">{t("admin.reports.channels")}</Tabs.Tab>
            <Tabs.Tab value="cancelled">{t("admin.reports.cancellations")}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="day">
            <SectionCard padded={false}>
              <Table.ScrollContainer minWidth={1060}>
                <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="lg">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("console.report.date")}</Table.Th>
                      <Table.Th ta="right">{t("console.dashboard.orders")}</Table.Th>
                      <Table.Th ta="right">{t("console.sales.gross")}</Table.Th>
                      <Table.Th ta="right">{t("console.sales.refunds")}</Table.Th>
                      <Table.Th ta="right">{t("console.sales.net")}</Table.Th>
                      <Table.Th ta="right">{t("console.cost.grossProfit")}</Table.Th>
                      {METHODS.map((m) => <Table.Th key={m} ta="right">{t(`paymentMethod.${m}`)}</Table.Th>)}
                      <Table.Th>{t("console.report.peakHour")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {r.periods.map((p) => {
                      // Money that moved on this day's orders: gross in, refunds out, net kept.
                      const net = Object.values(p.methods).reduce((sum, v) => sum + v, 0);
                      return (
                      <Table.Tr key={p.period} c={p.orders === 0 && !p.refunds_sen ? "dimmed" : undefined}>
                        <Table.Td>{shortDay(p.start)}</Table.Td>
                        <Table.Td ta="right" {...num}>{p.orders}</Table.Td>
                        <Table.Td ta="right" {...num}>{formatSen(net + p.refunds_sen)}</Table.Td>
                        <Table.Td ta="right" {...num}>{p.refunds_sen ? `−${formatSen(p.refunds_sen)}` : "—"}</Table.Td>
                        <Table.Td ta="right" fw={600} {...num}>{formatSen(net)}</Table.Td>
                        <Table.Td ta="right" {...num}>{p.gross_profit_sen ? formatSen(p.gross_profit_sen) : "—"}</Table.Td>
                        {METHODS.map((m) => (
                          <Table.Td key={m} ta="right" {...num}>{p.methods[m] ? formatSen(p.methods[m]) : "—"}</Table.Td>
                        ))}
                        <Table.Td>{peak(p.peak_hour)}</Table.Td>
                      </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                  <Table.Tfoot>
                    <Table.Tr fw={600}>
                      <Table.Td>{t("common.total")}</Table.Td>
                      <Table.Td ta="right" {...num}>{r.totals.orders}</Table.Td>
                      <Table.Td ta="right" {...num}>{formatSen(r.totals.gross_sen)}</Table.Td>
                      <Table.Td ta="right" {...num}>{r.totals.refunds_sen ? `−${formatSen(r.totals.refunds_sen)}` : "—"}</Table.Td>
                      <Table.Td ta="right" {...num}>{formatSen(r.totals.net_sen)}</Table.Td>
                      <Table.Td ta="right" {...num}>{formatSen(r.totals.gross_profit_sen)}</Table.Td>
                      {METHODS.map((m) => {
                        const total = r.periods.reduce((s, p) => s + (p.methods[m] ?? 0), 0);
                        return <Table.Td key={m} ta="right" {...num}>{formatSen(total)}</Table.Td>;
                      })}
                      <Table.Td />
                    </Table.Tr>
                  </Table.Tfoot>
                </Table>
              </Table.ScrollContainer>
              <Text fz={12} c="dimmed" px={24} pt={12}>{t("console.report.moneyDefinition")}</Text>
              <Text fz={12} c="dimmed" px={24} pb={12}>{t("console.cost.profitDefinition")}</Text>
            </SectionCard>
          </Tabs.Panel>

          <Tabs.Panel value="item">
            <SectionCard padded={false}>
              <Table.ScrollContainer minWidth={680}>
                <Table striped verticalSpacing="sm" horizontalSpacing="lg">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t("admin.reports.item")}</Table.Th>
                      <Table.Th>{t("admin.menu.category")}</Table.Th>
                      <Table.Th ta="right">{t("admin.reports.qty")}</Table.Th>
                      <Table.Th ta="right">{t("admin.reports.sales")}</Table.Th>
                      <Table.Th ta="right">{t("console.cost.cost")}</Table.Th>
                      <Table.Th ta="right">{t("console.cost.profit")}</Table.Th>
                      <Table.Th ta="right">{t("console.cost.margin")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {r.items.map((i) => (
                      <Table.Tr key={i.menu_item_id} c={i.quantity === 0 ? "dimmed" : undefined}>
                        <Table.Td>
                          {i.name}{" "}
                          {i.quantity === 0 && <Badge size="xs" color="gray" variant="light">{t("admin.reports.notSold")}</Badge>}
                          {i.quantity > 0 && !i.costed && (
                            <Badge size="xs" color="yellow" variant="light">{t("console.cost.notSet")}</Badge>
                          )}
                        </Table.Td>
                        <Table.Td c={tokens.muted}>{i.category ?? "—"}</Table.Td>
                        <Table.Td ta="right" {...num}>{i.quantity}</Table.Td>
                        <Table.Td ta="right" {...num}>{formatSen(i.sales_sen)}</Table.Td>
                        <Table.Td ta="right" {...num}>{i.cost_sen ? formatSen(i.cost_sen) : "—"}</Table.Td>
                        <Table.Td ta="right" {...num}>{i.margin_pct === null ? "—" : formatSen(i.gross_profit_sen)}</Table.Td>
                        <Table.Td ta="right" {...num} c={i.margin_pct !== null && i.margin_pct < 0 ? "red.7" : undefined}>
                          {i.margin_pct === null ? "—" : `${i.margin_pct}%`}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </SectionCard>
          </Tabs.Panel>

          <Tabs.Panel value="channel">
            <SectionCard padded={false}>
              <Table verticalSpacing="sm" horizontalSpacing="lg">
                <Table.Tbody>
                  {r.channels.length === 0 && <Table.Tr><Table.Td c="dimmed">—</Table.Td></Table.Tr>}
                  {r.channels.map((c) => (
                    <Table.Tr key={c.channel}>
                      <Table.Td>{t(`channel.${c.channel}`)}</Table.Td>
                      <Table.Td ta="right">{t("admin.reports.ordersCount", { count: c.orders })}</Table.Td>
                      <Table.Td ta="right" {...num}>{formatSen(c.sales_sen)}</Table.Td>
                      <Table.Td ta="right" c="dimmed">
                        {r.totals.sales_sen ? Math.round((c.sales_sen / r.totals.sales_sen) * 100) : 0}%
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </SectionCard>
          </Tabs.Panel>

          <Tabs.Panel value="cancelled">
            <SectionCard padded={false}>
              <Group gap="xl" px={24} py={20}>
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
                  <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="lg">
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
                        <Table.Tr key={c.order.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/staff/orders/${c.order.id}`)}>
                          <Table.Td fw={600}>#{c.order.order_number} <Text span size="xs" c="dimmed" ff="monospace">{c.order.order_code}</Text></Table.Td>
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
            </SectionCard>
          </Tabs.Panel>
        </Tabs>
      )}
    </Stack>
  );
}
