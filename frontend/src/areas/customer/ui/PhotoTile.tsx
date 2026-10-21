import { Box, Image } from "@mantine/core";
import type { CSSProperties } from "react";

import { radius, tokens } from "../../../ui/tokens";

/** The item's photo, or a soft orange tile with its first letter so every card lines up. */
export function PhotoTile({ name, src, size }: { name: string; src: string | null; size: number | "full" }) {
  const full = size === "full";
  const frame: CSSProperties = {
    flexShrink: 0, overflow: "hidden", borderRadius: radius.tile,
    ...(full ? { width: "100%", aspectRatio: "4 / 3" } : { width: size, height: size }),
  };
  if (src) {
    return (
      <Box style={frame}>
        <Image src={src} alt="" w="100%" h="100%" fit="cover" loading="lazy" />
      </Box>
    );
  }
  return (
    <Box aria-hidden style={{
      ...frame, background: tokens.placeholderBg, color: tokens.placeholderText, fontWeight: 600,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: full ? 72 : Math.round((size as number) * 0.4),
    }}>
      {name.trim().charAt(0).toUpperCase()}
    </Box>
  );
}
