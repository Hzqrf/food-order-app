import { Box, Group, Paper, type PaperProps, Title } from "@mantine/core";
import type { ReactNode } from "react";

import { radius, tokens } from "../../../ui/tokens";

/** The design's white card: optional header row (title left, actions right) over a body. */
export function SectionCard({
  title,
  actions,
  padded = true,
  children,
  ...props
}: PaperProps & { title?: ReactNode; actions?: ReactNode; padded?: boolean; children?: ReactNode }) {
  const header = title !== undefined || actions !== undefined;
  return (
    <Paper radius={radius.card} bg={tokens.card} style={{ boxShadow: tokens.cardShadow }} {...props}>
      {header && (
        <Group justify="space-between" gap="md" wrap="wrap" px={24} py={20}
          style={{ borderBottom: `1px solid ${tokens.border}` }}>
          {typeof title === "string" ? (
            <Title order={2} fz={16} lh="24px" fw={600} c={tokens.text}>
              {title}
            </Title>
          ) : (
            title
          )}
          {actions && <Group gap="xs">{actions}</Group>}
        </Group>
      )}
      {padded ? <Box p={header ? 24 : 20}>{children}</Box> : children}
    </Paper>
  );
}

/** The grey inner tile used for tickets and pickable rows. */
export const tileStyle = {
  background: tokens.tileBg,
  boxShadow: tokens.tileBorder,
  borderRadius: radius.tile,
} as const;
