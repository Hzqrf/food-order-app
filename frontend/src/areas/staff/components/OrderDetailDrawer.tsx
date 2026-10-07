import { Badge, Button, Divider, Drawer, Group, Loader, Stack, Text, Timeline } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useSession } from "../../../api/auth";
import { useOrder } from "../../../api/orders";
import type { OrderSummary } from "../../../api/types";
import { formatDateTime, formatTime } from "../../../lib/dates";
import { formatSen } from "../../../lib/money";
import { CancelOrderModal } from "./CancelOrderModal";

export const STATUS_COLOR: Record<string, string> = {
  pending_payment: "gray",
  placed: "blue",
  preparing: "orange",
  ready: "green",
  completed: "teal",
  cancelled: "red",
};

/** Every forward move staff may make, including skips, so a drink can go straight to Handed over. */
const FORWARD: Record<string, string[]> = {
  placed: ["preparing", "ready", "completed"],
  preparing: ["ready", "completed"],
  ready: ["completed"],
};

export function OrderDetailDrawer({
  orderId,
  onClose,
  onAdvance,
}: {
  orderId: number | null;
  onClose: () => void;
  onAdvance?: (order: OrderSummary, to: string) => void;
}) {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const { data: order, isPending } = useOrder(orderId);
  const [cancelOpen, setCancelOpen] = useState(false);
  const isAdmin = session?.user?.role === "admin";

  const canCancel =
    order && (order.status === "placed" || (isAdmin && ["preparing", "ready"].includes(order.status)));

  return (
    <Drawer opened={orderId !== null} onClose={onClose} position="right" size="md"
      title={order ? t("order.title", { number: order.order_number }) : ""}>
      {isPending || !order ? (
        <Loader />
      ) : (
        <Stack gap="sm">
          <Group gap="xs">
            <Badge color={STATUS_COLOR[order.status]}>{t(`status.${order.status}`)}</Badge>
            <Badge variant="light" color={order.payment_status === "paid" ? "green" : "gray"}>
              {t(`paymentStatus.${order.payment_status}`)}
            </Badge>
            <Badge variant="outline" color="gray">
              {t(`channel.${order.channel}`)}
            </Badge>
            {order.auto_closed && <Badge color="yellow">{t("order.autoClosed")}</Badge>}
          </Group>
          <Text size="sm" ff="monospace">{t("order.idLabel", { code: order.order_code })}</Text>
          {(order.customer_name || order.customer_phone) && (
            <Text>
              {[order.customer_name, order.customer_phone].filter(Boolean).join(" · ")}
            </Text>
          )}
          {order.created_by_name && (
            <Text size="sm" c="dimmed">
              {t("order.keyedBy", { name: order.created_by_name })}
            </Text>
          )}

          <Divider />
          {order.items.map((line) => (
            <Group key={line.id} justify="space-between" align="flex-start" wrap="nowrap">
              <div>
                <Text size="sm">
                  {line.quantity}× {line.item_name}
                </Text>
                {line.options.map((o, i) => (
                  <Text key={i} size="xs" c="dimmed">
                    {o.group_name}: {o.option_name}
                    {o.price_sen > 0 ? ` (+${formatSen(o.price_sen)})` : ""}
                  </Text>
                ))}
                {line.note && (
                  <Text size="xs" c="orange.8">
                    “{line.note}”
                  </Text>
                )}
              </div>
              <Text size="sm">{formatSen(line.line_total_sen)}</Text>
            </Group>
          ))}
          <Group justify="space-between">
            <Text fw={700}>{t("common.total")}</Text>
            <Text fw={700}>{formatSen(order.total_sen)}</Text>
          </Group>
          {order.note && (
            <Text size="sm" c="orange.8">
              {t("board.note")}: {order.note}
            </Text>
          )}
          {order.cancel_reason && (
            <Text size="sm" c="red">
              {t("order.cancelReason")}: {order.cancel_reason}
            </Text>
          )}

          <Divider label={t("order.payments")} labelPosition="left" />
          {order.payments.map((p) => (
            <Group key={p.id} justify="space-between">
              <Text size="sm">
                {t(`paymentKind.${p.kind}`)} · {t(`paymentMethod.${p.method}`)}
                {p.recorded_by_name ? ` · ${p.recorded_by_name}` : ""}
              </Text>
              <Text size="sm" c={p.kind === "refund" ? "red" : undefined}>
                {p.kind === "refund" ? "−" : ""}
                {formatSen(p.amount_sen)}
              </Text>
            </Group>
          ))}

          <Divider label={t("order.history")} labelPosition="left" />
          <Timeline active={order.events.length} bulletSize={12} lineWidth={2}>
            {order.events.map((e, i) => (
              <Timeline.Item key={i} title={t(`status.${e.to_status}`)}>
                <Text size="xs" c="dimmed">
                  {formatTime(e.created_at)} · {e.actor_name ?? t(`actor.${e.actor_type}`)}
                  {e.note ? ` · ${e.note}` : ""}
                </Text>
              </Timeline.Item>
            ))}
          </Timeline>
          <Text size="xs" c="dimmed">
            {formatDateTime(order.created_at)}
          </Text>

          {onAdvance && FORWARD[order.status] && (
            <Group grow>
              {FORWARD[order.status].map((to) => (
                <Button key={to} variant={to === FORWARD[order.status][0] ? "filled" : "light"}
                  onClick={() => { onAdvance(order, to); onClose(); }}>
                  {t(`board.moveTo.${to}`)}
                </Button>
              ))}
            </Group>
          )}
          {canCancel && (
            <Button color="red" variant="subtle" onClick={() => setCancelOpen(true)}>
              {t("order.cancel")}
            </Button>
          )}
          <CancelOrderModal order={cancelOpen ? order : null} onClose={() => setCancelOpen(false)} />
        </Stack>
      )}
    </Drawer>
  );
}
