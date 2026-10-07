import { Badge, Button, Group, Image, Paper, Stack, Table, Tabs, Text, Title } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAdminMenu, useSort } from "../../../api/menu";
import type { AdminItem } from "../../../api/types";
import { ErrorState } from "../../../components/ErrorState";
import { notifyError } from "../../../components/errors";
import { formatSen } from "../../../lib/money";
import { CategoriesPanel } from "../components/CategoriesPanel";
import { ItemDrawer } from "../components/ItemDrawer";
import { OptionGroupsPanel } from "../components/OptionGroupsPanel";
import { SortButtons, moved } from "../components/SortButtons";

export default function MenuPage() {
  const { t } = useTranslation();
  const { data: menu, isPending, isError, refetch } = useAdminMenu();
  const sort = useSort();
  const [editing, setEditing] = useState<AdminItem | "new" | null>(null);

  if (isPending) return <Text c="dimmed">{t("common.loading")}</Text>;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const groupName = new Map(menu.option_groups.map((g) => [g.id, g.name]));

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t("admin.menu.title")}</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing("new")}
          disabled={menu.categories.length === 0}>
          {t("admin.menu.addItem")}
        </Button>
      </Group>

      <Tabs defaultValue="items" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="items">{t("admin.menu.items")}</Tabs.Tab>
          <Tabs.Tab value="groups">{t("admin.menu.optionGroups")}</Tabs.Tab>
          <Tabs.Tab value="categories">{t("admin.menu.categories")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="items">
          {menu.categories.length === 0 && <Text c="dimmed">{t("admin.menu.addCategoryFirst")}</Text>}
          <Stack>
            {menu.categories.map((c) => {
              const items = menu.items.filter((i) => i.category_id === c.id);
              const ids = items.map((i) => i.id);
              return (
                <Paper key={c.id} withBorder p="md">
                  <Group gap="xs" mb="xs">
                    <Title order={4}>{c.name}</Title>
                    {!c.is_active && <Badge color="gray">{t("admin.menu.hidden")}</Badge>}
                  </Group>
                  {items.length === 0 ? (
                    <Text size="sm" c="dimmed">
                      {t("admin.menu.noItems")}
                    </Text>
                  ) : (
                    <Table verticalSpacing="xs" highlightOnHover>
                      <Table.Tbody>
                        {items.map((item, idx) => (
                          <Table.Tr key={item.id} style={{ cursor: "pointer", opacity: item.is_active ? 1 : 0.5 }}
                            onClick={() => setEditing(item)}>
                            <Table.Td w={56}>
                              {item.image_url ? <Image src={item.image_url} w={44} h={44} radius="sm" alt="" />
                                : <Paper w={44} h={44} bg="gray.1" radius="sm" />}
                            </Table.Td>
                            <Table.Td>
                              <Text fw={600}>{item.name}</Text>
                              {item.name_ms && <Text size="xs" c="dimmed">{item.name_ms}</Text>}
                            </Table.Td>
                            <Table.Td>{formatSen(item.price_sen)}</Table.Td>
                            <Table.Td visibleFrom="md">
                              <Group gap={4}>
                                {item.option_group_ids.map((g) => (
                                  <Badge key={g} variant="light" size="sm">{groupName.get(g)}</Badge>
                                ))}
                              </Group>
                            </Table.Td>
                            <Table.Td>
                              {!item.is_active && <Badge color="gray">{t("admin.menu.hidden")}</Badge>}
                              {item.is_sold_out && <Badge color="yellow">{t("menu.soldOut")}</Badge>}
                            </Table.Td>
                            <Table.Td w={80} onClick={(e) => e.stopPropagation()}>
                              <SortButtons index={idx} count={ids.length}
                                onMove={(dir) => sort.mutate({ entity: "items", ids: moved(ids, idx, dir) },
                                  { onError: (e) => notifyError(t, e) })} />
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  )}
                </Paper>
              );
            })}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="groups">
          <OptionGroupsPanel groups={menu.option_groups} />
        </Tabs.Panel>
        <Tabs.Panel value="categories">
          <CategoriesPanel categories={menu.categories} />
        </Tabs.Panel>
      </Tabs>

      <ItemDrawer item={editing} menu={menu} onClose={() => setEditing(null)} />
    </Stack>
  );
}
