import { Badge, Box, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import { useQueries } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { api, isApiError } from "../../../api/client";
import type { TrackingOut } from "../../../api/types";
import { formatDateTime, formatTime } from "../../../lib/dates";
import { formatSen } from "../../../lib/money";
import { forgetOrder, loadRecent } from "../../../lib/storage";
import { radius, tokens } from "../../../ui/tokens";

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

/** Guests keep links to their recent orders on this device, newest first. No account needed. */
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
  if (visible.length === 0) {
    return <Text c={tokens.muted} ta="center" mt={60}>{t("customer.ordersEmpty")}</Text>;
  }

  return (
    <Stack gap={10}>
      {recent.map((o, i) => {
        const data = results[i]?.data;
        if (isApiError(results[i]?.error, "not_found")) return null;
        const status = data ? statusOf(data) : null;
        return (
          <UnstyledButton key={o.token} component={Link} to={`/t/${o.token}`} p={14} bg={tokens.card}
            style={{ borderRadius: radius.card, boxShadow: tokens.cardShadow }}>
            <Group justify="space-between" wrap="nowrap">
              <Box miw={0}>
                <Group gap={8}>
                  <Text fz={15} fw={600}>#{o.number}</Text>
                  {status && (
                    <Badge size="sm" variant="light" color={status.color}>
                      {t(`customer.recentStatus.${status.key}`)}
                    </Badge>
                  )}
                </Group>
                <Text fz={13} c={tokens.muted} mt={2}>
                  {formatSen(o.totalSen)} · {formatDateTime(o.placedAt)}
                  {data?.pickup_at ? ` · ${t("customer.forTime", { time: formatTime(data.pickup_at) })}` : ""}
                </Text>
              </Box>
              <IconChevronRight size={18} color={tokens.muted} />
            </Group>
          </UnstyledButton>
        );
      })}
    </Stack>
  );
}
