import { Badge, Box, Group, Text, UnstyledButton } from "@mantine/core";
import { useTranslation } from "react-i18next";

import type { MenuItem } from "../../../api/types";
import { formatSen } from "../../../lib/money";
import { radius, tokens } from "../../../ui/tokens";
import { PhotoTile } from "./PhotoTile";

/** One menu item as a card: photo on the left, name, two lines of description, price. */
export function ItemRow({ item, onOpen }: { item: MenuItem; onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <UnstyledButton onClick={onOpen} aria-label={item.name} w="100%"
      style={{
        display: "flex", gap: 14, padding: 12, borderRadius: radius.card, background: tokens.card,
        boxShadow: tokens.cardShadow, opacity: item.is_sold_out ? 0.55 : 1, textAlign: "left",
      }}>
      <PhotoTile name={item.name} src={item.image_url} size={84} />
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Text fz={15} fw={600} c={tokens.text} lh={1.35}>{item.name}</Text>
        {item.description && (
          <Text fz={13} c={tokens.muted} lineClamp={2} mt={2}>{item.description}</Text>
        )}
        <Group gap={8} mt={6}>
          <Text fz={15} fw={600} c={tokens.text}>{formatSen(item.price_sen)}</Text>
          {item.is_sold_out ? (
            <Badge size="sm" variant="light" color="gray">{t("customer.problem.sold_out")}</Badge>
          ) : item.is_popular && (
            <Badge size="sm" variant="light" color="green">{t("customer.popular")}</Badge>
          )}
        </Group>
      </Box>
    </UnstyledButton>
  );
}
