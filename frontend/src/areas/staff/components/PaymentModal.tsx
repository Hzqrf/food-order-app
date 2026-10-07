import { Button, Group, Modal, NumberInput, SegmentedControl, Stack, Text, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { newIdempotencyKey } from "../../../api/client";
import type { PaymentMethod } from "../../../api/types";
import { formatSen, ringgitToSen } from "../../../lib/money";

const QUICK_NOTES = [1000, 2000, 5000, 10000];

/**
 * Take the money, then confirm. The idempotency key is made once when the sheet opens, so a retry
 * after a dropped connection can never create a second order.
 */
export function PaymentModal({ opened, totalSen, busy, onClose, onConfirm }: {
  opened: boolean;
  totalSen: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (p: { method: PaymentMethod; tenderedSen: number | null; key: string }) => void;
}) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [tendered, setTendered] = useState<number | string>("");
  const [key, setKey] = useState(newIdempotencyKey);

  useEffect(() => {
    if (opened) {
      setMethod("cash");
      setTendered("");
      setKey(newIdempotencyKey());
    }
  }, [opened]);

  const tenderedSen = tendered === "" ? null : ringgitToSen(tendered);
  const change = tenderedSen === null ? 0 : tenderedSen - totalSen;
  const cashOk = tenderedSen === null || change >= 0;

  return (
    <Modal opened={opened} onClose={onClose} title={t("payment.title")} centered size="md">
      <Stack>
        <Title order={2} ta="center">
          {formatSen(totalSen)}
        </Title>
        <SegmentedControl fullWidth size="md" value={method} onChange={(v) => setMethod(v as PaymentMethod)}
          data={[
            { value: "cash", label: t("paymentMethod.cash") },
            { value: "qr_counter", label: t("paymentMethod.qr_counter") },
            { value: "card_terminal", label: t("paymentMethod.card_terminal") },
          ]} />

        {method === "cash" ? (
          <>
            <NumberInput size="lg" label={t("payment.amountGiven")} prefix="RM " decimalScale={2} min={0}
              hideControls value={tendered} onChange={setTendered} placeholder={t("payment.exact")} />
            <Group gap="xs" grow>
              <Button variant="light" onClick={() => setTendered(totalSen / 100)}>
                {t("payment.exact")}
              </Button>
              {QUICK_NOTES.filter((n) => n >= totalSen).slice(0, 4).map((n) => (
                <Button key={n} variant="light" onClick={() => setTendered(n / 100)}>
                  RM{n / 100}
                </Button>
              ))}
            </Group>
            <Group justify="space-between">
              <Text size="lg">{t("payment.change")}</Text>
              <Text size="xl" fw={800} c={cashOk ? "green.8" : "red"}>
                {cashOk ? formatSen(Math.max(change, 0)) : t("payment.notEnough")}
              </Text>
            </Group>
          </>
        ) : (
          <Text c="dimmed" ta="center">
            {t("payment.confirmReceived")}
          </Text>
        )}

        <Button size="xl" disabled={!cashOk} loading={busy}
          onClick={() => onConfirm({ method, tenderedSen: method === "cash" ? tenderedSen : null, key })}>
          {method === "cash" ? t("payment.cashReceived") : t("payment.paymentReceived")}
        </Button>
      </Stack>
    </Modal>
  );
}
