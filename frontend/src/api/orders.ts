import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type { CancelIn, CounterOrderIn, CounterOrderOut, OrderDetail, OrderSummary } from "./types";

export const boardKey = ["board"];

export function useBoard() {
  return useQuery({
    queryKey: boardKey,
    queryFn: () => api<OrderSummary[]>("/staff/orders", { poll: true }),
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
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

export function useCancelOrder() {
  return useOrderMutation(({ id, ...body }: CancelIn & { id: number }) =>
    api<OrderSummary>(`/staff/orders/${id}/cancel`, { body }),
  );
}
