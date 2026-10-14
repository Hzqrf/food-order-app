import { Button, Group, Select, Stack, Table, Text, TextInput } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { type AuditFilters, useAuditLogs } from "../../../api/admin";
import type { AuditRow } from "../../../api/types";
import { ErrorState } from "../../../components/ErrorState";
import { formatDateTime } from "../../../lib/dates";
import { formatSen } from "../../../lib/money";
import { PageHeader } from "../console/PageHeader";
import { SectionCard } from "../console/SectionCard";

const humanize = (s: string) => s.replace(/_/g, " ");

/** Money fields read as RM, everything else as plain text. */
function show(key: string, v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number" && key.endsWith("_sen")) return formatSen(v);
  if (typeof v === "boolean") return v ? "yes" : "no";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

function Changes({ row }: { row: AuditRow }) {
  const keys = [...new Set([...Object.keys(row.before ?? {}), ...Object.keys(row.after ?? {})])];
  if (keys.length === 0) return <Text size="sm" c="dimmed">—</Text>;
  return (
    <Stack gap={0}>
      {keys.map((k) => (
        <Text key={k} size="sm">
          <Text span c="dimmed">{humanize(k.replace(/_sen$/, ""))}: </Text>
          {row.before && k in row.before && <><Text span td="line-through" c="dimmed">{show(k, row.before[k])}</Text>{" → "}</>}
          {row.after && k in row.after ? show(k, row.after[k]) : ""}
        </Text>
      ))}
    </Stack>
  );
}

/** Who changed what: prices, refunds, cancellations, staff and settings. Nobody can edit it. */
export default function AuditPage() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<AuditFilters>({});
  const logs = useAuditLogs(filters);
  const rows = logs.data?.pages.flatMap((p) => p.rows) ?? [];
  const actions = logs.data?.pages[0]?.actions ?? [];

  const filterBar = (
    <Group gap="xs" align="flex-end">
      <TextInput type="date" label={t("admin.filters.from")} value={filters.date_from ?? ""}
        onChange={(e) => setFilters({ ...filters, date_from: e.currentTarget.value || undefined })} />
      <TextInput type="date" label={t("admin.filters.to")} value={filters.date_to ?? ""}
        onChange={(e) => setFilters({ ...filters, date_to: e.currentTarget.value || undefined })} />
      <Select label={t("admin.audit.action")} clearable searchable placeholder={t("admin.filters.any")} w={260}
        data={actions.map((a) => ({ value: a, label: t(`admin.audit.actions.${a}`, { defaultValue: humanize(a) }) }))}
        value={filters.action ?? null} onChange={(v) => setFilters({ ...filters, action: v ?? undefined })} />
    </Group>
  );

  return (
    <Stack gap={20}>
      <PageHeader title={t("console.nav.audit")} subtitle={t("admin.audit.hint")} />
      <SectionCard padded={false} title={filterBar}>
        {logs.isError ? <ErrorState onRetry={() => logs.refetch()} /> : (
          <div style={{ opacity: logs.isPlaceholderData ? 0.6 : 1 }}>
            <Table.ScrollContainer minWidth={760}>
              <Table verticalSpacing="sm" horizontalSpacing="lg" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("admin.orders.time")}</Table.Th>
                    <Table.Th>{t("admin.audit.who")}</Table.Th>
                    <Table.Th>{t("admin.audit.action")}</Table.Th>
                    <Table.Th>{t("admin.audit.what")}</Table.Th>
                    <Table.Th>{t("admin.audit.changes")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((r) => (
                    <Table.Tr key={r.id}>
                      <Table.Td style={{ whiteSpace: "nowrap" }}>{formatDateTime(r.created_at)}</Table.Td>
                      <Table.Td style={{ whiteSpace: "nowrap" }}>{r.actor_name ?? t("actor.system")}</Table.Td>
                      <Table.Td>{t(`admin.audit.actions.${r.action}`, { defaultValue: humanize(r.action) })}</Table.Td>
                      <Table.Td c="dimmed">{humanize(r.entity_type)}{r.entity_id ? ` #${r.entity_id}` : ""}</Table.Td>
                      <Table.Td><Changes row={r} /></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {!logs.isPending && rows.length === 0 && <Text c="dimmed" p="md" px={24}>{t("admin.audit.empty")}</Text>}
          </div>
        )}
        {logs.hasNextPage && (
          <Group p={16} justify="center">
            <Button variant="light" color="gray" loading={logs.isFetchingNextPage} onClick={() => logs.fetchNextPage()}>
              {t("admin.loadMore")}
            </Button>
          </Group>
        )}
      </SectionCard>
    </Stack>
  );
}
