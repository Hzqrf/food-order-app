import { ActionIcon, Alert, Box, Button, Center, Group, Loader, Stack, Text } from "@mantine/core";
import { useInterval } from "@mantine/hooks";
import { IconArrowLeft, IconCircleCheck } from "@tabler/icons-react";
import type { TFunction } from "i18next";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";

import { isApiError } from "../../../api/client";
import { useMenu, useShop } from "../../../api/menu";
import { useCancelUnpaid, usePayAgain, useTracking } from "../../../api/public";
import type { TrackingOut } from "../../../api/types";
import { indexMenu } from "../../../lib/cart";
import { formatTime } from "../../../lib/dates";
import { formatSen } from "../../../lib/money";
import { radius, tokens } from "../../../ui/tokens";
import { useCart } from "../cart";

const STEPS = ["placed", "preparing", "ready", "completed"] as const;
const KNOWN_REASONS = ["payment_expired", "customer_cancelled"];

function Card({ children, bg = tokens.card }: { children: ReactNode; bg?: string }) {
  return <Box p={16} bg={bg} style={{ borderRadius: radius.card, boxShadow: tokens.cardShadow }}>{children}</Box>;
}

/**
 * The promise, honestly: a ready time while it is still ahead, "running late" once it has passed.
 * It adds the kitchen's current delay, the same way checkout did, so the two screens agree.
 */
function heading(t: TFunction, order: TrackingOut, now: number, extraMinutes: number): string | null {
  if (order.status === "ready") return t("tracking.readyNow");
  if ((order.status === "placed" || order.status === "preparing") && order.placed_at && order.prep_minutes) {
    const promise = new Date(order.placed_at).getTime() + (order.prep_minutes + extraMinutes) * 60_000;
    return promise > now
      ? t("tracking.readyAt", { time: formatTime(new Date(promise).toISOString()) })
      : t("tracking.runningLate");
  }
  return null;
}

/** Placed, Preparing, Ready, Collected: done steps filled orange, the current one ringed. */
function Timeline({ order }: { order: TrackingOut }) {
  const { t } = useTranslation();
  const current = STEPS.indexOf(order.status as (typeof STEPS)[number]);
  const allDone = order.status === "completed";
  // The tracking response has no time for "preparing".
  const times = [order.placed_at, null, order.ready_at, order.completed_at];
  const orange = "var(--mantine-color-orange-7)";
  return (
    <Stack gap={0}>
      {STEPS.map((step, i) => {
        const done = i < current || allDone;
        const here = i === current && !allDone;
        const hint = step === "preparing" && order.status === "placed"
          ? t("tracking.usually", { minutes: order.prep_minutes }) : "";
        return (
          <Group key={step} gap={12} wrap="nowrap" align="stretch">
            <Stack gap={0} align="center" w={16}>
              <Box mt={3} w={14} h={14} style={{
                borderRadius: "50%", flexShrink: 0, background: done ? orange : tokens.card,
                boxShadow: `inset 0 0 0 ${here ? 4 : 2}px ${done || here ? orange : tokens.choiceBorder}`,
              }} />
              {i < STEPS.length - 1 && (
                <Box w={2} style={{ flex: 1, minHeight: 22, background: done ? orange : tokens.border }} />
              )}
            </Stack>
            <Group justify="space-between" wrap="nowrap" style={{ flex: 1 }} pb={i < STEPS.length - 1 ? 14 : 0}>
              <Box>
                <Text fz={14} fw={done || here ? 600 : 500} c={done || here ? tokens.text : tokens.muted}>
                  {t(`tracking.step.${step}`)}
                </Text>
                {hint && <Text fz={12} c={tokens.muted}>{hint}</Text>}
              </Box>
              <Text fz={13} c={tokens.muted}>{formatTime(times[i])}</Text>
            </Group>
          </Group>
        );
      })}
    </Stack>
  );
}

export default function OrderPage() {
  const { token = "" } = useParams();
  const { t } = useTranslation();
  const { data: order, isPending, isError, error } = useTracking(token);
  const { data: shop } = useShop();
  const [now, setNow] = useState(Date.now());
  useInterval(() => setNow(Date.now()), 30_000, { autoInvoke: true });

  useEffect(() => {
    if (!order) return;
    document.title = order.status === "ready"
      ? `✅ ${t("tracking.readyTitle")} · #${order.order_number}`
      : `#${order.order_number} · ${order.shop_name}`;
  }, [order, t]);

  if (isPending) {
    return <Center mt={80}><Loader color="orange.7" /></Center>;
  }
  if (isError || !order) {
    return (
      <Stack align="center" mt={80}>
        <Text>{isApiError(error, "not_found") ? t("tracking.notFound") : t("error.body")}</Text>
        <Button component={Link} to="/" variant="light" color="orange.7" radius="xl">{t("customer.browseMenu")}</Button>
      </Stack>
    );
  }

  if (order.detail_hidden) {
    return (
      <Stack align="center" mt={80} gap="xs">
        <Text c={tokens.muted}>{t("takeOrder.orderNumber")}</Text>
        <Text fz={48} fw={700} lh={1}>{order.order_number}</Text>
        <Text fz={13} c={tokens.muted}>{t("order.idLabel", { code: order.order_code })}</Text>
        <Text>{t("tracking.wasCompleted")}</Text>
        <Button component={Link} to="/" variant="light" color="orange.7" radius="xl" mt="md">
          {t("customer.browseMenu")}
        </Button>
      </Stack>
    );
  }

  const ready = order.status === "ready";
  const title = heading(t, order, now, shop?.extra_wait_minutes ?? 0);
  return (
    <Stack pt={12} pb={24} gap={12}>
      <Group gap={8}>
        <ActionIcon component={Link} to="/orders" variant="subtle" color="dark" size="lg" radius="xl"
          aria-label={t("common.back")}>
          <IconArrowLeft size={22} />
        </ActionIcon>
        <Text fz={13} c={tokens.muted}>{order.shop_name}</Text>
      </Group>
      {title && (
        <Text fz={22} fw={600} c={tokens.text} lh={1.3} style={{ letterSpacing: "-.02em" }}>{title}</Text>
      )}

      <Card bg={ready ? "var(--mantine-color-green-6)" : tokens.card}>
        <Stack align="center" gap={4} c={ready ? "white" : undefined}>
          <Text fz={13} opacity={0.8}>{t("takeOrder.orderNumber")}</Text>
          <Text fz={56} fw={700} lh={1}>{order.order_number}</Text>
          <Text fz={13} opacity={0.8}>{t("order.idLabel", { code: order.order_code })}</Text>
          {ready && <IconCircleCheck size={36} style={{ marginTop: 8 }} />}
        </Stack>
      </Card>

      {order.status === "pending_payment" && <PendingPayment token={token} order={order} />}

      {order.status === "cancelled" && (
        <Alert color="red" radius={radius.card} title={t("tracking.cancelledTitle")}>
          {order.cancel_reason && (KNOWN_REASONS.includes(order.cancel_reason)
            ? t(`tracking.reason.${order.cancel_reason}`)
            : t("tracking.reasonFromShop", { reason: order.cancel_reason }))}
          {order.payment_status === "paid" && <Text size="sm" mt="xs">{t("tracking.refundComing")}</Text>}
          {order.payment_status === "refunded" && <Text size="sm" mt="xs">{t("tracking.refunded")}</Text>}
        </Alert>
      )}

      {order.pay_at_counter && order.payment_status === "unpaid" && order.status !== "cancelled" && (
        <Card bg={tokens.busyBg}>
          <Text fz={14} fw={500} c={tokens.body}>{t("tracking.payAtCounter", { total: formatSen(order.total_sen ?? 0) })}</Text>
        </Card>
      )}

      {STEPS.includes(order.status as (typeof STEPS)[number]) && <Card><Timeline order={order} /></Card>}

      <Card>
        <Text fz={14} fw={600} mb={10}>{t("tracking.inThisOrder")}</Text>
        <Stack gap={10}>
          {order.items.map((line, i) => (
            <Group key={i} justify="space-between" wrap="nowrap" align="flex-start">
              <Box>
                <Text fz={14}>{line.quantity} × {line.item_name}</Text>
                {line.option_names.length > 0 && <Text fz={13} c={tokens.muted}>{line.option_names.join(", ")}</Text>}
                {line.note && <Text fz={13} c={tokens.muted}>“{line.note}”</Text>}
              </Box>
              <Text fz={14}>{formatSen(line.line_total_sen)}</Text>
            </Group>
          ))}
          <Group justify="space-between" pt={10} style={{ borderTop: `1px solid ${tokens.border}` }}>
            <Text fw={600}>{t("common.total")}</Text>
            <Text fw={600}>{formatSen(order.total_sen ?? 0)}</Text>
          </Group>
          {order.note && <Text fz={13} c={tokens.muted}>{t("board.note")}: {order.note}</Text>}
        </Stack>
      </Card>

      {(order.status === "completed" || order.status === "cancelled") && <OrderAgain order={order} />}
      <Text fz={12} c={tokens.muted} ta="center">{t("tracking.keepLink")}</Text>
    </Stack>
  );
}

function PendingPayment({ token, order }: { token: string; order: TrackingOut }) {
  const { t } = useTranslation();
  const pay = usePayAgain(token);
  const cancel = useCancelUnpaid(token);
  const [now, setNow] = useState(Date.now());
  useInterval(() => setNow(Date.now()), 1000, { autoInvoke: true });
  const left = Math.max(0, Math.floor((new Date(order.expires_at!).getTime() - now) / 1000));
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <Stack gap="sm">
        <Text fz={15} fw={600}>{t("tracking.awaitingPayment")}</Text>
        <Text fz={13} c={tokens.muted}>{t("tracking.justPaid")}</Text>
        {left > 0 && (
          <Text fz={14}>{t("tracking.expiresIn", { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` })}</Text>
        )}
        {error && <Alert color="red">{error}</Alert>}
        <Button size="md" radius="xl" color="orange.7" disabled={!order.can_pay || left === 0} loading={pay.isPending}
          onClick={() => pay.mutate(undefined, {
            onSuccess: ({ payment_url }) => window.location.assign(payment_url),
            onError: (e) => setError(isApiError(e, "order_expired") ? t("tracking.reason.payment_expired") : t("error.body")),
          })}>
          {t("tracking.payNow", { total: formatSen(order.total_sen ?? 0) })}
        </Button>
        {order.can_cancel && (
          <Button variant="subtle" color="gray" radius="xl" loading={cancel.isPending} onClick={() => cancel.mutate()}>
            {t("tracking.cancelUnpaid")}
          </Button>
        )}
      </Stack>
    </Card>
  );
}

/** Puts this order's items back in the cart, skipping anything no longer on the menu. */
function OrderAgain({ order }: { order: TrackingOut }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cart = useCart();
  const { data: menu } = useMenu();
  const items = useMemo(() => indexMenu(menu), [menu]);

  const available = order.items.filter((l) => {
    const item = items.get(l.menu_item_id);
    return item && !item.is_sold_out;
  });
  if (!menu || available.length === 0) return null;

  return (
    <Button size="md" radius="xl" variant="light" color="orange.7" onClick={() => {
      available.forEach((l) => cart.add(l.menu_item_id, l.option_ids, l.quantity, l.note ?? undefined));
      navigate("/cart");
    }}>
      {t("tracking.orderAgain")}
    </Button>
  );
}
