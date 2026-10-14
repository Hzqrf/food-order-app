import { Badge, Group, Paper, SimpleGrid, Stack, Switch, Table, Text, ThemeIcon, Title, UnstyledButton } from "@mantine/core";
import { IconAlertTriangle, IconCircleCheck, IconClockHour4, IconCopy, IconDatabaseExclamation, IconReceiptRefund } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useDashboard } from "../../../api/admin";
import { useSetOnlineOrders } from "../../../api/menu";
import type { Attention } from "../../../api/types";
import { BarChart } from "../../../components/BarChart";
import { ErrorState } from "../../../components/ErrorState";
import { notifyError } from "../../../components/errors";
import { StatTile } from "../../../components/StatTile";
import { formatDateTime, shortDay } from "../../../lib/dates";
import { formatSen } from "../../../lib/money";
import { OrderDetailDrawer } from "../../staff/components/OrderDetailDrawer";

const ATTENTION_ICON = {
  paid_but_cancelled: IconReceiptRefund,
  duplicate_payment: IconCopy,
  ready_too_long: IconClockHour4,
  auto_closed: IconAlertTriangle,
  amount_mismatch: IconAlertTriangle,
  backup_failed: IconDatabaseExclamation,
  backup_late: IconDatabaseExclamation,
} as const;

/** How are we doing, what is happening now, and what needs me: in that order. */
export default function TodayPage() {
  const { t } = useTranslation();
  const { data, isPending, isError, refetch } = useDashboard();
  const setOnline = useSetOnlineOrders();
  const [openId, setOpenId] = useState<number | null>(null);

  if (isPending) return <Text c="dimmed">{t("common.loading")}</Text>;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const { today, live } = data;
  const onlineShare = today.orders ? Math.round((today.online_orders / today.orders) * 100) : 0;

  return (
    <Stack>
      <Group justify="space-between" align="baseline">
        <Title order={2}>{t("admin.today.title")}</Title>
        <Text c="dimmed">{new Date(`${data.business_date}T12:00:00`).toLocaleDateString([], { dateStyle: "full" })}</Text>
      </Group>

      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <StatTile label={t("admin.today.sales")} value={formatSen(today.sales_sen)} />
        <StatTile label={t("admin.today.orders")} value={String(today.orders)} />
        <StatTile label={t("admin.today.avgOrder")} value={formatSen(today.avg_order_sen)} />
        <StatTile label={t("admin.today.online")} value={`${onlineShare}%`}
          hint={t("admin.today.onlineHint", { online: today.online_orders, counter: today.counter_orders })} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Paper withBorder p="md">
          <Title order={5} mb="sm">{t("admin.today.live")}</Title>
          <Group gap="lg" mb="md">
            {([["placed", live.placed], ["preparing", live.preparing], ["ready", live.ready]] as const).map(([k, n]) => (
              <div key={k}>
                <Text fz={24} fw={700}>{n}</Text>
                <Text size="sm" c="dimmed">{t(`board.columns.${k === "placed" ? "new" : k}`)}</Text>
              </div>
            ))}
            {live.awaiting_payment > 0 && (
              <div>
                <Text fz={24} fw={700} c="dimmed">{live.awaiting_payment}</Text>
                <Text size="sm" c="dimmed">{t("status.pending_payment")}</Text>
              </div>
            )}
          </Group>
          {data.online_payments_enabled ? (
            <Switch size="md" color="green" checked={data.accepting_online_orders}
              label={data.accepting_online_orders ? t("staff.onlineOn") : t("staff.onlinePaused")}
              description={data.is_open ? undefined : t("admin.today.closedNow")}
              onChange={(e) => setOnline.mutate(e.currentTarget.checked, {
                onSuccess: () => refetch(), onError: (err) => notifyError(t, err),
              })} />
          ) : (
            <Text size="sm" c="dimmed">{t("admin.settings.onlineOff")}</Text>
          )}
        </Paper>

        <Paper withBorder p="md">
          <Group justify="space-between" mb="sm">
            <Title order={5}>{t("admin.today.attention")}</Title>
            {data.needs_attention.length > 0 && <Badge color="red">{data.needs_attention.length}</Badge>}
          </Group>
          {data.needs_attention.length === 0 ? (
            <Group gap="xs">
              <ThemeIcon color="green" variant="light" radius="xl"><IconCircleCheck size={18} /></ThemeIcon>
              <Text c="dimmed">{t("admin.today.allClear")}</Text>
            </Group>
          ) : (
            <Stack gap={6}>
              {data.needs_attention.map((a, i) => (
                <AttentionRow key={`${a.kind}-${a.order?.id}-${i}`} item={a}
                  onOpen={a.order ? () => setOpenId(a.order!.id) : undefined} />
              ))}
            </Stack>
          )}
        </Paper>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <BarChart title={t("admin.today.last14")} valueLabel={t("admin.reports.sales")}
          format={formatSen} axisFormat={(v) => `RM${Math.round(v / 100).toLocaleString()}`}
          data={data.last_14_days.map((d) => ({ key: d.day, label: shortDay(d.day),
            detail: `${shortDay(d.day)} · ${t("admin.reports.ordersCount", { count: d.orders })}`, value: d.sales_sen }))} />
        <Paper withBorder p="md">
          <Title order={5} mb="sm">{t("admin.today.topItems")}</Title>
          {data.top_items.length === 0 ? (
            <Text c="dimmed">{t("board.emptyNew")}</Text>
          ) : (
            <Table>
              <Table.Tbody>
                {data.top_items.map((it, i) => (
                  <Table.Tr key={it.menu_item_id}>
                    <Table.Td w={24} c="dimmed">{i + 1}</Table.Td>
                    <Table.Td>{it.name}</Table.Td>
                    <Table.Td ta="right" style={{ fontVariantNumeric: "tabular-nums" }}>{it.quantity}</Table.Td>
                    <Table.Td ta="right" c="dimmed" style={{ fontVariantNumeric: "tabular-nums" }}>{formatSen(it.sales_sen)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Paper>
      </SimpleGrid>

      <OrderDetailDrawer orderId={openId} onClose={() => { setOpenId(null); refetch(); }} />
    </Stack>
  );
}

function AttentionRow({ item, onOpen }: { item: Attention; onOpen?: () => void }) {
  const { t } = useTranslation();
  const Icon = ATTENTION_ICON[item.kind];
  // Shop-wide problems (a backup) have no order to open: say what happened and what to do.
  const detail = item.order
    ? `#${item.order.order_number} · ${item.order.order_code}`
    : [item.message, t("admin.attention.backupHint")].filter(Boolean).join(" ");
  const row = (
    <Paper p="xs" radius="md" bg="red.0">
      <Group wrap="nowrap" gap="sm">
        <Icon size={20} color="var(--mantine-color-red-7)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={600}>{t(`admin.attention.${item.kind}`, {
            amount: item.amount_sen != null ? formatSen(item.amount_sen) : "",
          })}</Text>
          <Text size="xs" c="dimmed">
            {detail}
            {item.since ? ` · ${formatDateTime(item.since)}` : ""}
          </Text>
        </div>
        {onOpen && <Text size="xs" c="red.8" fw={600}>{t("admin.attention.open")}</Text>}
      </Group>
    </Paper>
  );
  return onOpen ? <UnstyledButton onClick={onOpen}>{row}</UnstyledButton> : row;
}
