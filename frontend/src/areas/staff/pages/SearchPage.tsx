import { Badge, Group, Table, Text, TextInput } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { useOrderSearch } from "../../../api/orders";
import { formatDateTime } from "../../../lib/dates";
import { formatSen } from "../../../lib/money";
import { isUnpaidAtCounter } from "../components/TakePaymentModal";
import { PageHeader } from "../console/PageHeader";
import { SectionCard } from "../console/SectionCard";
import { StatusLabel } from "../console/StatusLabel";
import { tokens } from "../../../ui/tokens";

export default function SearchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [debounced] = useDebouncedValue(q.trim(), 300);
  const { data, isFetching } = useOrderSearch(debounced);

  return (
    <>
      <PageHeader title={t("console.search.title")} subtitle={t("search.hint")} />
      <SectionCard padded={false}
        title={
          <TextInput size="md" w="100%" maw={520} autoFocus leftSection={<IconSearch size={18} />}
            placeholder={t("search.placeholder")} aria-label={t("search.placeholder")}
            value={q} onChange={(e) => setQ(e.currentTarget.value)} />
        }>
        {!debounced && <Text p={24} c={tokens.muted} fz={14}>{t("console.search.start")}</Text>}
        {debounced && !isFetching && data?.length === 0 && <Text p={24} c={tokens.muted} fz={14}>{t("search.none")}</Text>}
        {data && data.length > 0 && (
          <Table.ScrollContainer minWidth={640}>
            <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="lg">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("console.search.number")}</Table.Th>
                  <Table.Th>{t("console.search.when")}</Table.Th>
                  <Table.Th>{t("console.order.customer")}</Table.Th>
                  <Table.Th>{t("console.order.channel")}</Table.Th>
                  <Table.Th>{t("console.search.status")}</Table.Th>
                  <Table.Th ta="right">{t("common.total")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.map((o) => (
                  <Table.Tr key={o.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/staff/orders/${o.id}`)}>
                    <Table.Td>
                      <Text fw={600} c={tokens.text}>#{o.order_number}</Text>
                      <Text fz={12} c={tokens.muted} ff="monospace">{o.order_code}</Text>
                    </Table.Td>
                    <Table.Td>{formatDateTime(o.created_at)}</Table.Td>
                    <Table.Td>{o.customer_name ?? "—"}</Table.Td>
                    <Table.Td>{t(`channel.${o.channel}`)}</Table.Td>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        <StatusLabel kind="status" value={o.status} />
                        {isUnpaidAtCounter(o) && (
                          <Badge size="sm" variant="filled" color="orange.7">
                            {t("order.unpaid", { total: formatSen(o.total_sen) })}
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td ta="right" fw={600}>{formatSen(o.total_sen)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </SectionCard>
    </>
  );
}
