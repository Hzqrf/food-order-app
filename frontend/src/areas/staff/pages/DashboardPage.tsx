import { Badge, Group, Paper, SimpleGrid, Stack, Switch, Text, ThemeIcon, UnstyledButton } from "@mantine/core";
import { IconAlertTriangle, IconCircleCheck, IconClockHour4, IconCopy, IconDatabaseExclamation, IconReceiptRefund } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { useDashboard } from "../../../api/admin";
import { useSetOnlineOrders } from "../../../api/menu";
import type { Attention } from "../../../api/types";
import { BarChart } from "../../../components/BarChart";
import { ErrorState } from "../../../components/ErrorState";
import { notifyError } from "../../../components/errors";
import { formatDateTime } from "../../../lib/dates";
import { formatSen } from "../../../lib/money";
import { percentChange } from "../console/delta";
import { MetricCard } from "../console/MetricCard";
import { PageHeader } from "../console/PageHeader";
import { RankedBars } from "../console/RankedBars";
import { SectionCard } from "../console/SectionCard";
import { tokens } from "../console/tokens";

const ATTENTION_ICON = {
  paid_but_cancelled: IconReceiptRefund,
  duplicate_payment: IconCopy,
  ready_too_long: IconClockHour4,
  auto_closed: IconAlertTriangle,
  amount_mismatch: IconAlertTriangle,
  backup_failed: IconDatabaseExclamation,
  backup_late: IconDatabaseExclamation,
} as const;

const rm = (v: number) => `RM${Math.round(v / 100).toLocaleString()}`;
const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** How today is trading against the same day last week, what is happening now, and what needs me. */
export default function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isPending, isError, refetch } = useDashboard();
  const setOnline = useSetOnlineOrders();

  const header = (
    <PageHeader title={t("console.dashboard.title")}
      subtitle={data ? new Date(`${data.business_date}T12:00:00`).toLocaleDateString([], { dateStyle: "full" })
        : t("console.dashboard.subtitle")} />
  );
  if (isPending) return <>{header}<Text c="dimmed">{t("common.loading")}</Text></>;
  if (isError) return <>{header}<ErrorState onRetry={() => refetch()} /></>;

  const { today, same_day_last_week: before, live } = data;
  const cancelledShare = today.orders + data.cancelled_today
    ? Math.round((data.cancelled_today / (today.orders + data.cancelled_today)) * 100) : 0;
  // Only the hours the shop actually trades, today or last week.
  const lastWeek = new Map(data.hours_same_day_last_week.map((h) => [h.hour, h.sales_sen]));
  const busy = data.hours_today.filter((h) => h.orders > 0 || (lastWeek.get(h.hour) ?? 0) > 0).map((h) => h.hour);
  const lo = busy.length ? Math.min(...busy) : 10;
  const hi = busy.length ? Math.max(...busy) : 22;
  const hours = data.hours_today.filter((h) => h.hour >= lo && h.hour <= hi);

  return (
    <Stack gap={20}>
      {header}
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing={{ base: 12, sm: 20 }}>
        <MetricCard label={t("console.dashboard.sales")} value={formatSen(today.net_sen)}
          {...percentChange(today.net_sen, before.net_sen)} deltaLabel={t("console.vsLastWeek")} />
        <MetricCard label={t("console.dashboard.orders")} value={String(today.orders)}
          {...percentChange(today.orders, before.orders)} deltaLabel={t("console.vsLastWeek")} />
        <MetricCard label={t("console.dashboard.avgOrder")} value={formatSen(today.avg_order_sen)}
          {...percentChange(today.avg_order_sen, before.avg_order_sen)} deltaLabel={t("console.vsLastWeek")} />
        <MetricCard label={t("console.dashboard.cancelled")} value={String(data.cancelled_today)}
          deltaLabel={t("console.dashboard.cancelledShare", { share: cancelledShare })} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={20}>
        <BarChart title={t("console.dashboard.byHour")} sub={t("console.dashboard.byHourSub")}
          valueLabel={t("admin.reports.sales")} format={formatSen} axisFormat={rm}
          data={hours.map((h) => ({
            key: String(h.hour), label: String(h.hour),
            detail: `${hourLabel(h.hour)} · ${t("console.dashboard.lastWeekWas", { amount: formatSen(lastWeek.get(h.hour) ?? 0) })}`,
            value: h.sales_sen,
          }))} />
        <SectionCard title={t("admin.today.topItems")}>
          <RankedBars rows={data.top_items.map((i) => ({ label: i.name, value: i.quantity }))} format={(v) => String(v)}
            headers={[t("admin.reports.item"), t("console.dashboard.shareOfUnits"), t("admin.reports.qty"), t("console.dashboard.share")]} />
        </SectionCard>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={20}>
        <SectionCard title={t("admin.today.live")}>
          <Group gap="xl" mb="md">
            {([["placed", live.placed], ["preparing", live.preparing], ["ready", live.ready]] as const).map(([k, n]) => (
              <div key={k}>
                <Text fz={24} fw={700} c={tokens.text}>{n}</Text>
                <Text fz={13} c={tokens.muted}>{t(`board.columns.${k === "placed" ? "new" : k}`)}</Text>
              </div>
            ))}
            {live.awaiting_payment > 0 && (
              <div>
                <Text fz={24} fw={700} c={tokens.muted}>{live.awaiting_payment}</Text>
                <Text fz={13} c={tokens.muted}>{t("status.pending_payment")}</Text>
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
        </SectionCard>

        <SectionCard title={t("admin.today.attention")}
          actions={data.needs_attention.length > 0 && <Badge color="red">{data.needs_attention.length}</Badge>}>
          {data.needs_attention.length === 0 ? (
            <Group gap="xs">
              <ThemeIcon color="green" variant="light" radius="xl"><IconCircleCheck size={18} /></ThemeIcon>
              <Text c="dimmed">{t("admin.today.allClear")}</Text>
            </Group>
          ) : (
            <Stack gap={6}>
              {data.needs_attention.map((a, i) => (
                <AttentionRow key={`${a.kind}-${a.order?.id}-${i}`} item={a}
                  onOpen={a.order ? () => navigate(`/staff/orders/${a.order!.id}`) : undefined} />
              ))}
            </Stack>
          )}
        </SectionCard>
      </SimpleGrid>
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
    <Paper p="xs" radius={12} bg={tokens.dangerBg}>
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
