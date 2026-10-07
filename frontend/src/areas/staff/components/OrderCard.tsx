import { Badge, Button, Group, Paper, Stack, Text, UnstyledButton } from "@mantine/core";
import { useTranslation } from "react-i18next";

import type { OrderSummary } from "../../../api/types";
import { minutesSince } from "../../../lib/dates";
import classes from "./OrderCard.module.css";

export const NEXT_STEP: Record<string, { to: string; label: string } | undefined> = {
  placed: { to: "preparing", label: "board.start" },
  preparing: { to: "ready", label: "board.ready" },
  ready: { to: "completed", label: "board.handedOver" },
};

export function OrderCard({
  order,
  now,
  prepMinutes,
  flashing,
  busy,
  onAdvance,
  onOpen,
}: {
  order: OrderSummary;
  now: number;
  prepMinutes: number;
  flashing: boolean;
  busy: boolean;
  onAdvance: () => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const waited = minutesSince(order.placed_at ?? order.created_at, now);
  const late = order.status !== "ready" && waited >= prepMinutes;
  const next = NEXT_STEP[order.status];

  return (
    <Paper
      withBorder
      p="sm"
      className={flashing ? classes.flash : undefined}
      style={{ borderColor: late ? "var(--mantine-color-yellow-6)" : undefined, borderWidth: late ? 2 : 1 }}
    >
      <Stack gap={6}>
        <UnstyledButton onClick={onOpen}>
          <Group justify="space-between" wrap="nowrap">
            <Group gap={6}>
              <Text fw={800} size="xl">
                {order.order_number}
              </Text>
              <Badge size="sm" variant="light" color={order.channel === "online" ? "blue" : "gray"}>
                {t(`channel.${order.channel}`)}
              </Badge>
            </Group>
            <Text size="sm" c={late ? "yellow.8" : "dimmed"} fw={late ? 700 : 400}>
              {t("board.minutes", { count: waited })}
            </Text>
          </Group>
          <Text size="xs" c="dimmed" ff="monospace">
            {order.order_code}
            {order.customer_name ? ` · ${order.customer_name}` : ""}
          </Text>
          <Stack gap={2} mt={4}>
            {order.items.map((line) => (
              <div key={line.id}>
                <Text size="sm">
                  <b>{line.quantity}×</b> {line.item_name}
                </Text>
                {line.options.length > 0 && (
                  <Text size="xs" c="dimmed" pl="md">
                    {line.options.map((o) => o.option_name).join(", ")}
                  </Text>
                )}
                {line.note && (
                  <Text size="xs" c="orange.8" pl="md">
                    “{line.note}”
                  </Text>
                )}
              </div>
            ))}
          </Stack>
          {order.note && (
            <Text size="xs" c="orange.8" mt={4}>
              {t("board.note")}: {order.note}
            </Text>
          )}
        </UnstyledButton>
        {next && (
          <Button size="md" fullWidth loading={busy} onClick={onAdvance}
            color={order.status === "ready" ? "green" : undefined}>
            {t(next.label)}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
