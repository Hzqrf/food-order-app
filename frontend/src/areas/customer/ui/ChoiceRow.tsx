import { Box, Group, Text, UnstyledButton } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import { formatSen } from "../../../lib/money";
import { radius, tokens } from "../../../ui/tokens";

/** One option as a full-width row. A picked row gets the orange border, tint and tick. */
export function ChoiceRow({ type, label, priceDeltaSen, checked, disabled, soldOut = false, onChange }: {
  type: "radio" | "checkbox";
  label: string;
  priceDeltaSen: number;
  checked: boolean;
  disabled: boolean;
  soldOut?: boolean;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const orange = "var(--mantine-color-orange-7)";
  return (
    <UnstyledButton role={type} aria-checked={checked} aria-disabled={disabled} w="100%"
      onClick={() => !disabled && onChange()}
      style={{
        padding: "12px 14px", borderRadius: radius.tile, opacity: disabled ? 0.5 : 1,
        boxShadow: `inset 0 0 0 ${checked ? 2 : 1}px ${checked ? orange : tokens.choiceBorder}`,
        background: checked ? "var(--mantine-color-orange-0)" : tokens.card,
        cursor: disabled ? "not-allowed" : "pointer",
      }}>
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap={12} wrap="nowrap" miw={0}>
          <Box w={20} h={20} style={{
            flexShrink: 0, borderRadius: type === "radio" ? "50%" : 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: checked ? orange : tokens.card,
            boxShadow: checked ? "none" : `inset 0 0 0 1.5px ${tokens.choiceBorder}`,
          }}>
            {checked && <IconCheck size={14} stroke={3} color="white" />}
          </Box>
          <Text fz={15} fw={500} c={tokens.text} truncate>{label}</Text>
        </Group>
        <Text fz={14} c={tokens.muted} style={{ flexShrink: 0 }}>
          {soldOut ? t("menu.soldOut") : priceDeltaSen > 0 ? `+${formatSen(priceDeltaSen)}` : ""}
        </Text>
      </Group>
    </UnstyledButton>
  );
}
