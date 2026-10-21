import { Group, Text } from "@mantine/core";
import { IconArrowDownRight, IconArrowUpRight } from "@tabler/icons-react";

import { SectionCard } from "./SectionCard";
import { tokens } from "../../../ui/tokens";

/** A label, one loud number and an optional change against a comparison period. Null shows a dash. */
export function MetricCard({ label, value, delta, direction, good = "up", deltaLabel }: {
  label: string;
  value: string | null;
  delta?: string;
  direction?: "up" | "down";
  /** Which direction is good news; colours the delta green or red. */
  good?: "up" | "down";
  deltaLabel?: string;
}) {
  const Arrow = direction === "down" ? IconArrowDownRight : IconArrowUpRight;
  const color = direction ? (direction === good ? tokens.success : tokens.danger) : tokens.muted;
  return (
    <SectionCard>
      <Text fz={14} lh="20px" fw={500} c={tokens.muted}>
        {label}
      </Text>
      <Text fz={30} lh="38px" fw={600} c={tokens.text} mt={8} style={{ letterSpacing: "-0.02em" }}>
        {value ?? "—"}
      </Text>
      {(delta || deltaLabel) && (
        <Group gap={6} mt={8} wrap="nowrap" align="flex-start">
          {delta && direction && (
            <Group gap={2} wrap="nowrap" c={color}>
              <Arrow size={16} />
              <Text fz={13} fw={600} inherit>
                {delta}
              </Text>
            </Group>
          )}
          {deltaLabel && (
            <Text fz={13} c={tokens.muted} lineClamp={2}>
              {deltaLabel}
            </Text>
          )}
        </Group>
      )}
    </SectionCard>
  );
}
