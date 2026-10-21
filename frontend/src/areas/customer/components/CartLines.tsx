import { ActionIcon, Badge, Box, Group, Stack, Text } from "@mantine/core";
import { IconMinus, IconPlus, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import type { MenuItem, QuoteOut } from "../../../api/types";
import { optionNames, unitPrice } from "../../../lib/cart";
import { formatSen } from "../../../lib/money";
import { radius, tokens } from "../../../ui/tokens";
import { useCart } from "../cart";
import { PhotoTile } from "../ui/PhotoTile";

/**
 * The cart's lines. Lines the server says cannot be made are marked, with the reason.
 * Editable: one card per line with a stepper. Read-only (checkout): a compact list.
 */
export function CartLines({ items, quote, editable = true }: {
  items: Map<number, MenuItem>;
  quote?: QuoteOut;
  editable?: boolean;
}) {
  const { t } = useTranslation();
  const { lines, setQuantity } = useCart();
  const problemAt = new Map((quote?.problems ?? []).map((p) => [p.line, p.reason]));

  return (
    <Stack gap={editable ? 10 : 12}>
      {lines.map((l, i) => {
        const item = items.get(l.itemId);
        const problem = problemAt.get(i) ?? (item ? undefined : "unavailable");
        const name = item ? item.name : t("customer.removedItem");
        const details = (
          <Box miw={0} style={{ flex: 1 }}>
            <Text fz={15} fw={600} c={tokens.text}>
              {editable ? name : `${l.quantity} × ${name}`}
            </Text>
            {item && l.optionIds.length > 0 && <Text fz={13} c={tokens.muted}>{optionNames(item, l.optionIds)}</Text>}
            {l.note && <Text fz={13} c={tokens.muted}>“{l.note}”</Text>}
            {problem && <Badge color="red" variant="light" mt={4}>{t(`customer.problem.${problem}`)}</Badge>}
          </Box>
        );
        const price = item && !problem && (
          <Text fz={15} fw={600} c={tokens.text}>{formatSen(unitPrice(item, l.optionIds) * l.quantity)}</Text>
        );

        if (!editable) {
          return (
            <Group key={l.key} justify="space-between" wrap="nowrap" align="flex-start">
              {details}
              {price}
            </Group>
          );
        }
        return (
          <Group key={l.key} gap={12} wrap="nowrap" align="flex-start" p={12} style={{
            borderRadius: radius.card, boxShadow: tokens.cardShadow,
            background: problem ? tokens.dangerBg : tokens.card,
          }}>
            <PhotoTile name={name} src={item?.image_url ?? null} size={56} />
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Group justify="space-between" wrap="nowrap" align="flex-start" gap={8}>
                {details}
                {price}
              </Group>
              <Group gap={4} mt={8} px={4} py={2} bg={tokens.secondaryBg} w="fit-content" style={{ borderRadius: 999 }}>
                <ActionIcon variant="subtle" color="dark" radius="xl" onClick={() => setQuantity(l.key, l.quantity - 1)}
                  aria-label={t("takeOrder.less")}>
                  {l.quantity === 1 ? <IconTrash size={16} /> : <IconMinus size={16} />}
                </ActionIcon>
                <Text w={22} ta="center" fw={600}>{l.quantity}</Text>
                <ActionIcon variant="subtle" color="dark" radius="xl" disabled={!!problem || l.quantity >= 20}
                  onClick={() => setQuantity(l.key, l.quantity + 1)} aria-label={t("takeOrder.more")}>
                  <IconPlus size={16} />
                </ActionIcon>
              </Group>
            </Box>
          </Group>
        );
      })}
    </Stack>
  );
}
