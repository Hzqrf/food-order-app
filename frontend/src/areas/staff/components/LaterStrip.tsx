import { Badge, Button, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { useTranslation } from "react-i18next";

import type { OrderSummary } from "../../../api/types";
import { formatTime } from "../../../lib/dates";
import { formatSen } from "../../../lib/money";
import { tokens } from "../../../ui/tokens";
import { SectionCard, tileStyle } from "../console/SectionCard";
import { isUnpaidAtCounter } from "./TakePaymentModal";

/** A pre-order still waiting for its start time (pickup time minus prep). It joins New on its own. */
export function isLater(o: OrderSummary, now: number): boolean {
  return o.status === "placed" && o.start_at !== null && now < Date.parse(o.start_at);
}

/** Pre-orders coming up later today, so the kitchen can plan. Each can be started early. */
export function LaterStrip({ orders, busyId, onStart, onOpen }: {
  orders: OrderSummary[];
  busyId: number | null;
  onStart: (o: OrderSummary) => void;
  onOpen: (o: OrderSummary) => void;
}) {
  const { t } = useTranslation();
  return (
    <SectionCard title={t("board.later")} actions={<Badge variant="light" color="blue">{orders.length}</Badge>}>
      <Group gap={12} align="stretch">
        {orders.map((o) => (
          <Stack key={o.id} gap={8} p={12} w={240} style={tileStyle}>
            <UnstyledButton onClick={() => onOpen(o)} aria-label={t("order.title", { number: o.order_number })}>
              <Text fz={15} fw={700} c={tokens.text}>#{o.order_number}</Text>
              <Text fz={13} fw={600} c="blue.7">
                {t("board.laterCard", { time: formatTime(o.pickup_at), start: formatTime(o.start_at) })}
              </Text>
              <Stack gap={0} mt={6}>
                {o.items.map((line) => (
                  <Text key={line.id} fz={13} c={tokens.body} truncate>{line.quantity}× {line.item_name}</Text>
                ))}
              </Stack>
            </UnstyledButton>
            <Group justify="space-between" wrap="nowrap">
              {isUnpaidAtCounter(o)
                ? <Badge size="sm" variant="filled" color="orange.7">{t("order.unpaid", { total: formatSen(o.total_sen) })}</Badge>
                : <Text fz={14} fw={600}>{formatSen(o.total_sen)}</Text>}
              <Button size="compact-sm" variant="light" loading={busyId === o.id} onClick={() => onStart(o)}>
                {t("board.startEarly")}
              </Button>
            </Group>
          </Stack>
        ))}
      </Group>
    </SectionCard>
  );
}
