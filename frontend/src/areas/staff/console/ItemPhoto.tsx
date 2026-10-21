import { Box, Image } from "@mantine/core";
import { IconPhoto } from "@tabler/icons-react";

import { tokens } from "../../../ui/tokens";

/** A menu item's square thumbnail, or a grey placeholder when it has no photo yet. */
export function ItemPhoto({ url, size = 48 }: { url: string | null; size?: number }) {
  return url ? (
    <Image src={url} w={size} h={size} radius={8} alt="" style={{ flexShrink: 0 }} />
  ) : (
    <Box w={size} h={size} bg={tokens.secondaryBg} c={tokens.muted} display="grid"
      style={{ borderRadius: 8, placeItems: "center", flexShrink: 0 }}>
      <IconPhoto size={Math.round(size * 0.42)} />
    </Box>
  );
}
