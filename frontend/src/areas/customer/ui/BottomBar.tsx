import { Box } from "@mantine/core";
import type { ReactNode } from "react";

import { tokens } from "../../../ui/tokens";

/** Height of the tab bar, so a bottom bar on a tab page can sit just above it. */
export const TAB_BAR_HEIGHT = 58;

/** The fixed action area at the bottom of the item, cart and checkout pages. */
export function BottomBar({ children, aboveTabs = false }: { children: ReactNode; aboveTabs?: boolean }) {
  return (
    <Box pos="fixed" left={0} right={0} bg={tokens.card} style={{
      bottom: aboveTabs ? `calc(${TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom))` : 0,
      borderTop: `1px solid ${tokens.border}`, zIndex: 100,
      paddingBottom: aboveTabs ? 12 : "calc(12px + env(safe-area-inset-bottom))",
    }}>
      <Box maw={480} mx="auto" px={16} pt={12}>{children}</Box>
    </Box>
  );
}
