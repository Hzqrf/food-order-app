import { Button, Chip, Group, Modal, Radio, Stack, Text, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSession } from "../../../api/auth";
import { useCancelOrder } from "../../../api/orders";
import type { OrderDetail } from "../../../api/types";
import { notifyError } from "../../../components/errors";
import { formatSen } from "../../../lib/money";

const QUICK_REASONS = ["cancel.reasons.soldOut", "cancel.reasons.changedMind", "cancel.reasons.duplicate"];

/** Cancelling a paid order forces a decision on how the money goes back. */
type RefundMethod = "cash" | "original" | "later";

export function CancelOrderModal({ order, onClose }: { order: OrderDetail | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const cancel = useCancelOrder();
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState<RefundMethod | "">("");

  useEffect(() => {
    if (order) {
      setReason("");
      setRefund("");
    }
  }, [order]);

  if (!order) return null;
  const paid = order.payment_status === "paid";
  const charge = order.payments.find((p) => p.kind === "charge" && p.status === "succeeded");
  // Money paid online goes back through the gateway, which only the owner can do.
  const online = charge?.method === "gateway";
  const isOwner = session?.user?.role === "admin";
  const ready = reason.trim().length > 0 && (!paid || refund !== "");

  const submit = () => {
    const body = {
      id: order.id,
      version: order.version,
      reason: reason.trim(),
      refund_method: paid ? (refund as RefundMethod) : null,
    };
    // The server decides what this person may cancel: staff only Placed, the owner any active order.
    cancel.mutate(body, { onSuccess: onClose, onError: (e) => notifyError(t, e) });
  };

  return (
    <Modal opened onClose={onClose} title={t("cancel.title", { number: order.order_number })} centered>
      <Stack>
        <Chip.Group>
          <Group gap="xs">
            {QUICK_REASONS.map((key) => (
              <Chip key={key} checked={reason === t(key)} onChange={() => setReason(t(key))} size="sm">
                {t(key)}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
        <TextInput label={t("cancel.reason")} value={reason} maxLength={200}
          onChange={(e) => setReason(e.currentTarget.value)} />
        {paid && (
          <Radio.Group label={t("cancel.refundHow", { amount: formatSen(order.total_sen) })} value={refund}
            onChange={(v) => setRefund(v as RefundMethod)} withAsterisk>
            <Stack gap="xs" mt="xs">
              {online && <Radio value="later" label={t("cancel.refundLater")} />}
              {(!online || isOwner) && <Radio value="cash" label={t("cancel.refundCash")} />}
              {charge && charge.method !== "cash" && (!online || isOwner) && (
                <Radio value="original" label={online ? t("cancel.refundGatewayDone")
                  : t("cancel.refundOriginal", { method: t(`paymentMethod.${charge.method}`) })} />
              )}
            </Stack>
          </Radio.Group>
        )}
        {paid && (
          <Text size="xs" c="dimmed">
            {t("cancel.refundNote")}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("common.back")}
          </Button>
          <Button color="red" disabled={!ready} loading={cancel.isPending} onClick={submit}>
            {t("cancel.confirm")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
