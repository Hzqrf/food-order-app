import { Alert, Box, Button, Center, Divider, Group, Loader, Paper, Stack, Stepper, Text, Title } from "@mantine/core";
import { useInterval } from "@mantine/hooks";
import { IconCircleCheck } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";

import { isApiError } from "../../../api/client";
import { useMenu } from "../../../api/menu";
import { useCancelUnpaid, usePayAgain, useTracking } from "../../../api/public";
import type { TrackingOut } from "../../../api/types";
import { indexMenu } from "../../../lib/cart";
import { formatTime } from "../../../lib/dates";
import { formatSen } from "../../../lib/money";
import { useCart } from "../cart";

const STEPS = ["placed", "preparing", "ready", "completed"] as const;
// Steps before the active one show as done. Preparing spins while the kitchen works on it.
const ACTIVE_STEP: Record<string, number> = { placed: 1, preparing: 1, ready: 3, completed: 4 };
const KNOWN_REASONS = ["payment_expired", "customer_cancelled"];

export default function OrderPage() {
  const { token = "" } = useParams();
  const { t } = useTranslation();
  const { data: order, isPending, isError, error } = useTracking(token);

  useEffect(() => {
    if (!order) return;
    document.title = order.status === "ready"
      ? `✅ ${t("tracking.readyTitle")} · #${order.order_number}`
      : `#${order.order_number} · ${order.shop_name}`;
  }, [order, t]);

  if (isPending) {
    return <Center mt={80}><Loader /></Center>;
  }
  if (isError || !order) {
    return (
      <Stack align="center" mt="xl">
        <Text>{isApiError(error, "not_found") ? t("tracking.notFound") : t("error.body")}</Text>
        <Button component={Link} to="/" variant="light">{t("customer.browseMenu")}</Button>
      </Stack>
    );
  }

  if (order.detail_hidden) {
    return (
      <Stack align="center" mt="xl" gap="xs">
        <Text c="dimmed">{t("takeOrder.orderNumber")}</Text>
        <Title order={1}>{order.order_number}</Title>
        <Text size="sm" c="dimmed">{t("order.idLabel", { code: order.order_code })}</Text>
        <Text>{t("tracking.wasCompleted")}</Text>
        <Button component={Link} to="/" variant="light" mt="md">{t("customer.browseMenu")}</Button>
      </Stack>
    );
  }

  const ready = order.status === "ready";
  return (
    <Stack mt="md" gap="md">
      <Paper p="lg" radius="lg" bg={ready ? "green.6" : "white"} c={ready ? "white" : undefined} withBorder={!ready}>
        <Stack align="center" gap={4}>
          <Text size="sm" opacity={0.8}>{t("takeOrder.orderNumber")}</Text>
          <Title order={1} fz={56} lh={1}>{order.order_number}</Title>
          <Text size="sm" opacity={0.8}>{t("order.idLabel", { code: order.order_code })}</Text>
          {ready && (
            <Stack align="center" gap={2} mt="sm">
              <IconCircleCheck size={40} />
              <Title order={3}>{t("tracking.readyTitle")}</Title>
              <Text ta="center">{t("tracking.readyBody")}</Text>
            </Stack>
          )}
        </Stack>
      </Paper>

      {order.status === "pending_payment" && <PendingPayment token={token} order={order} />}

      {order.status === "cancelled" && (
        <Alert color="red" title={t("tracking.cancelledTitle")}>
          {order.cancel_reason && (KNOWN_REASONS.includes(order.cancel_reason)
            ? t(`tracking.reason.${order.cancel_reason}`)
            : t("tracking.reasonFromShop", { reason: order.cancel_reason }))}
          {order.payment_status === "paid" && <Text size="sm" mt="xs">{t("tracking.refundComing")}</Text>}
          {order.payment_status === "refunded" && <Text size="sm" mt="xs">{t("tracking.refunded")}</Text>}
        </Alert>
      )}

      {STEPS.includes(order.status as (typeof STEPS)[number]) && (
        <Paper withBorder p="md">
          <Stepper active={ACTIVE_STEP[order.status] ?? 0} orientation="vertical" size="sm" color={ready ? "green" : undefined}>
            <Stepper.Step label={t("tracking.step.placed")} description={formatTime(order.placed_at)} />
            <Stepper.Step label={t("tracking.step.preparing")} loading={order.status === "preparing"}
              description={order.status === "placed" ? t("tracking.usually", { minutes: order.prep_minutes }) : ""} />
            <Stepper.Step label={t("tracking.step.ready")} description={formatTime(order.ready_at)} />
            <Stepper.Step label={t("tracking.step.completed")} description={formatTime(order.completed_at)} />
          </Stepper>
        </Paper>
      )}

      <Paper withBorder p="md">
        <Stack gap="xs">
          {order.items.map((line, i) => (
            <Group key={i} justify="space-between" wrap="nowrap" align="flex-start">
              <Box>
                <Text>{line.quantity}× {line.item_name}</Text>
                {line.option_names.length > 0 && <Text size="sm" c="dimmed">{line.option_names.join(", ")}</Text>}
                {line.note && <Text size="sm" c="dimmed">“{line.note}”</Text>}
              </Box>
              <Text>{formatSen(line.line_total_sen)}</Text>
            </Group>
          ))}
          <Divider />
          <Group justify="space-between">
            <Text fw={700}>{t("common.total")}</Text>
            <Text fw={700}>{formatSen(order.total_sen ?? 0)}</Text>
          </Group>
          {order.note && <Text size="sm" c="dimmed">{t("board.note")}: {order.note}</Text>}
        </Stack>
      </Paper>

      {(order.status === "completed" || order.status === "cancelled") && <OrderAgain order={order} />}
      <Text size="xs" c="dimmed" ta="center">{t("tracking.keepLink")}</Text>
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
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Title order={4}>{t("tracking.awaitingPayment")}</Title>
        <Text size="sm" c="dimmed">{t("tracking.justPaid")}</Text>
        {left > 0 && (
          <Text size="sm">{t("tracking.expiresIn", { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` })}</Text>
        )}
        {error && <Alert color="red">{error}</Alert>}
        <Button size="lg" disabled={!order.can_pay || left === 0} loading={pay.isPending}
          onClick={() => pay.mutate(undefined, {
            onSuccess: ({ payment_url }) => window.location.assign(payment_url),
            onError: (e) => setError(isApiError(e, "order_expired") ? t("tracking.reason.payment_expired") : t("error.body")),
          })}>
          {t("tracking.payNow", { total: formatSen(order.total_sen ?? 0) })}
        </Button>
        {order.can_cancel && (
          <Button variant="subtle" color="gray" loading={cancel.isPending} onClick={() => cancel.mutate()}>
            {t("tracking.cancelUnpaid")}
          </Button>
        )}
      </Stack>
    </Paper>
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
    <Button size="lg" variant="light" onClick={() => {
      available.forEach((l) => cart.add(l.menu_item_id, l.option_ids, l.quantity, l.note ?? undefined));
      navigate("/cart");
    }}>
      {t("tracking.orderAgain")}
    </Button>
  );
}
