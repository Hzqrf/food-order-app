import { Badge, Group, Paper, ScrollArea, Text, UnstyledButton } from "@mantine/core";
import { useQueries } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { api, isApiError } from "../../../api/client";
import type { TrackingOut } from "../../../api/types";
import { formatDateTime } from "../../../lib/dates";
import { formatSen } from "../../../lib/money";
import { forgetOrder, loadRecent } from "../../../lib/storage";

const FINAL = new Set(["completed", "cancelled"]);

/** A customer-facing status: "Done", "Payment failed", and so on. */
function statusOf(o: TrackingOut): { key: string; color: string } {
  if (o.status === "cancelled") {
    return o.cancel_reason === "payment_expired" ? { key: "paymentFailed", color: "red" } : { key: "cancelled", color: "red" };
  }
  return {
    pending_payment: { key: "awaitingPayment", color: "yellow" },
    placed: { key: "received", color: "blue" },
    preparing: { key: "preparing", color: "orange" },
    ready: { key: "ready", color: "green" },
    completed: { key: "done", color: "teal" },
  }[o.status] ?? { key: "received", color: "blue" };
}

/** Guests keep links to their recent orders on this device. No account needed. */
export function RecentOrders() {
  const { t } = useTranslation();
  const recent = loadRecent();
  const results = useQueries({
    queries: recent.map((o) => ({
      queryKey: ["tracking", o.token],
      queryFn: () => api<TrackingOut>(`/t/${encodeURIComponent(o.token)}`, { poll: true }),
      // Keep live orders fresh; finished ones never change.
      refetchInterval: (q: { state: { data?: TrackingOut } }) =>
        q.state.data && FINAL.has(q.state.data.status) ? false : 15_000,
      retry: false,
    })),
  });

  // A link the shop no longer knows (e.g. data was reset) is dropped from this device.
  useEffect(() => {
    results.forEach((r, i) => {
      if (isApiError(r.error, "not_found")) forgetOrder(recent[i].token);
    });
  }, [results, recent]);

  const visible = recent.filter((_, i) => !isApiError(results[i]?.error, "not_found"));
  if (visible.length === 0) return null;

  return (
    <Paper mt="md" p="sm" withBorder>
      <Text size="sm" fw={600} mb={6}>
        {t("customer.recentOrders")}
      </Text>
      <ScrollArea type="never">
        <Group gap="xs" wrap="nowrap">
          {recent.map((o, i) => {
            const data = results[i]?.data;
            if (isApiError(results[i]?.error, "not_found")) return null;
            const status = data ? statusOf(data) : null;
            return (
              <UnstyledButton key={o.token} component={Link} to={`/t/${o.token}`}>
                <Paper px="sm" py={6} bg="gray.0" radius="md" miw={150}>
                  <Group gap={6} justify="space-between" wrap="nowrap">
                    <Text fw={700} size="sm">#{o.number}</Text>
                    {status && (
                      <Badge size="xs" variant="light" color={status.color}>
                        {t(`customer.recentStatus.${status.key}`)}
                      </Badge>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed">
                    {formatSen(o.totalSen)} · {formatDateTime(o.placedAt)}
                  </Text>
                </Paper>
              </UnstyledButton>
            );
          })}
        </Group>
      </ScrollArea>
    </Paper>
  );
}
