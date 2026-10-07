import { Group, Paper, ScrollArea, Text, UnstyledButton } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { formatDateTime } from "../../../lib/dates";
import { formatSen } from "../../../lib/money";
import { loadRecent } from "../../../lib/storage";

/** Guests keep links to their recent orders on this device. No account needed. */
export function RecentOrders() {
  const { t } = useTranslation();
  const recent = loadRecent();
  if (recent.length === 0) return null;

  return (
    <Paper mt="md" p="sm" withBorder>
      <Text size="sm" fw={600} mb={6}>
        {t("customer.recentOrders")}
      </Text>
      <ScrollArea type="never">
        <Group gap="xs" wrap="nowrap">
          {recent.map((o) => (
            <UnstyledButton key={o.token} component={Link} to={`/t/${o.token}`}>
              <Paper px="sm" py={6} bg="gray.0" radius="md">
                <Text fw={700} size="sm">#{o.number} · {formatSen(o.totalSen)}</Text>
                <Text size="xs" c="dimmed">{formatDateTime(o.placedAt)}</Text>
              </Paper>
            </UnstyledButton>
          ))}
        </Group>
      </ScrollArea>
    </Paper>
  );
}
