import { Badge, Button, Group, Select, SimpleGrid, Stack, Table, Text, TextInput } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconDownload, IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { type OrderFilters, ordersCsvUrl, useAdminOrders, useReport, useStaffList } from "../../../api/admin";
import type { Report } from "../../../api/types";
import { BarChart } from "../../../components/BarChart";
import { ErrorState } from "../../../components/ErrorState";
import { formatDateTime, shortDay } from "../../../lib/dates";
import { formatSen } from "../../../lib/money";
import { percentChange } from "../console/delta";
import { MetricCard } from "../console/MetricCard";
import { PageHeader } from "../console/PageHeader";
import { defaultPeriod, type Period, PeriodPicker } from "../console/PeriodPicker";
import { RankedBars } from "../console/RankedBars";
import { SectionCard } from "../console/SectionCard";
import { StatusLabel } from "../console/StatusLabel";

const STATUSES = ["pending_payment", "placed", "preparing", "ready", "completed", "cancelled"];
const PAYMENT_STATUSES = ["unpaid", "paid", "refunded"];
const CHANNELS = ["online", "counter", "phone"];
const rm = (v: number) => `RM${Math.round(v / 100).toLocaleString()}`;

/** Gross through to net for a period, how customers paid, and every order in it. */
export default function SalesHistoryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>(() => defaultPeriod("daily"));
  const range = useMemo(() => ({ date_from: period.date_from, date_to: period.date_to, group_by: "day" as const }),
    [period.date_from, period.date_to]);
  const report = useReport(range);
  const r = report.data;

  const [filters, setFilters] = useState<OrderFilters>({});
  const [q, setQ] = useState("");
  const [debouncedQ] = useDebouncedValue(q.trim(), 300);
  const { data: staff = [] } = useStaffList();
  const orders = useAdminOrders({ ...filters, q: debouncedQ, date_from: period.date_from, date_to: period.date_to });
  const rows = orders.data?.pages.flatMap((p) => p.orders) ?? [];
  const set = (k: keyof OrderFilters) => (v: string | null) => setFilters((f) => ({ ...f, [k]: v ?? undefined }));

  const oneDay = period.date_from === period.date_to;
  // Profit only counts lines sold with a cost; say how much of the period that is until it's all costed.
  const profitLabel = (totals: Report["totals"]) => {
    if (totals.cost_coverage_pct === null) return t("console.cost.noSales");
    if (totals.cost_coverage_pct < 100) return t("console.cost.coverageLabel", { pct: totals.cost_coverage_pct });
    return t("console.cost.marginLabel", { pct: totals.margin_pct ?? 0 });
  };
  const periodLabel = oneDay ? shortDay(period.date_from) : `${shortDay(period.date_from)} – ${shortDay(period.date_to)}`;
  const compare = t(oneDay ? "console.sales.vsDayBefore" : "console.sales.vsPreviousPeriod");

  const chart = r && (oneDay ? (() => {
    const busy = r.hours.filter((h) => h.orders > 0).map((h) => h.hour);
    const lo = busy.length ? Math.min(...busy) : 10;
    const hi = busy.length ? Math.max(...busy) : 22;
    return r.hours.filter((h) => h.hour >= lo && h.hour <= hi).map((h) => ({
      key: String(h.hour), label: String(h.hour),
      detail: `${String(h.hour).padStart(2, "0")}:00 · ${t("admin.reports.ordersCount", { count: h.orders })}`,
      value: h.sales_sen,
    }));
  })() : r.periods.map((p) => ({
    key: p.period, label: shortDay(p.start),
    detail: `${shortDay(p.start)} · ${t("admin.reports.ordersCount", { count: p.orders })}`, value: p.sales_sen,
  })));

  return (
    <Stack gap={20}>
      <PageHeader title={t("console.sales.title")} subtitle={t("console.sales.subtitle")} />
      <SectionCard>
        <Group justify="space-between" gap="md" wrap="wrap">
          <PeriodPicker value={period} onChange={setPeriod} />
          <Group gap="sm">
            <Text fz={13} c="dimmed">{periodLabel}</Text>
            <Button component="a" href={ordersCsvUrl(range)} download variant="light" color="gray"
              leftSection={<IconDownload size={16} />}>
              {t("admin.reports.csv")}
            </Button>
          </Group>
        </Group>
      </SectionCard>

      {report.isError && !r ? <ErrorState onRetry={() => report.refetch()} /> : !r ? (
        <Text c="dimmed">{t("common.loading")}</Text>
      ) : (
        <Stack gap={20} style={{ opacity: report.isPlaceholderData ? 0.6 : 1, transition: "opacity 150ms" }}>
          <SimpleGrid cols={{ base: 2, md: 4 }} spacing={{ base: 12, sm: 20 }}>
            <MetricCard label={t("console.sales.gross")} value={formatSen(r.totals.gross_sen)}
              {...percentChange(r.totals.gross_sen, r.previous.gross_sen)} deltaLabel={compare} />
            <MetricCard label={t("console.sales.refunds")} value={formatSen(r.totals.refunds_sen)} good="down"
              {...percentChange(r.totals.refunds_sen, r.previous.refunds_sen)} deltaLabel={compare} />
            <MetricCard label={t("console.sales.net")} value={formatSen(r.totals.net_sen)}
              {...percentChange(r.totals.net_sen, r.previous.net_sen)}
              deltaLabel={t("console.sales.ordersHint", { count: r.totals.orders })} />
            <MetricCard label={t("console.cost.grossProfit")} value={formatSen(r.totals.gross_profit_sen)}
              {...percentChange(r.totals.gross_profit_sen, r.previous.gross_profit_sen)}
              deltaLabel={profitLabel(r.totals)} />
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={20}>
            <BarChart title={t(oneDay ? "console.sales.byHour" : "console.sales.byDay")} sub={periodLabel}
              valueLabel={t("admin.reports.sales")} format={formatSen} axisFormat={rm} data={chart ?? []} />
            <SectionCard title={t("console.sales.paymentMethods")}>
              <RankedBars format={formatSen}
                rows={r.payments.map((p) => ({ label: t(`paymentMethod.${p.method}`), value: p.net_sen }))}
                headers={[t("admin.reports.method"), t("console.sales.shareOfNet"), t("admin.reports.net"), t("console.dashboard.share")]} />
              <Text fz={12} c="dimmed" mt="sm">{t("admin.reports.paymentsHint")}</Text>
            </SectionCard>
          </SimpleGrid>
        </Stack>
      )}

      <SectionCard padded={false} title={t("console.sales.history")}
        actions={<TextInput w={{ base: "100%", sm: 280 }} placeholder={t("search.placeholder")} aria-label={t("admin.filters.search")}
          leftSection={<IconSearch size={16} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} />}>
        <Group gap="xs" px={24} pt={16} wrap="wrap">
          <Select size="sm" clearable placeholder={t("admin.filters.status")} w={170} aria-label={t("admin.filters.status")}
            data={STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))} value={filters.status ?? null} onChange={set("status")} />
          <Select size="sm" clearable placeholder={t("admin.filters.payment")} w={150} aria-label={t("admin.filters.payment")}
            data={PAYMENT_STATUSES.map((s) => ({ value: s, label: t(`paymentStatus.${s}`) }))}
            value={filters.payment_status ?? null} onChange={set("payment_status")} />
          <Select size="sm" clearable placeholder={t("admin.filters.channel")} w={150} aria-label={t("admin.filters.channel")}
            data={CHANNELS.map((c) => ({ value: c, label: t(`channel.${c}`) }))} value={filters.channel ?? null} onChange={set("channel")} />
          <Select size="sm" clearable placeholder={t("admin.filters.staff")} w={160} aria-label={t("admin.filters.staff")}
            data={staff.map((s) => ({ value: String(s.id), label: s.full_name }))} value={filters.staff_id ?? null}
            onChange={set("staff_id")} />
        </Group>
        {orders.isError ? <ErrorState onRetry={() => orders.refetch()} /> : (
          <Table.ScrollContainer minWidth={760} style={{ opacity: orders.isPlaceholderData ? 0.6 : 1 }}>
            <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="lg" mt="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("admin.orders.time")}</Table.Th>
                  <Table.Th>{t("admin.orders.number")}</Table.Th>
                  <Table.Th>{t("admin.filters.channel")}</Table.Th>
                  <Table.Th>{t("admin.orders.keyedBy")}</Table.Th>
                  <Table.Th>{t("admin.filters.status")}</Table.Th>
                  <Table.Th>{t("admin.filters.payment")}</Table.Th>
                  <Table.Th ta="right">{t("common.total")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((o) => (
                  <Table.Tr key={o.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/staff/orders/${o.id}`)}>
                    <Table.Td>{formatDateTime(o.placed_at ?? o.created_at)}</Table.Td>
                    <Table.Td fw={600}>#{o.order_number} <Text span fz={12} c="dimmed" ff="monospace">{o.order_code}</Text></Table.Td>
                    <Table.Td>{t(`channel.${o.channel}`)}</Table.Td>
                    <Table.Td c="dimmed">{o.created_by_name ?? "—"}</Table.Td>
                    <Table.Td><StatusLabel kind="status" value={o.status} /></Table.Td>
                    <Table.Td>
                      <Badge variant="outline" color={o.payment_status === "paid" ? "green" : "gray"}>
                        {t(`paymentStatus.${o.payment_status}`)}
                      </Badge>
                    </Table.Td>
                    <Table.Td ta="right" fw={600} style={{ fontVariantNumeric: "tabular-nums" }}>{formatSen(o.total_sen)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
        {!orders.isPending && rows.length === 0 && <Text c="dimmed" p="md" px={24}>{t("search.none")}</Text>}
        {orders.hasNextPage && (
          <Group p={16} justify="center">
            <Button variant="light" color="gray" onClick={() => orders.fetchNextPage()} loading={orders.isFetchingNextPage}>
              {t("admin.loadMore")}
            </Button>
          </Group>
        )}
      </SectionCard>
    </Stack>
  );
}
