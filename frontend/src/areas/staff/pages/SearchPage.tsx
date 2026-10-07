import { Badge, Group, Paper, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useOrderSearch } from "../../../api/orders";
import { formatDateTime } from "../../../lib/dates";
import { formatSen } from "../../../lib/money";
import { OrderDetailDrawer, STATUS_COLOR } from "../components/OrderDetailDrawer";

export default function SearchPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [debounced] = useDebouncedValue(q.trim(), 300);
  const { data, isFetching } = useOrderSearch(debounced);
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <Stack maw={720} mx="auto">
      <TextInput size="lg" autoFocus leftSection={<IconSearch size={18} />} placeholder={t("search.placeholder")}
        value={q} onChange={(e) => setQ(e.currentTarget.value)} />
      <Text size="xs" c="dimmed">
        {t("search.hint")}
      </Text>
      {debounced && !isFetching && data?.length === 0 && <Text c="dimmed">{t("search.none")}</Text>}
      {data?.map((o) => (
        <UnstyledButton key={o.id} onClick={() => setOpenId(o.id)}>
          <Paper withBorder p="sm">
            <Group justify="space-between">
              <Group gap="sm">
                <Text fw={800} size="lg">
                  {o.order_number}
                </Text>
                <Text size="sm" ff="monospace" c="dimmed">{o.order_code}</Text>
                {o.customer_name && <Text>{o.customer_name}</Text>}
                <Badge color={STATUS_COLOR[o.status]} variant="light">
                  {t(`status.${o.status}`)}
                </Badge>
              </Group>
              <Text>{formatSen(o.total_sen)}</Text>
            </Group>
            <Text size="xs" c="dimmed">
              {formatDateTime(o.created_at)} · {t(`channel.${o.channel}`)}
            </Text>
          </Paper>
        </UnstyledButton>
      ))}
      <OrderDetailDrawer orderId={openId} onClose={() => setOpenId(null)} />
    </Stack>
  );
}
