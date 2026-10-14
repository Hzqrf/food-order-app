import { Badge, type BadgeProps } from "@mantine/core";
import { useTranslation } from "react-i18next";

export const STATUS_COLOR: Record<string, string> = {
  pending_payment: "gray",
  placed: "blue",
  preparing: "orange",
  ready: "green",
  completed: "teal",
  cancelled: "red",
};

const AVAILABILITY_COLOR: Record<string, string> = { available: "green", soldOut: "red", hidden: "yellow" };
const PAYMENT_COLOR: Record<string, string> = { cash: "gray", qr_counter: "blue", card_terminal: "violet", gateway: "teal" };

type Kind = "status" | "availability" | "role" | "payment" | "count";

/** The design's small coloured labels, translated. "count" shows the value as-is. */
export function StatusLabel({ kind, value, ...props }: BadgeProps & { kind: Kind; value: string }) {
  const { t } = useTranslation();
  const [color, text] = (() => {
    switch (kind) {
      case "status": return [STATUS_COLOR[value] ?? "gray", t(`status.${value}`)];
      case "availability": return [AVAILABILITY_COLOR[value] ?? "gray", t(`console.availability.${value}`)];
      case "role": return [value === "admin" ? "orange" : "gray", t(`role.${value}`)];
      case "payment": return [PAYMENT_COLOR[value] ?? "gray", t(`paymentMethod.${value}`)];
      default: return ["orange", value];
    }
  })();
  return (
    <Badge color={color} variant="light" size="md" {...props}>
      {text}
    </Badge>
  );
}
