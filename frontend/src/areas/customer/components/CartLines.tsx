import { ActionIcon, Badge, Box, Group, Stack, Text } from "@mantine/core";
import { IconMinus, IconPlus, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import type { MenuItem, QuoteOut } from "../../../api/types";
import { optionNames, unitPrice } from "../../../lib/cart";
import { useLocalized } from "../../../lib/i18n";
import { formatSen } from "../../../lib/money";
import { useCart } from "../cart";

/** The cart's lines. Lines the server says cannot be made are marked, with the reason. */
export function CartLines({ items, quote, editable = true }: {
  items: Map<number, MenuItem>;
  quote?: QuoteOut;
  editable?: boolean;
}) {
  const { t } = useTranslation();
  const loc = useLocalized();
  const { lines, setQuantity } = useCart();
  const problemAt = new Map((quote?.problems ?? []).map((p) => [p.line, p.reason]));

  return (
    <Stack gap="sm">
      {lines.map((l, i) => {
        const item = items.get(l.itemId);
        const problem = problemAt.get(i) ?? (item ? undefined : "unavailable");
        return (
          <Box key={l.key} p="xs" style={{ borderRadius: 8, background: problem ? "var(--mantine-color-red-0)" : undefined }}>
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Box miw={0}>
                <Text fw={600}>{item ? loc.name(item) : t("customer.removedItem")}</Text>
                {item && l.optionIds.length > 0 && (
                  <Text size="sm" c="dimmed">{optionNames(item, l.optionIds, loc.name)}</Text>
                )}
                {l.note && <Text size="sm" c="dimmed">“{l.note}”</Text>}
                {problem && <Badge color="red" variant="light" mt={4}>{t(`customer.problem.${problem}`)}</Badge>}
              </Box>
              {item && !problem && <Text fw={600}>{formatSen(unitPrice(item, l.optionIds) * l.quantity)}</Text>}
            </Group>
            {editable && (
              <Group gap={6} mt={6}>
                <ActionIcon variant="default" size="lg" onClick={() => setQuantity(l.key, l.quantity - 1)}
                  aria-label={t("takeOrder.less")}>
                  {l.quantity === 1 ? <IconTrash size={16} /> : <IconMinus size={16} />}
                </ActionIcon>
                <Text w={24} ta="center" fw={700}>{l.quantity}</Text>
                <ActionIcon variant="default" size="lg" disabled={!!problem || l.quantity >= 20}
                  onClick={() => setQuantity(l.key, l.quantity + 1)} aria-label={t("takeOrder.more")}>
                  <IconPlus size={16} />
                </ActionIcon>
              </Group>
            )}
            {!editable && <Text size="sm" c="dimmed">× {l.quantity}</Text>}
          </Box>
        );
      })}
    </Stack>
  );
}
