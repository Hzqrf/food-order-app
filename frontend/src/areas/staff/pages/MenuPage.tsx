import { Button, Group, Stack, Switch, Table, Tabs, Text, TextInput, Tooltip } from "@mantine/core";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useSession } from "../../../api/auth";
import { useAdminMenu, useMenu, useSetSoldOut, useSort, useUnitsSold, useUpdateItem } from "../../../api/menu";
import type { AdminItem, MenuOption } from "../../../api/types";
import { ErrorState } from "../../../components/ErrorState";
import { notifyError } from "../../../components/errors";
import { marginPct } from "../../../lib/margin";
import { formatSen } from "../../../lib/money";
import { CategoriesPanel } from "../components/menu/CategoriesPanel";
import { ItemDrawer } from "../components/menu/ItemDrawer";
import { OptionGroupsPanel } from "../components/menu/OptionGroupsPanel";
import { moved, SortButtons } from "../components/menu/SortButtons";
import { ItemPhoto } from "../console/ItemPhoto";
import { PageHeader } from "../console/PageHeader";
import { SectionCard } from "../console/SectionCard";
import { StatusLabel } from "../console/StatusLabel";
import { tokens } from "../../../ui/tokens";

/** One row of the menu table, whether it came from the owner's or the public menu. */
type Row = {
  id: number;
  name: string;
  categoryId: number;
  priceSen: number;
  imageUrl: string | null;
  active: boolean;
  ownSoldOut: boolean;
  blockedByOption: boolean;
  admin?: AdminItem;
};

/** Cost and margin cells for the owner's table. A missing cost shows in amber so the gaps stand out. */
function CostCells({ priceSen, costSen }: { priceSen: number; costSen: number | null }) {
  const { t } = useTranslation();
  const margin = marginPct(priceSen, costSen);
  if (costSen === null) {
    return (
      <>
        <Table.Td ta="right">
          <Tooltip label={t("console.cost.notSet")}>
            <Text span c="yellow.8" fw={600}>—</Text>
          </Tooltip>
        </Table.Td>
        <Table.Td ta="right"><Text span c="dimmed">—</Text></Table.Td>
      </>
    );
  }
  return (
    <>
      <Table.Td ta="right">{formatSen(costSen)}</Table.Td>
      <Table.Td ta="right" c={margin !== null && margin < 0 ? "red.7" : undefined}>
        {margin === null ? "—" : `${margin}%`}
      </Table.Td>
    </>
  );
}

/** Staff switch things off when they run out; the owner also edits, hides and reorders. */
export default function MenuPage() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const isOwner = session?.user?.role === "admin" && !session.device_registered;
  const pub = useMenu();
  const admin = useAdminMenu(isOwner);
  const sold = useUnitsSold(7, isOwner);
  const setSoldOut = useSetSoldOut();
  const update = useUpdateItem();
  const sort = useSort();
  const [editing, setEditing] = useState<AdminItem | "new" | null>(null);
  const [search, setSearch] = useState("");

  const loading = pub.isPending || (isOwner && admin.isPending);
  const failed = pub.isError || (isOwner && admin.isError);
  const header = (
    <PageHeader title={t("console.menu.title")}
      subtitle={t(isOwner ? "console.menu.subtitleOwner" : "console.menu.subtitleStaff")}
      actions={isOwner && (
        <Button leftSection={<IconPlus size={18} />} onClick={() => setEditing("new")}
          disabled={!admin.data || admin.data.categories.length === 0}>
          {t("console.menu.addItem")}
        </Button>
      )} />
  );
  if (loading) return <>{header}<Text c="dimmed">{t("common.loading")}</Text></>;
  if (failed || !pub.data) return <>{header}<ErrorState onRetry={() => { pub.refetch(); admin.refetch(); }} /></>;

  const live = new Map(pub.data.categories.flatMap((c) => c.items).map((i) => [i.id, i]));
  const categories = isOwner && admin.data
    ? admin.data.categories.map((c) => ({ id: c.id, name: c.name, active: c.is_active }))
    : pub.data.categories.map((c) => ({ id: c.id, name: c.name, active: true }));
  const rows: Row[] = isOwner && admin.data
    ? admin.data.items.map((i) => ({
      id: i.id, name: i.name, categoryId: i.category_id, priceSen: i.price_sen, imageUrl: i.image_url,
      active: i.is_active, ownSoldOut: i.is_sold_out,
      blockedByOption: !i.is_sold_out && !!live.get(i.id)?.is_sold_out, admin: i,
    }))
    : pub.data.categories.flatMap((c) => c.items.map((i) => ({
      id: i.id, name: i.name, categoryId: c.id, priceSen: i.price_sen, imageUrl: i.image_url,
      active: true, ownSoldOut: i.item_sold_out, blockedByOption: i.is_sold_out && !i.item_sold_out,
    })));

  const q = search.trim().toLowerCase();
  const toggleSoldOut = (kind: "items" | "options", id: number, available: boolean) =>
    setSoldOut.mutate({ kind, id, soldOut: !available }, { onError: (e) => notifyError(t, e) });
  const toggleActive = (id: number, active: boolean) =>
    update.mutate({ id, is_active: active }, { onError: (e) => notifyError(t, e) });

  // Option groups are shared between items; list each option once.
  const options = new Map<number, MenuOption & { group: string }>();
  pub.data.categories.forEach((c) =>
    c.items.forEach((i) => i.groups.forEach((g) => g.options.forEach((o) => options.set(o.id, { ...o, group: g.name })))),
  );
  const cols = isOwner ? 10 : 6;

  const itemsTable = (
    <SectionCard padded={false}
      title={<Text fz={16} fw={600} c={tokens.text}>{t("console.menu.summary", { items: rows.length, categories: categories.length })}</Text>}
      actions={
        <TextInput w={{ base: "100%", xs: 220 }} leftSection={<IconSearch size={16} />} placeholder={t("console.menu.search")}
          aria-label={t("console.menu.search")} value={search} onChange={(e) => setSearch(e.currentTarget.value)} />
      }>
      {categories.length === 0 && <Text p={24} c="dimmed">{t("admin.menu.addCategoryFirst")}</Text>}
      <Table.ScrollContainer minWidth={isOwner ? 860 : 560}>
        <Table verticalSpacing="sm" horizontalSpacing="lg" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={72} />
              <Table.Th>{t("console.menu.item")}</Table.Th>
              <Table.Th ta="right">{t("admin.menu.price")}</Table.Th>
              {isOwner && <Table.Th ta="right">{t("console.cost.cost")}</Table.Th>}
              {isOwner && <Table.Th ta="right">{t("console.cost.margin")}</Table.Th>}
              {isOwner && <Table.Th ta="right">{t("console.menu.sold7d")}</Table.Th>}
              <Table.Th>{t("console.menu.availability")}</Table.Th>
              <Table.Th ta="center">{t("console.menu.inStock")}</Table.Th>
              {isOwner && <Table.Th ta="center">{t("console.menu.onMenu")}</Table.Th>}
              <Table.Th w={isOwner ? 150 : 1} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {categories.map((c) => {
              const inCat = rows.filter((r) => r.categoryId === c.id);
              const shown = inCat.filter((r) => !q || r.name.toLowerCase().includes(q));
              if (shown.length === 0 && (q || !isOwner)) return null;
              const ids = inCat.map((r) => r.id);
              return [
                <Table.Tr key={`c${c.id}`} bg={tokens.tileBg}>
                  <Table.Td colSpan={cols}>
                    <Group gap="xs">
                      <Text fz={13} fw={600} tt="uppercase" c={tokens.muted} style={{ letterSpacing: ".04em" }}>{c.name}</Text>
                      {!c.active && <StatusLabel kind="availability" value="hidden" size="sm" />}
                    </Group>
                  </Table.Td>
                </Table.Tr>,
                ...shown.map((r) => (
                  <Table.Tr key={r.id} style={{ opacity: r.active ? 1 : 0.6 }}>
                    <Table.Td><ItemPhoto url={r.imageUrl} /></Table.Td>
                    <Table.Td>
                      <Text fz={14} fw={500} c={tokens.text}>{r.name}</Text>
                      {r.blockedByOption && <Text fz={12} c="orange.8">{t("soldOut.blockedByOption")}</Text>}
                    </Table.Td>
                    <Table.Td ta="right">{formatSen(r.priceSen)}</Table.Td>
                    {isOwner && <CostCells priceSen={r.priceSen} costSen={r.admin?.cost_sen ?? null} />}
                    {isOwner && <Table.Td ta="right">{sold.data?.get(r.id) ?? 0}</Table.Td>}
                    <Table.Td>
                      <StatusLabel kind="availability"
                        value={!r.active ? "hidden" : r.ownSoldOut || r.blockedByOption ? "soldOut" : "available"} />
                    </Table.Td>
                    <Table.Td>
                      <Group justify="center">
                        <Switch size="md" color="green" checked={!r.ownSoldOut}
                          aria-label={t("console.menu.inStockFor", { name: r.name })}
                          onChange={(e) => toggleSoldOut("items", r.id, e.currentTarget.checked)} />
                      </Group>
                    </Table.Td>
                    {isOwner && (
                      <Table.Td>
                        <Group justify="center">
                          <Switch size="md" checked={r.active} aria-label={t("console.menu.onMenuFor", { name: r.name })}
                            onChange={(e) => toggleActive(r.id, e.currentTarget.checked)} />
                        </Group>
                      </Table.Td>
                    )}
                    <Table.Td>
                      {isOwner && r.admin && (
                        <Group gap={6} wrap="nowrap" justify="flex-end">
                          {!q && (
                            <SortButtons index={ids.indexOf(r.id)} count={ids.length}
                              onMove={(dir) => sort.mutate({ entity: "items", ids: moved(ids, ids.indexOf(r.id), dir) },
                                { onError: (e) => notifyError(t, e) })} />
                          )}
                          <Button size="xs" variant="light" color="gray" onClick={() => setEditing(r.admin!)}>
                            {t("common.edit")}
                          </Button>
                        </Group>
                      )}
                    </Table.Td>
                  </Table.Tr>
                )),
                ...(shown.length === 0 ? [
                  <Table.Tr key={`e${c.id}`}><Table.Td colSpan={cols}><Text fz={13} c="dimmed">{t("admin.menu.noItems")}</Text></Table.Td></Table.Tr>,
                ] : []),
              ];
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </SectionCard>
  );

  const optionsList = (
    <SectionCard title={t("soldOut.options")}>
      <Text fz={13} c={tokens.muted} mb="md">{t("soldOut.hint")}</Text>
      {options.size === 0 && <Text c="dimmed">—</Text>}
      <Stack gap={0}>
        {[...options.values()].map((o) => (
          <Group key={o.id} justify="space-between" py={10} style={{ borderBottom: `1px solid ${tokens.border}` }}>
            <Text fz={14} c={o.is_sold_out ? tokens.muted : tokens.text}>
              {o.name} <Text span fz={12} c={tokens.muted}>({o.group})</Text>
            </Text>
            <Switch size="md" color="green" checked={!o.is_sold_out} aria-label={t("console.menu.inStockFor", { name: o.name })}
              onChange={(e) => toggleSoldOut("options", o.id, e.currentTarget.checked)} />
          </Group>
        ))}
      </Stack>
    </SectionCard>
  );

  return (
    <>
      {header}
      <Tabs defaultValue="items" keepMounted={false} variant="pills">
        <Tabs.List mb={20}>
          <Tabs.Tab value="items">{t("admin.menu.items")}</Tabs.Tab>
          <Tabs.Tab value="options">{t("soldOut.options")}</Tabs.Tab>
          {isOwner && <Tabs.Tab value="categories">{t("admin.menu.categories")}</Tabs.Tab>}
          {isOwner && <Tabs.Tab value="groups">{t("admin.menu.optionGroups")}</Tabs.Tab>}
        </Tabs.List>
        <Tabs.Panel value="items">{itemsTable}</Tabs.Panel>
        <Tabs.Panel value="options">{optionsList}</Tabs.Panel>
        {isOwner && admin.data && (
          <>
            <Tabs.Panel value="categories">
              <SectionCard><CategoriesPanel categories={admin.data.categories} /></SectionCard>
            </Tabs.Panel>
            <Tabs.Panel value="groups">
              <SectionCard><OptionGroupsPanel groups={admin.data.option_groups} /></SectionCard>
            </Tabs.Panel>
          </>
        )}
      </Tabs>
      {isOwner && admin.data && <ItemDrawer item={editing} menu={admin.data} onClose={() => setEditing(null)} />}
    </>
  );
}
