import { Alert, Button, Group, SegmentedControl, SimpleGrid, Stack, Text } from "@mantine/core";
import { useInterval, useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconCircleCheck, IconPlus } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router";

import { useSession } from "../../../api/auth";
import { isApiError } from "../../../api/client";
import { useShop } from "../../../api/menu";
import { useBoard, useClaim, useQueueMetrics, useTransition } from "../../../api/orders";
import type { OrderSummary, QueueMetrics } from "../../../api/types";
import { ErrorState } from "../../../components/ErrorState";
import { notifyError } from "../../../components/errors";
import { useNewOrderAlert } from "../../../hooks/useNewOrderAlert";
import { formatTime } from "../../../lib/dates";
import { isLater, LaterStrip } from "../components/LaterStrip";
import { NEXT_STEP, OrderCard } from "../components/OrderCard";
import { isUnpaidAtCounter, TakePaymentModal } from "../components/TakePaymentModal";
import { useStaff } from "../console/lock";
import { MetricCard } from "../console/MetricCard";
import { PageHeader } from "../console/PageHeader";
import { SectionCard } from "../console/SectionCard";
import { StatusLabel } from "../console/StatusLabel";
import { toast } from "../console/toast";
import { tokens } from "../../../ui/tokens";

const COLUMNS = [
  { status: "placed", label: "board.columns.new", short: "board.columns.new" },
  { status: "preparing", label: "board.columns.preparing", short: "board.columns.preparing" },
  { status: "ready", label: "console.queue.readyColumn", short: "board.columns.ready" },
] as const;

const UNDO_MS = 5_000;
const CONFLICTS = ["version_conflict", "invalid_transition", "not_claimable"];

export type SentNotice = { number: string; method: string };
/** What other console pages can hand the queue through navigation state. */
export type QueueState = { sent?: SentNotice; handOver?: number } | null;

const SENT_BANNER_MS = 8_000;

function Metrics({ m }: { m: QueueMetrics | undefined }) {
  const { t } = useTranslation();
  const prep = m?.avg_prep_minutes ?? null;
  const prepBefore = m?.avg_prep_minutes_last_week ?? null;
  const prepChange = prep !== null && prepBefore ? Math.round(((prep - prepBefore) / prepBefore) * 100) : null;
  return (
    <SimpleGrid cols={{ base: 2, md: 4 }} spacing={{ base: 12, sm: 20 }}>
      <MetricCard label={t("console.queue.metrics.open")} value={m ? String(m.open_orders) : null}
        deltaLabel={t("console.queue.metrics.openHint")} />
      <MetricCard label={t("console.queue.metrics.prep")}
        value={prep !== null ? t("console.queue.metrics.minutes", { count: Math.round(prep) }) : null}
        delta={prepChange !== null ? `${Math.abs(prepChange)}%` : undefined}
        direction={prepChange === null || prepChange === 0 ? undefined : prepChange < 0 ? "down" : "up"} good="down"
        deltaLabel={prepBefore !== null ? t("console.vsLastWeek") : undefined} />
      <MetricCard label={t("console.queue.metrics.late")} value={m ? String(m.running_late) : null}
        deltaLabel={t("console.queue.metrics.lateHint")} />
      <MetricCard label={t("console.queue.metrics.preorders")} value={m ? String(m.preorders_today) : null}
        deltaLabel={m?.next_preorder_at ? t("console.queue.metrics.nextAt", { time: formatTime(m.next_preorder_at) })
          : t("console.queue.metrics.noneWaiting")} />
    </SimpleGrid>
  );
}

export default function BoardPage() {
  const { t } = useTranslation();
  const { ensureUnlocked } = useStaff();
  const navigate = useNavigate();
  const location = useLocation();
  const board = useBoard();
  const metrics = useQueueMetrics();
  const { data: shop } = useShop();
  const { data: session } = useSession();
  const transition = useTransition();
  const claim = useClaim();
  const wide = useMediaQuery("(min-width: 62em)", true);
  const [column, setColumn] = useState<string>("placed");
  const [busyId, setBusyId] = useState<number | null>(null);
  // "Handed over" waits 5 seconds before it is sent, so an Undo can simply cancel it.
  const [handingOver, setHandingOver] = useState<Set<number>>(new Set());
  const timers = useRef(new Map<number, { handle: number; send: () => void }>());
  const [now, setNow] = useState(Date.now());
  useInterval(() => setNow(Date.now()), 30_000, { autoInvoke: true });
  // Pre-orders wait in Later today until their start time. The new-order sound and flash are for
  // what lands in New, so a pre-order rings when it joins New, not when it was booked.
  const liveOrders = useMemo(() => board.data?.filter((o) => !isLater(o, now)), [board.data, now]);
  const { flashing, acknowledge, markSeen } = useNewOrderAlert(liveOrders);
  const [sent, setSent] = useState<SentNotice | null>(null);
  const [handOverId, setHandOverId] = useState<number | null>(null);
  // An order paid at the counter: take the money, then hand it over.
  const [paying, setPaying] = useState<OrderSummary | null>(null);

  // Take what other pages handed over, then clear it from history so a reload doesn't repeat it.
  useEffect(() => {
    const state = location.state as QueueState;
    if (!state) return;
    if (state.sent) setSent(state.sent);
    if (state.handOver) setHandOverId(state.handOver);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  useEffect(() => {
    if (!sent) return;
    const timer = window.setTimeout(() => setSent(null), SENT_BANNER_MS);
    return () => window.clearTimeout(timer);
  }, [sent]);

  // Leaving the board inside the undo window sends the hand-over straight away rather than losing it.
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(({ handle, send }) => {
      window.clearTimeout(handle);
      send();
    });
  }, []);

  /** Someone else got there first: refresh, then say who, if the order shows a different taker. */
  const explainConflict = async (order: OrderSummary) => {
    const fresh = (await board.refetch()).data?.find((o) => o.id === order.id);
    const me = session?.user?.full_name;
    if (fresh?.claimed_by_name && fresh.claimed_by_name !== me) {
      toast(t("console.queue.alreadyTaken", { name: fresh.claimed_by_name, number: order.order_number }), "error");
    } else {
      toast(t("board.changedElsewhere", { number: order.order_number }), "error");
    }
  };

  const onError = (order: OrderSummary) => (e: Error) => {
    if (CONFLICTS.some((code) => isApiError(e, code))) void explainConflict(order);
    else notifyError(t, e);
  };

  const send = (order: OrderSummary, to: string) => {
    setBusyId(order.id);
    transition.mutate(
      { id: order.id, to, version: order.version },
      {
        onError: onError(order),
        onSettled: () => {
          setBusyId(null);
          setHandingOver((prev) => {
            const next = new Set(prev);
            next.delete(order.id);
            return next;
          });
        },
      },
    );
  };

  const take = (order: OrderSummary) => {
    if (!ensureUnlocked()) return;
    acknowledge(order.id);
    setBusyId(order.id);
    claim.mutate({ id: order.id, version: order.version }, { onError: onError(order), onSettled: () => setBusyId(null) });
  };

  const advance = (order: OrderSummary, to: string) => {
    if (!ensureUnlocked()) return;
    acknowledge(order.id);
    if (to !== "completed") return send(order, to);
    if (isUnpaidAtCounter(order)) return setPaying(order);

    setHandingOver((prev) => new Set(prev).add(order.id));
    const notifId = `undo-${order.id}`;
    const undo = () => {
      window.clearTimeout(timers.current.get(order.id)?.handle);
      timers.current.delete(order.id);
      notifications.hide(notifId);
      setHandingOver((prev) => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    };
    notifications.show({
      id: notifId,
      position: "bottom-right",
      autoClose: UNDO_MS,
      withCloseButton: false,
      message: (
        <Group justify="space-between">
          <Text size="sm">{t("board.handedOverToast", { number: order.order_number })}</Text>
          <Button size="compact-sm" variant="light" onClick={undo}>
            {t("common.undo")}
          </Button>
        </Group>
      ),
    });
    const fire = () => {
      timers.current.delete(order.id);
      send(order, "completed");
    };
    timers.current.set(order.id, { handle: window.setTimeout(fire, UNDO_MS), send: fire });
  };

  // "Handed over" on the order page comes here, so it gets the same 5-second undo as the board.
  useEffect(() => {
    if (handOverId === null || !board.data) return;
    const order = board.data.find((o) => o.id === handOverId);
    setHandOverId(null);
    if (order && order.status === "ready") advance(order, "completed");
    // advance is recreated each render; this runs once per hand-over request.
  }, [handOverId, board.data]);

  const header = (
    <PageHeader title={t("console.queue.title")} subtitle={t("console.queue.subtitle")}
      actions={
        <Button component={Link} to="/staff/take" leftSection={<IconPlus size={18} />}>
          {t("console.nav.addOrder")}
        </Button>
      } />
  );

  if (board.isPending) return <>{header}<Text c="dimmed">{t("common.loading")}</Text></>;
  if (board.isError && !board.data) return <>{header}<ErrorState onRetry={() => board.refetch()} /></>;

  const orders = (liveOrders ?? []).filter((o) => !handingOver.has(o.id));
  const later = (board.data ?? []).filter((o) => isLater(o, now))
    .sort((a, b) => Date.parse(a.pickup_at!) - Date.parse(b.pickup_at!));
  const prep = shop?.prep_minutes ?? 15;
  const visible = wide ? COLUMNS : COLUMNS.filter((c) => c.status === column);

  return (
    <Stack gap={20}>
      {header}
      {sent && (
        <Group gap={10} px={16} py={14} c={tokens.success} bg={tokens.successBg} style={{ borderRadius: 12 }}>
          <IconCircleCheck size={20} />
          <Text fz={14} fw={500} inherit>
            {t("console.queue.sent", { number: sent.number, method: t(`paymentMethod.${sent.method}`) })}
          </Text>
        </Group>
      )}
      {later.length > 0 && (
        <LaterStrip orders={later} busyId={busyId} onStart={(o) => { markSeen(o.id); advance(o, "preparing"); }}
          onOpen={(o) => { if (ensureUnlocked()) navigate(`/staff/orders/${o.id}`); }} />
      )}
      {board.isError && (
        <Alert color="red" variant="light">
          {t("board.offline", { time: formatTime(new Date(board.dataUpdatedAt).toISOString()) })}
        </Alert>
      )}
      <Metrics m={metrics.data} />
      {!wide && (
        <SegmentedControl
          fullWidth
          value={column}
          onChange={setColumn}
          data={COLUMNS.map((c) => ({
            value: c.status,
            label: `${t(c.short)} (${orders.filter((o) => o.status === c.status).length})`,
          }))}
        />
      )}
      <SimpleGrid cols={wide ? 3 : 1} spacing={20} style={{ alignItems: "start" }}>
        {visible.map((c) => {
          const list = orders.filter((o) => o.status === c.status);
          return (
            <SectionCard key={c.status} padded={false}>
              <Stack gap={12} p={20}>
                <Group justify="space-between">
                  <Text fz={16} lh="24px" fw={600} c={tokens.text}>
                    {t(c.label)}
                  </Text>
                  <StatusLabel kind="count" value={String(list.length)} color={c.status === "ready" ? "green" : "orange"} />
                </Group>
                {list.length === 0 && (
                  <Text size="sm" c="dimmed">
                    {c.status === "placed" ? t("board.emptyNew") : "—"}
                  </Text>
                )}
                {list.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    now={now}
                    prepMinutes={prep}
                    flashing={flashing.has(o.id)}
                    busy={busyId === o.id}
                    onAdvance={() => {
                      const next = NEXT_STEP[o.status];
                      if (next) advance(o, next.to);
                    }}
                    onTake={() => take(o)}
                    onOpen={() => {
                      acknowledge(o.id);
                      if (ensureUnlocked()) navigate(`/staff/orders/${o.id}`);
                    }}
                  />
                ))}
              </Stack>
            </SectionCard>
          );
        })}
      </SimpleGrid>
      <TakePaymentModal order={paying} onClose={() => setPaying(null)}
        onPaid={(paid) => advance({ ...paying!, ...paid }, "completed")} />
    </Stack>
  );
}
