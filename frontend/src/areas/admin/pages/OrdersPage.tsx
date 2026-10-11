import { Badge, Button, Group, Paper, Select, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { type OrderFilters, useAdminOrders, useStaffList } from "../../../api/admin";
import { ErrorState } from "../../../components/ErrorState";
import { formatDateTime } from "../../../lib/dates";
import { formatSen } from "../../../lib/money";
import { OrderDetailDrawer, STATUS_COLOR } from "../../staff/components/OrderDetailDrawer";

const STATUSES = ["pending_payment", "placed", "preparing", "ready", "completed", "cancelled"];
const PAYMENT_STATUSES = ["unpaid", "paid", "refunded"];
const CHANNELS = ["online", "counter", "phone"];

export default function OrdersPage() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<OrderFilters>({});
  const [q, setQ] = useState("");
  const [debouncedQ] = useDebouncedValue(q.trim(), 300);
  const { data: staff = [] } = useStaffList();
  const orders = useAdminOrders({ ...filters, q: debouncedQ });
  const [openId, setOpenId] = useState<number | null>(null);
  const set = (k: keyof OrderFilters) => (v: string | null) => setFilters((f) => ({ ...f, [k]: v ?? undefined }));

  const rows = orders.data?.pages.flatMap((p) => p.orders) ?? [];

  return (
    <Stack>
      <Title order={2}>{t("admin.nav.orders")}</Title>
      {/* One row of filters above the table; they scope everything below. */}
      <Group gap="xs" align="flex-end">
        <TextInput type="date" label={t("admin.filters.from")} value={filters.date_from ?? ""}
          onChange={(e) => set("date_from")(e.currentTarget.value)} />
        <TextInput type="date" label={t("admin.filters.to")} value={filters.date_to ?? ""}
          onChange={(e) => set("date_to")(e.currentTarget.value)} />
        <Select label={t("admin.filters.status")} clearable placeholder={t("admin.filters.any")} w={170}
          data={STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))} value={filters.status ?? null}
          onChange={set("status")} />
        <Select label={t("admin.filters.payment")} clearable placeholder={t("admin.filters.any")} w={140}
          data={PAYMENT_STATUSES.map((s) => ({ value: s, label: t(`paymentStatus.${s}`) }))}
          value={filters.payment_status ?? null} onChange={set("payment_status")} />
        <Select label={t("admin.filters.channel")} clearable placeholder={t("admin.filters.any")} w={140}
          data={CHANNELS.map((c) => ({ value: c, label: t(`channel.${c}`) }))} value={filters.channel ?? null}
          onChange={set("channel")} />
        <Select label={t("admin.filters.staff")} clearable placeholder={t("admin.filters.any")} w={150}
          data={staff.map((s) => ({ value: String(s.id), label: s.full_name }))} value={filters.staff_id ?? null}
          onChange={set("staff_id")} />
        <TextInput label={t("admin.filters.search")} placeholder={t("search.placeholder")} w={320}
          leftSection={<IconSearch size={16} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} />
      </Group>

      {orders.isError ? (
        <ErrorState onRetry={() => orders.refetch()} />
      ) : (
        <Paper withBorder style={{ opacity: orders.isPlaceholderData ? 0.6 : 1 }}>
          <Table.ScrollContainer minWidth={760}>
            <Table highlightOnHover verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("admin.orders.number")}</Table.Th>
                  <Table.Th>{t("admin.orders.id")}</Table.Th>
                  <Table.Th>{t("admin.orders.time")}</Table.Th>
                  <Table.Th>{t("admin.filters.channel")}</Table.Th>
                  <Table.Th>{t("admin.filters.status")}</Table.Th>
                  <Table.Th>{t("admin.filters.payment")}</Table.Th>
                  <Table.Th ta="right">{t("common.total")}</Table.Th>
                  <Table.Th>{t("admin.orders.keyedBy")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((o) => (
                  <Table.Tr key={o.id} style={{ cursor: "pointer" }} onClick={() => setOpenId(o.id)}>
                    <Table.Td fw={700}>{o.order_number}</Table.Td>
                    <Table.Td ff="monospace" c="dimmed">{o.order_code}</Table.Td>
                    <Table.Td>{formatDateTime(o.placed_at ?? o.created_at)}</Table.Td>
                    <Table.Td>{t(`channel.${o.channel}`)}</Table.Td>
                    <Table.Td><Badge variant="light" color={STATUS_COLOR[o.status]}>{t(`status.${o.status}`)}</Badge></Table.Td>
                    <Table.Td>
                      <Badge variant="outline" color={o.payment_status === "paid" ? "green" : "gray"}>
                        {t(`paymentStatus.${o.payment_status}`)}
                      </Badge>
                    </Table.Td>
                    <Table.Td ta="right" style={{ fontVariantNumeric: "tabular-nums" }}>{formatSen(o.total_sen)}</Table.Td>
                    <Table.Td c="dimmed">{o.created_by_name ?? "—"}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {!orders.isPending && rows.length === 0 && <Text c="dimmed" p="md">{t("search.none")}</Text>}
        </Paper>
      )}
      {orders.hasNextPage && (
        <Button variant="default" onClick={() => orders.fetchNextPage()} loading={orders.isFetchingNextPage} w="fit-content">
          {t("admin.loadMore")}
        </Button>
      )}
      <OrderDetailDrawer orderId={openId} onClose={() => setOpenId(null)} />
    </Stack>
  );
}
