import { Box } from "@mantine/core";
import type { ReactNode } from "react";

import { tokens } from "../../../ui/tokens";

/** The fixed action area at the bottom of the item, cart and checkout pages. */
export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <Box pos="fixed" bottom={0} left={0} right={0} bg={tokens.card} style={{
      borderTop: `1px solid ${tokens.border}`, zIndex: 100,
      paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
    }}>
      <Box maw={480} mx="auto" px={16} pt={12}>{children}</Box>
    </Box>
  );
}
