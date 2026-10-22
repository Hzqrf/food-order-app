import { Badge, Button, Center, Group, Loader, SimpleGrid, Stack, Text } from "@mantine/core";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";

import { useSession } from "../../../api/auth";
import { isApiError } from "../../../api/client";
import { useOrder, useTransition } from "../../../api/orders";
import type { OrderSummary } from "../../../api/types";
import { ErrorState } from "../../../components/ErrorState";
import { notifyError } from "../../../components/errors";
import { formatDateTime, formatTime } from "../../../lib/dates";
import { formatSen } from "../../../lib/money";
import { CancelOrderModal } from "../components/CancelOrderModal";
import { RefundModal } from "../components/RefundModal";
import { isUnpaidAtCounter, TakePaymentModal } from "../components/TakePaymentModal";
import { useStaff } from "../console/lock";
import { PageHeader } from "../console/PageHeader";
import { SectionCard, tileStyle } from "../console/SectionCard";
import { StatusLabel } from "../console/StatusLabel";
import { toast } from "../console/toast";
import type { QueueState } from "./BoardPage";
import { tokens } from "../../../ui/tokens";

/** Every forward move staff may make, including skips, so a drink can go straight to Collected. */
const FORWARD: Record<string, string[]> = {
  placed: ["preparing", "ready", "completed"],
  preparing: ["ready", "completed"],
  ready: ["completed"],
};

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Group justify="space-between" gap="md" wrap="nowrap" py={10} style={{ borderBottom: `1px solid ${tokens.border}` }}>
      <Text fz={14} c={tokens.body}>{label}</Text>
      <Text fz={14} c={tokens.text} ta="right">{value}</Text>
    </Group>
  );
}

export default function OrderPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { ensureUnlocked } = useStaff();
  const { data: session } = useSession();
  const orderId = Number(id);
  const { data: order, isPending, isError, error, refetch } = useOrder(Number.isFinite(orderId) ? orderId : null);
  const transition = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  // What to do once the money is in: nothing, or finish the hand-over that asked for it.
  const [afterPaid, setAfterPaid] = useState<"completed" | null>(null);
  const isAdmin = session?.user?.role === "admin";
  // Came from the queue, search or sales: go back there; a pasted link goes to the queue.
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/staff"));

  if (isPending) {
    return (
      <Center h="40vh">
        <Loader />
      </Center>
    );
  }
  if (isError || !order) {
    return (
      <>
        <PageHeader title={t("order.title", { number: "" })} back={back} />
        {isApiError(error, "not_found") ? <Text c="dimmed">{t("console.order.notFound")}</Text>
          : <ErrorState onRetry={() => refetch()} />}
      </>
    );
  }

  // Staff can also cancel a no-show paying at the counter: nothing was paid, so nothing goes back.
  const canCancel = order.status === "placed" || ((isAdmin || isUnpaidAtCounter(order))
    && ["preparing", "ready"].includes(order.status));
  const canRefund = isAdmin && order.payment_status === "paid" && order.payments.some((p) => p.refundable_sen > 0);
  const move = (to: string, current: OrderSummary = order) => {
    if (!ensureUnlocked()) return;
    // An order paid at the counter can't leave unpaid: take the money first, then hand it over.
    if (to === "completed" && isUnpaidAtCounter(current)) {
      setAfterPaid("completed");
      setPaying(true);
      return;
    }
    // Handing over from a ready order happens on the queue, which gives 5 seconds to undo it.
    if (to === "completed" && current.status === "ready") {
      const state: QueueState = { handOver: order.id };
      navigate("/staff", { state });
      return;
    }
    transition.mutate({ id: current.id, to, version: current.version }, {
      onSuccess: () => toast(t("console.order.moved", { number: order.order_number, status: t(`status.${to}`) })),
      onError: (e) => notifyError(t, e),
    });
  };

  return (
    <Stack gap={0}>
      <PageHeader title={t("order.title", { number: `#${order.order_number}` })}
        subtitle={formatDateTime(order.created_at)} back={back} />
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing={20} style={{ alignItems: "start" }}>
        <SectionCard
          title={
            <Group gap="sm">
              <Text fz={18} lh="28px" fw={600} c={tokens.text}>
                {t("console.order.items")}
              </Text>
              <StatusLabel kind="status" value={order.status} />
              {order.auto_closed && <Badge color="yellow" variant="light">{t("order.autoClosed")}</Badge>}
            </Group>
          }
          actions={<>
            {isUnpaidAtCounter(order) && (
              <Button color="orange.7" onClick={() => {
                if (!ensureUnlocked()) return;
                setAfterPaid(null);
                setPaying(true);
              }}>
                {t("order.takePayment")}
              </Button>
            )}
            {FORWARD[order.status]?.map((to, i) => (
              <Button key={to} variant={i === 0 ? "filled" : "light"} color={i === 0 ? undefined : "gray"}
                loading={transition.isPending} onClick={() => move(to)}>
                {t(`board.moveTo.${to}`)}
              </Button>
            ))}
          </>}
        >
          <Stack gap={12}>
            {order.items.map((line) => (
              <Group key={line.id} justify="space-between" align="flex-start" wrap="nowrap" pb={12}
                style={{ borderBottom: `1px solid ${tokens.border}` }}>
                <Stack gap={4}>
                  <Text fz={15} lh="22px" fw={600} c={tokens.text}>
                    {line.quantity} × {line.item_name}
                  </Text>
                  {line.options.length > 0 && (
                    <Text fz={13} c={tokens.muted}>
                      {line.options.map((o) => `${o.option_name}${o.price_sen > 0 ? ` (+${formatSen(o.price_sen)})` : ""}`).join(" · ")}
                    </Text>
                  )}
                  {line.note && <Text fz={13} c="orange.8">“{line.note}”</Text>}
                </Stack>
                <Text fz={15} c={tokens.text}>{formatSen(line.line_total_sen)}</Text>
              </Group>
            ))}
            <Group justify="space-between">
              <Text fz={16} fw={600} c={tokens.text}>{t("common.total")}</Text>
              <Text fz={16} fw={600} c={tokens.text}>{formatSen(order.total_sen)}</Text>
            </Group>
            {order.note && (
              <Stack gap={6} p={16} style={tileStyle}>
                <Text fz={13} fw={600} c={tokens.text}>{t("console.order.customerNote")}</Text>
                <Text fz={14} c={tokens.body}>{order.note}</Text>
              </Stack>
            )}
            {order.cancel_reason && (
              <Text fz={14} c="red">{t("order.cancelReason")}: {order.cancel_reason}</Text>
            )}
            {(canCancel || canRefund) && (
              <Group gap="xs" mt="xs">
                {canCancel && (
                  <Button color="red" variant="subtle" onClick={() => ensureUnlocked() && setCancelOpen(true)}>
                    {t("order.cancel")}
                  </Button>
                )}
                {canRefund && (
                  <Button color="red" variant="light" onClick={() => setRefundOpen(true)}>
                    {t("refund.button")}
                  </Button>
                )}
              </Group>
            )}
          </Stack>
        </SectionCard>

        <Stack gap={20}>
          <SectionCard title={t("console.order.pickup")}>
            <Stack gap={0} mt={-10}>
              <Row label={t("console.order.customer")} value={order.customer_name ?? "—"} />
              <Row label={t("console.order.phone")} value={order.customer_phone ?? "—"} />
              <Row label={t("console.order.channel")} value={t(`channel.${order.channel}`)} />
              <Row label={t("console.order.code")} value={<Text span ff="monospace" inherit>{order.order_code}</Text>} />
              <Row label={t("console.order.payment")} value={[
                t(`paymentStatus.${order.payment_status}`),
                ...new Set(order.payments.filter((p) => p.kind === "charge").map((p) => t(`paymentMethod.${p.method}`))),
              ].join(" · ")} />
              {order.created_by_name && <Row label={t("console.order.keyedBy")} value={order.created_by_name} />}
              {order.claimed_by_name && <Row label={t("console.order.takenBy")} value={order.claimed_by_name} />}
              <Group justify="space-between" pt={12}>
                <Text fz={14} fw={600} c={tokens.text}>{t("common.total")}</Text>
                <Text fz={14} fw={600} c={tokens.text}>{formatSen(order.total_sen)}</Text>
              </Group>
            </Stack>
          </SectionCard>

          <SectionCard title={t("console.order.timeline")}>
            <Stack gap={10}>
              {order.events.map((e, i) => (
                <Group key={i} justify="space-between" gap="md" wrap="nowrap" align="flex-start">
                  <Stack gap={0}>
                    <Text fz={14} c={tokens.body}>{t(`status.${e.to_status}`)}</Text>
                    <Text fz={12} c={tokens.muted}>
                      {e.actor_name ?? t(`actor.${e.actor_type}`)}{e.note ? ` · ${e.note}` : ""}
                    </Text>
                  </Stack>
                  <Text fz={14} c={tokens.text}>{formatTime(e.created_at)}</Text>
                </Group>
              ))}
            </Stack>
          </SectionCard>

          {order.payments.length > 0 && (
            <SectionCard title={t("order.payments")}>
              <Stack gap={8}>
                {order.payments.map((p) => (
                  <Group key={p.id} justify="space-between" wrap="nowrap">
                    <Text fz={14} c={tokens.body}>
                      {t(`paymentKind.${p.kind}`)} · {t(`paymentMethod.${p.method}`)}
                      {p.recorded_by_name ? ` · ${p.recorded_by_name}` : ""}
                    </Text>
                    <Text fz={14} c={p.kind === "refund" ? "red" : tokens.text}>
                      {p.kind === "refund" ? "−" : ""}{formatSen(p.amount_sen)}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </SectionCard>
          )}
        </Stack>
      </SimpleGrid>
      <CancelOrderModal order={cancelOpen ? order : null} onClose={() => setCancelOpen(false)} />
      <RefundModal order={refundOpen ? order : null} onClose={() => setRefundOpen(false)} />
      <TakePaymentModal order={paying ? order : null} onClose={() => setPaying(false)}
        onPaid={(paid) => afterPaid && move(afterPaid, { ...order, ...paid })} />
    </Stack>
  );
}
