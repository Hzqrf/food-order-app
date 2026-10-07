import { Alert, Button, Group, SegmentedControl, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { useInterval, useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { isApiError } from "../../../api/client";
import { useShop } from "../../../api/menu";
import { useBoard, useTransition } from "../../../api/orders";
import type { OrderSummary } from "../../../api/types";
import { ErrorState } from "../../../components/ErrorState";
import { notifyError } from "../../../components/errors";
import { useNewOrderAlert } from "../../../hooks/useNewOrderAlert";
import { formatTime } from "../../../lib/dates";
import { NEXT_STEP, OrderCard } from "../components/OrderCard";
import { OrderDetailDrawer } from "../components/OrderDetailDrawer";
import { useStaff } from "../StaffLayout";

const COLUMNS = [
  { status: "placed", label: "board.columns.new" },
  { status: "preparing", label: "board.columns.preparing" },
  { status: "ready", label: "board.columns.ready" },
] as const;

const UNDO_MS = 5_000;

export default function BoardPage() {
  const { t } = useTranslation();
  const { ensureUnlocked } = useStaff();
  const board = useBoard();
  const { data: shop } = useShop();
  const transition = useTransition();
  const { flashing, acknowledge } = useNewOrderAlert(board.data);
  const wide = useMediaQuery("(min-width: 62em)", true);
  const [column, setColumn] = useState<string>("placed");
  const [openId, setOpenId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  // "Handed over" waits 5 seconds before it is sent, so an Undo can simply cancel it.
  const [handingOver, setHandingOver] = useState<Set<number>>(new Set());
  const timers = useRef(new Map<number, { handle: number; send: () => void }>());
  const [now, setNow] = useState(Date.now());
  useInterval(() => setNow(Date.now()), 30_000, { autoInvoke: true });

  // Leaving the board inside the undo window sends the hand-over straight away rather than losing it.
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(({ handle, send }) => {
      window.clearTimeout(handle);
      send();
    });
  }, []);

  const send = (order: OrderSummary, to: string) => {
    setBusyId(order.id);
    transition.mutate(
      { id: order.id, to, version: order.version },
      {
        onError: (e) => {
          if (isApiError(e, "version_conflict") || isApiError(e, "invalid_transition")) {
            notifications.show({ color: "yellow", message: t("board.changedElsewhere", { number: order.order_number }) });
          } else {
            notifyError(t, e);
          }
        },
        onSettled: () => {
          setBusyId(null);
          setHandingOver((prev) => {
            const next = new Set(prev);
            next.delete(order.id);
            return next;
          });
        },
      },
    );
  };

  const advance = (order: OrderSummary, to: string) => {
    if (!ensureUnlocked()) return;
    acknowledge(order.id);
    if (to !== "completed") return send(order, to);

    setHandingOver((prev) => new Set(prev).add(order.id));
    const notifId = `undo-${order.id}`;
    const undo = () => {
      window.clearTimeout(timers.current.get(order.id)?.handle);
      timers.current.delete(order.id);
      notifications.hide(notifId);
      setHandingOver((prev) => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    };
    notifications.show({
      id: notifId,
      autoClose: UNDO_MS,
      withCloseButton: false,
      message: (
        <Group justify="space-between">
          <Text size="sm">{t("board.handedOverToast", { number: order.order_number })}</Text>
          <Button size="compact-sm" variant="light" onClick={undo}>
            {t("common.undo")}
          </Button>
        </Group>
      ),
    });
    const fire = () => {
      timers.current.delete(order.id);
      send(order, "completed");
    };
    timers.current.set(order.id, { handle: window.setTimeout(fire, UNDO_MS), send: fire });
  };

  if (board.isPending) return <Text c="dimmed">{t("common.loading")}</Text>;
  if (board.isError && !board.data) return <ErrorState onRetry={() => board.refetch()} />;

  const orders = (board.data ?? []).filter((o) => !handingOver.has(o.id));
  const prep = shop?.prep_minutes ?? 15;
  const visible = wide ? COLUMNS : COLUMNS.filter((c) => c.status === column);

  return (
    <Stack gap="sm">
      {board.isError && (
        <Alert color="red" variant="light">
          {t("board.offline", { time: formatTime(new Date(board.dataUpdatedAt).toISOString()) })}
        </Alert>
      )}
      {!wide && (
        <SegmentedControl
          fullWidth
          value={column}
          onChange={setColumn}
          data={COLUMNS.map((c) => ({
            value: c.status,
            label: `${t(c.label)} (${orders.filter((o) => o.status === c.status).length})`,
          }))}
        />
      )}
      <SimpleGrid cols={wide ? 3 : 1} spacing="md">
        {visible.map((c) => {
          const list = orders.filter((o) => o.status === c.status);
          return (
            <Stack key={c.status} gap="sm">
              {wide && (
                <Title order={5} c="dimmed">
                  {t(c.label)} ({list.length})
                </Title>
              )}
              {list.length === 0 && (
                <Text size="sm" c="dimmed">
                  {c.status === "placed" ? t("board.emptyNew") : "—"}
                </Text>
              )}
              {list.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  now={now}
                  prepMinutes={prep}
                  flashing={flashing.has(o.id)}
                  busy={busyId === o.id}
                  onAdvance={() => {
                    const next = NEXT_STEP[o.status];
                    if (next) advance(o, next.to);
                  }}
                  onOpen={() => {
                    acknowledge(o.id);
                    if (ensureUnlocked()) setOpenId(o.id);
                  }}
                />
              ))}
            </Stack>
          );
        })}
      </SimpleGrid>
      <OrderDetailDrawer orderId={openId} onClose={() => setOpenId(null)} onAdvance={advance} />
    </Stack>
  );
}
