import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { type CartLine, lineKey, toRequestLines } from "../../lib/cart";
import { readJson, writeJson } from "../../lib/storage";

const STORAGE_KEY = "cart";
const MAX_QTY = 20;

type Cart = {
  lines: CartLine[];
  count: number;
  add: (itemId: number, optionIds: number[], quantity?: number, note?: string) => void;
  setQuantity: (key: string, quantity: number) => void;
  clear: () => void;
  requestLines: ReturnType<typeof toRequestLines>;
};

const CartContext = createContext<Cart | null>(null);

/** The cart is only ids and quantities; prices always come from the server. Kept on the device. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() => readJson<CartLine[]>(STORAGE_KEY, []));

  useEffect(() => writeJson(STORAGE_KEY, lines), [lines]);

  const add = useCallback((itemId: number, optionIds: number[], quantity = 1, note?: string) => {
    const key = lineKey(itemId, optionIds) + (note ? `|${note}` : "");
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + quantity) } : l));
      }
      return [...prev, { key, itemId, optionIds, quantity: Math.min(MAX_QTY, quantity), note }];
    });
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_QTY, quantity) } : l)),
    );
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(
    () => ({
      lines,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      add,
      setQuantity,
      clear,
      requestLines: toRequestLines(lines),
    }),
    [lines, add, setQuantity, clear],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): Cart {
  const cart = useContext(CartContext);
  if (!cart) throw new Error("useCart outside CartProvider");
  return cart;
}
