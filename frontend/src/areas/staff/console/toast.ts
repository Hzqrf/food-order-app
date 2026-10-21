import { notifications } from "@mantine/notifications";

import { tokens } from "../../../ui/tokens";

/** The design's dark toast, bottom-right. Console only; customer pages keep their own notifications. */
export function toast(message: string, kind: "success" | "error" = "success"): void {
  notifications.show({
    message,
    position: "bottom-right",
    color: kind === "error" ? "red" : "green",
    autoClose: 3200,
    withBorder: false,
    styles: {
      root: { background: tokens.dark, boxShadow: "0 12px 24px -8px rgba(16, 24, 40, 0.25)" },
      description: { color: tokens.card, fontWeight: 500 },
      closeButton: { color: tokens.card },
    },
  });
}
