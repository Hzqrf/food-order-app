import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type { CancelIn, CounterOrderIn, CounterOrderOut, OrderDetail, OrderSummary, PaymentMethod, QueueMetrics,
  TakePaymentOut } from "./types";

export const boardKey = ["board"];

export function useBoard() {
  return useQuery({
    queryKey: boardKey,
    queryFn: () => api<OrderSummary[]>("/staff/orders", { poll: true }),
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });
}

/** Numbers above the queue. Counts and minutes only, so the locked tablet can read them too. */
export function useQueueMetrics() {
  return useQuery({
    queryKey: ["queue-metrics"],
    queryFn: () => api<QueueMetrics>("/staff/orders/metrics", { poll: true }),
    refetchInterval: 30_000,
  });
}

export function useOrder(id: number | null) {
  return useQuery({
    queryKey: ["order", id],
    queryFn: () => api<OrderDetail>(`/staff/orders/${id}`),
    enabled: id !== null,
  });
}

export function useOrderSearch(q: string) {
  return useQuery({
    queryKey: ["order-search", q],
    queryFn: () => api<OrderSummary[]>(`/staff/orders/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 0,
  });
}

function useOrderMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // The server bumps the order's version on every change. Put the fresh row on the board now, so a
    // second tap before the refetch lands (Take, then Start Cooking) does not send a stale version.
    onSuccess: (result) => {
      const fresh = result as Partial<OrderSummary> | undefined;
      if (!fresh?.id || fresh.version === undefined) return;
      qc.setQueryData<OrderSummary[]>(boardKey, (rows) =>
        rows?.map((o) => (o.id === fresh.id ? { ...o, ...fresh } : o)));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: boardKey });
      qc.invalidateQueries({ queryKey: ["order"] });
      qc.invalidateQueries({ queryKey: ["order-search"] });
    },
  });
}

export function useCreateCounterOrder() {
  return useOrderMutation(({ body, key }: { body: CounterOrderIn; key: string }) =>
    api<CounterOrderOut>("/staff/orders", { body, headers: { "Idempotency-Key": key } }),
  );
}

export function useTransition() {
  return useOrderMutation(({ id, to, version }: { id: number; to: string; version: number }) =>
    api<OrderSummary>(`/staff/orders/${id}/transition`, { body: { to, version } }),
  );
}

/** Money taken at pickup for an online order paid at the counter. */
export function useTakePayment() {
  return useOrderMutation(({ id, method, tenderedSen, key }:
    { id: number; method: PaymentMethod; tenderedSen: number | null; key: string }) =>
    api<TakePaymentOut>(`/staff/orders/${id}/payment`,
      { body: { method, tendered_sen: tenderedSen }, headers: { "Idempotency-Key": key } }),
  );
}

export function useCancelOrder() {
  return useOrderMutation(({ id, ...body }: CancelIn & { id: number }) =>
    api<OrderSummary>(`/staff/orders/${id}/cancel`, { body }),
  );
}

/** Take a ticket without starting it. Start Cooking also claims an unclaimed ticket. */
export function useClaim() {
  return useOrderMutation(({ id, version }: { id: number; version: number }) =>
    api<OrderSummary>(`/staff/orders/${id}/claim`, { body: { version } }),
  );
}
