import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type { CartLineIn, OnlineOrderIn, OnlineOrderOut, QuoteOut, TrackingOut } from "./types";

/** Server prices for the cart, and anything no longer available. Refreshed whenever the cart changes. */
export function useQuote(lines: CartLineIn[]) {
  return useQuery({
    queryKey: ["quote", lines],
    queryFn: () => api<QuoteOut>("/orders/quote", { body: { items: lines } }),
    enabled: lines.length > 0,
    staleTime: 15_000,
  });
}

export function usePlaceOrder() {
  return useMutation({
    mutationFn: ({ body, key }: { body: OnlineOrderIn; key: string }) =>
      api<OnlineOrderOut>("/orders", { body, headers: { "Idempotency-Key": key } }),
  });
}

const trackingKey = (token: string) => ["tracking", token];

export function useTracking(token: string) {
  return useQuery({
    queryKey: trackingKey(token),
    queryFn: () => api<TrackingOut>(`/t/${encodeURIComponent(token)}`, { poll: true }),
    // Poll while something can still change; stop once the order is finished.
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (s === "completed" || s === "cancelled") return false;
      return s === "pending_payment" ? 3_000 : 10_000; // fast while a payment is landing
    },
  });
}

export function usePayAgain(token: string) {
  return useMutation({
    mutationFn: () => api<{ payment_url: string }>(`/t/${encodeURIComponent(token)}/pay`, { method: "POST" }),
  });
}

export function useCancelUnpaid(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<TrackingOut>(`/t/${encodeURIComponent(token)}/cancel`, { method: "POST" }),
    onSuccess: (data) => qc.setQueryData(trackingKey(token), data),
  });
}
