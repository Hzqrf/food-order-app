import { Badge, Button, Group, Progress, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import type { OrderSummary } from "../../../api/types";
import { formatSen } from "../../../lib/money";
import { isUnpaidAtCounter } from "./TakePaymentModal";
import { minutesSince } from "../../../lib/dates";
import { tileStyle } from "../console/SectionCard";
import { tokens } from "../../../ui/tokens";
import classes from "./OrderCard.module.css";

export const NEXT_STEP: Record<string, { to: string; label: string } | undefined> = {
  placed: { to: "preparing", label: "board.start" },
  preparing: { to: "ready", label: "board.ready" },
  ready: { to: "completed", label: "board.handedOver" },
};

/** Ready orders waiting this long at the counter turn amber. */
const WAITING_WARN_MIN = 10;

/** One ticket in the queue: number, age, the full kitchen lines, and the one action that moves it on. */
export function OrderCard({
  order,
  now,
  prepMinutes,
  flashing,
  busy,
  onAdvance,
  onTake,
  onOpen,
}: {
  order: OrderSummary;
  now: number;
  prepMinutes: number;
  flashing: boolean;
  busy: boolean;
  onAdvance: () => void;
  onTake: () => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const age = minutesSince(order.placed_at ?? order.created_at, now);
  const cooking = minutesSince(order.preparing_at ?? order.placed_at ?? order.created_at, now);
  const waiting = minutesSince(order.ready_at ?? order.created_at, now);
  const late = order.status !== "ready" && age >= prepMinutes;
  const progress = Math.min(100, (cooking / Math.max(prepMinutes, 1)) * 100);

  const when = (() => {
    if (order.status === "preparing") {
      return late ? t("console.queue.runningLate") : t("console.queue.cookingFor", { count: cooking });
    }
    if (order.status === "ready") return t("console.queue.waiting", { count: waiting });
    return age < 1 ? t("console.queue.justNow") : t("console.queue.minutesAgo", { count: age });
  })();
  const whenColor = late ? tokens.danger : order.status === "ready" && waiting >= WAITING_WARN_MIN ? tokens.warning : tokens.muted;

  return (
    <Stack gap={8} p={14} className={flashing ? classes.flash : undefined} style={tileStyle}>
      <UnstyledButton onClick={onOpen} aria-label={t("order.title", { number: order.order_number })}>
        <Group justify="space-between" wrap="nowrap" gap={8}>
          <Group gap={8} wrap="nowrap" miw={0}>
            <Text fz={17} lh="24px" fw={700} c={tokens.text}>
              #{order.order_number}
            </Text>
            <Badge size="sm" variant="light" color={order.channel === "online" ? "blue" : "gray"}>
              {t(`channel.${order.channel}`)}
            </Badge>
          </Group>
          <Text fz={13} lh="19px" c={whenColor} fw={late ? 600 : 400} style={{ whiteSpace: "nowrap" }}>
            {when}
          </Text>
        </Group>
        {(order.customer_name || order.order_code) && (
          <Text fz={12} c={tokens.muted} mt={2} truncate>
            {order.customer_name ? `${order.customer_name} · ` : ""}
            <Text span ff="monospace" inherit>{order.order_code}</Text>
          </Text>
        )}
        {/* Its own line: the header is too narrow on a three-column board. */}
        {isUnpaidAtCounter(order) && (
          <Badge size="md" variant="filled" color="orange.7" mt={6}>
            {t("order.unpaid", { total: formatSen(order.total_sen) })}
          </Badge>
        )}
        <Stack gap={2} mt={8}>
          {order.items.map((line) => (
            <div key={line.id}>
              <Text fz={14} lh="20px" c={tokens.body}>
                <b>{line.quantity}×</b> {line.item_name}
              </Text>
              {line.options.length > 0 && (
                <Text fz={12} c={tokens.muted} pl="md">
                  {line.options.map((o) => o.option_name).join(", ")}
                </Text>
              )}
              {line.note && (
                <Text fz={12} c="orange.8" pl="md">
                  “{line.note}”
                </Text>
              )}
            </div>
          ))}
        </Stack>
        {order.note && (
          <Text fz={12} c="orange.8" mt={4}>
            {t("board.note")}: {order.note}
          </Text>
        )}
      </UnstyledButton>

      <Group justify="space-between" gap={8}>
        {order.claimed_by_name ? (
          <Badge variant="light" color="orange" leftSection={<IconCheck size={12} />}>
            {t("console.queue.takenBy", { name: order.claimed_by_name })}
          </Badge>
        ) : (
          <span />
        )}
        <Text fz={14} fw={600} c={tokens.text}>
          {formatSen(order.total_sen)}
        </Text>
      </Group>

      {order.status === "preparing" && (
        <Progress value={progress} size="sm" radius="xl" color={late ? "red" : "orange.6"}
          aria-label={t("console.queue.cookingFor", { count: cooking })} />
      )}

      {order.status === "placed" && (
        <Group gap={8} wrap="nowrap">
          <Button flex={1} loading={busy} onClick={onAdvance}>
            {t("console.queue.startCooking")}
          </Button>
          {!order.claimed_by_name && (
            <Button variant="light" color="gray" disabled={busy} onClick={onTake}>
              {t("console.queue.take")}
            </Button>
          )}
        </Group>
      )}
      {order.status === "preparing" && (
        <Button variant="light" color="gray" fullWidth loading={busy} onClick={onAdvance}>
          {t("console.queue.markReady")}
        </Button>
      )}
      {order.status === "ready" && (
        <Button color="dark" fullWidth loading={busy} onClick={onAdvance}>
          {t("console.queue.handOver")}
        </Button>
      )}
    </Stack>
  );
}
