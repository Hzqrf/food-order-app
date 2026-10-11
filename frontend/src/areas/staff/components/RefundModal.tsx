import { Button, Group, Modal, Radio, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useRefund } from "../../../api/admin";
import type { OrderDetail } from "../../../api/types";
import { notifyError } from "../../../components/errors";
import { formatSen } from "../../../lib/money";

/**
 * Owner only. Records money already sent back: cash from the drawer, or a refund done in the
 * terminal or gateway dashboard. With several payments (a double charge) one can be refunded alone.
 */
export function RefundModal({ order, onClose }: { order: OrderDetail | null; onClose: () => void }) {
  const { t } = useTranslation();
  const refund = useRefund();
  const [which, setWhich] = useState("all");
  const [method, setMethod] = useState<"cash" | "original" | "">("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    setWhich("all");
    setMethod("");
    setReason("");
  }, [order]);

  if (!order) return null;
  const charges = order.payments.filter((p) => p.kind === "charge" && p.refundable_sen > 0);
  const total = charges.reduce((s, p) => s + p.refundable_sen, 0);
  const amount = which === "all" ? total : charges.find((p) => String(p.id) === which)?.refundable_sen ?? 0;

  const submit = () => refund.mutate(
    { id: order.id, reason: reason.trim(), refund_method: method as "cash" | "original",
      payment_id: which === "all" ? null : Number(which) },
    {
      onSuccess: () => {
        notifications.show({ color: "green", message: t("refund.done", { amount: formatSen(amount) }) });
        onClose();
      },
      onError: (e) => notifyError(t, e),
    },
  );

  return (
    <Modal opened onClose={onClose} centered title={t("refund.title", { number: order.order_number })}>
      <Stack>
        {charges.length > 1 && (
          <Radio.Group label={t("refund.which")} value={which} onChange={setWhich}>
            <Stack gap="xs" mt="xs">
              <Radio value="all" label={t("refund.all", { amount: formatSen(total) })} />
              {charges.map((p, i) => (
                <Radio key={p.id} value={String(p.id)} label={t("refund.one", {
                  n: i + 1, method: t(`paymentMethod.${p.method}`), amount: formatSen(p.refundable_sen),
                })} />
              ))}
            </Stack>
          </Radio.Group>
        )}
        <Radio.Group label={t("refund.how", { amount: formatSen(amount) })} value={method}
          onChange={(v) => setMethod(v as "cash" | "original")} withAsterisk>
          <Stack gap="xs" mt="xs">
            <Radio value="cash" label={t("cancel.refundCash")} />
            <Radio value="original" label={t("refund.original")} />
          </Stack>
        </Radio.Group>
        <TextInput label={t("cancel.reason")} value={reason} maxLength={200} onChange={(e) => setReason(e.currentTarget.value)} />
        <Text size="xs" c="dimmed">{t("refund.note")}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{t("common.back")}</Button>
          <Button color="red" disabled={!method || !reason.trim() || amount <= 0} loading={refund.isPending} onClick={submit}>
            {t("refund.confirm", { amount: formatSen(amount) })}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
