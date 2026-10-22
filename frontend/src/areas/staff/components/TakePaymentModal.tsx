import { useTranslation } from "react-i18next";

import { useTakePayment } from "../../../api/orders";
import type { OrderSummary } from "../../../api/types";
import { notifyError } from "../../../components/errors";
import { formatSen } from "../../../lib/money";
import { toast } from "../console/toast";
import { PaymentModal } from "./PaymentModal";

/** An online order the customer pays for at pickup, and nobody has taken the money yet. */
export function isUnpaidAtCounter(o: Pick<OrderSummary, "pay_at_counter" | "payment_status" | "status">): boolean {
  return o.pay_at_counter && o.payment_status === "unpaid" && o.status !== "cancelled";
}

/** Takes the money for an order paid at the counter, then hands back the updated order. */
export function TakePaymentModal({ order, onClose, onPaid }: {
  order: OrderSummary | null;
  onClose: () => void;
  onPaid?: (paid: OrderSummary) => void;
}) {
  const { t } = useTranslation();
  const take = useTakePayment();
  return (
    <PaymentModal opened={order !== null} totalSen={order?.total_sen ?? 0} busy={take.isPending} onClose={onClose}
      onConfirm={({ method, tenderedSen, key }) => {
        if (!order) return;
        take.mutate({ id: order.id, method, tenderedSen, key }, {
          onSuccess: (paid) => {
            toast(paid.change_sen ? t("payment.giveChange", { amount: formatSen(paid.change_sen) })
              : t("payment.paymentReceived"));
            onClose();
            onPaid?.(paid);
          },
          onError: (e) => notifyError(t, e),
        });
      }} />
  );
}
