import { useCallback, useEffect, useRef, useState } from "react";

import type { OrderSummary } from "../api/types";

let audioCtx: AudioContext | null = null;

/** A short two-tone chime made with Web Audio, so there is no sound file to ship. */
export function playChime() {
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  } catch {
    /* audio blocked until the first tap; the flashing card still shows */
  }
}

/**
 * Orders that did not come from this counter (online, phone) chime and flash until someone taps them.
 * Orders already on the board when the page opens are treated as seen.
 */
export function useNewOrderAlert(orders: OrderSummary[] | undefined) {
  const seen = useRef<Set<number> | null>(null);
  const [flashing, setFlashing] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!orders) return;
    if (seen.current === null) {
      seen.current = new Set(orders.map((o) => o.id));
      return;
    }
    const fresh = orders.filter((o) => !seen.current!.has(o.id));
    fresh.forEach((o) => seen.current!.add(o.id));
    const alerting = fresh.filter((o) => o.channel !== "counter");
    if (alerting.length) {
      playChime();
      setFlashing((prev) => new Set([...prev, ...alerting.map((o) => o.id)]));
    }
  }, [orders]);

  const acknowledge = useCallback((id: number) => {
    setFlashing((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return { flashing, acknowledge };
}
