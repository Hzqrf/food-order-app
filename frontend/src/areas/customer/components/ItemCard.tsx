import { Badge, Box, Group, Image, Paper, Stack, Text, UnstyledButton } from "@mantine/core";
import { useTranslation } from "react-i18next";

import type { MenuItem } from "../../../api/types";
import { useLocalized } from "../../../lib/i18n";
import { formatSen } from "../../../lib/money";

export function ItemCard({ item, onOpen }: { item: MenuItem; onOpen: () => void }) {
  const { t } = useTranslation();
  const loc = useLocalized();
  return (
    <UnstyledButton onClick={onOpen} aria-label={loc.name(item)}>
      <Paper p="sm" withBorder style={{ opacity: item.is_sold_out ? 0.55 : 1 }}>
        <Group wrap="nowrap" align="flex-start" gap="sm">
          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Text fw={600}>{loc.name(item)}</Text>
            {loc.description(item) && (
              <Text size="sm" c="dimmed" lineClamp={2}>
                {loc.description(item)}
              </Text>
            )}
            <Group gap="xs">
              <Text fw={600}>{formatSen(item.price_sen)}</Text>
              {item.is_sold_out && (
                <Badge color="gray" variant="light">
                  {t("menu.soldOutToday")}
                </Badge>
              )}
            </Group>
          </Stack>
          {item.image_url && (
            <Box w={88} h={88} style={{ flexShrink: 0 }}>
              <Image src={item.image_url} alt="" w={88} h={88} radius="md" fit="cover" loading="lazy" />
            </Box>
          )}
        </Group>
      </Paper>
    </UnstyledButton>
  );
}
