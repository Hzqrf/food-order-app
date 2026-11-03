import { Badge, SegmentedControl, SimpleGrid, Stack, Table, Text } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { type CustomerSort, useCustomerReport } from "../../../api/admin";
import type { Report } from "../../../api/types";
import { ErrorState } from "../../../components/ErrorState";
import { formatDateTime } from "../../../lib/dates";
import { formatSen } from "../../../lib/money";
import { tokens } from "../../../ui/tokens";
import { MetricCard } from "../console/MetricCard";
import { SectionCard } from "../console/SectionCard";

const num = { style: { fontVariantNumeric: "tabular-nums" as const } };
const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

/** Sales credited to whoever cooked them. Rows add up to the report's Sales figure. */
export function StaffPanel({ rows }: { rows: Report["staff"] }) {
  const { t } = useTranslation();
  if (rows.length === 0) return <Text c="dimmed">{t("console.report.empty")}</Text>;
  return (
    <SectionCard padded={false}>
      <Table.ScrollContainer minWidth={560}>
        <Table striped verticalSpacing="sm" horizontalSpacing="lg">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("console.report.staff")}</Table.Th>
              <Table.Th ta="right">{t("console.report.ordersCooked")}</Table.Th>
              <Table.Th ta="right">{t("admin.reports.sales")}</Table.Th>
              <Table.Th ta="right">{t("console.report.share")}</Table.Th>
              <Table.Th ta="right">{t("console.report.avgCook")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.user_id ?? "unassigned"}>
                <Table.Td c={r.user_id === null ? tokens.muted : undefined}>
                  {r.name ?? t("console.report.unassigned")}
                </Table.Td>
                <Table.Td ta="right" {...num}>{r.orders}</Table.Td>
                <Table.Td ta="right" {...num}>{formatSen(r.sales_sen)}</Table.Td>
                <Table.Td ta="right" {...num}>{pct(r.share_pct)}</Table.Td>
                <Table.Td ta="right" {...num}>
                  {r.avg_cook_minutes === null ? "—"
                    : t("console.queue.metrics.minutes", { count: Math.round(r.avg_cook_minutes) })}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </SectionCard>
  );
}

/** Online customers by partly hidden phone number. Mounted only while its tab is open. */
export function CustomerPanel({ range }: { range: { date_from: string; date_to: string } }) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<CustomerSort>("spent");
  const report = useCustomerReport(range, sort);
  const c = report.data;
  if (report.isError && !c) return <ErrorState onRetry={() => report.refetch()} />;
  if (!c) return <Text c="dimmed">{t("common.loading")}</Text>;
  return (
    <Stack gap={20}>
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing={{ base: 12, sm: 20 }}>
        <MetricCard label={t("console.report.customers")} value={String(c.customers)} />
        <MetricCard label={t("console.report.returning")} value={String(c.returning)}
          deltaLabel={c.repeat_rate_pct === null ? undefined : t("console.report.repeatRate", { pct: c.repeat_rate_pct })} />
        <MetricCard label={t("console.report.spendPerCustomer")}
          value={c.spend_per_customer_sen === null ? "—" : formatSen(c.spend_per_customer_sen)} />
        <MetricCard label={t("console.report.phoneGiven")} value={pct(c.phone_coverage_pct)}
          deltaLabel={c.phone_coverage_pct === null ? undefined
            : t("console.report.phoneCoverage", { pct: c.phone_coverage_pct })} />
      </SimpleGrid>
      <SectionCard padded={false}>
        <Stack gap={0}>
          <SegmentedControl m="md" w="fit-content" value={sort} onChange={(v) => setSort(v as CustomerSort)}
            data={[
              { value: "spent", label: t("console.report.spent") },
              { value: "orders", label: t("console.report.orders") },
              { value: "last", label: t("console.report.lastVisit") },
            ]} />
          {c.rows.length === 0 ? (
            <Text c="dimmed" px="lg" pb="lg">{t("console.report.empty")}</Text>
          ) : (
            <Table.ScrollContainer minWidth={560}>
              <Table striped verticalSpacing="sm" horizontalSpacing="lg">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("console.report.customer")}</Table.Th>
                    <Table.Th ta="right">{t("console.report.orders")}</Table.Th>
                    <Table.Th ta="right">{t("console.report.spent")}</Table.Th>
                    <Table.Th>{t("console.report.lastVisit")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {c.rows.map((row) => (
                    <Table.Tr key={row.phone_masked + row.last_order_at}>
                      <Table.Td>
                        <Text span ff="monospace" fz={14}>{row.phone_masked}</Text>
                        {row.first_name && <Text span fz={14} c={tokens.muted}> · {row.first_name}</Text>}
                        {row.is_new && <Badge size="xs" color="green" variant="light" ml={8}>{t("console.report.new")}</Badge>}
                      </Table.Td>
                      <Table.Td ta="right" {...num}>{row.orders}</Table.Td>
                      <Table.Td ta="right" {...num}>{formatSen(row.spent_sen)}</Table.Td>
                      <Table.Td c={tokens.muted}>{formatDateTime(row.last_order_at)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
          <Text fz={12} c={tokens.muted} px="lg" py="md">{t("console.report.customerNote")}</Text>
        </Stack>
      </SectionCard>
    </Stack>
  );
}
