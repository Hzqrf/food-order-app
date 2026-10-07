import { Badge, Button, Group, Modal, NumberInput, Paper, Stack, Switch, Table, Text, TextInput, Title } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useCreateGroup, useCreateOption, useSort, useUpdateGroup, useUpdateOption } from "../../../api/menu";
import type { AdminOptionGroup, OptionGroupIn } from "../../../api/types";
import { notifyError } from "../../../components/errors";
import { MoneyInput } from "../../../components/MoneyInput";
import { ruleLabel } from "../../../components/OptionPicker";
import { SortButtons, moved } from "./SortButtons";

export function OptionGroupsPanel({ groups }: { groups: AdminOptionGroup[] }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<AdminOptionGroup | "new" | null>(null);

  return (
    <Stack>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {t("admin.groups.hint")}
        </Text>
        <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setEditing("new")}>
          {t("admin.groups.add")}
        </Button>
      </Group>
      {groups.map((g) => (
        <GroupCard key={g.id} group={g} onEdit={() => setEditing(g)} />
      ))}
      <GroupModal group={editing} onClose={() => setEditing(null)} />
    </Stack>
  );
}

function GroupCard({ group, onEdit }: { group: AdminOptionGroup; onEdit: () => void }) {
  const { t } = useTranslation();
  const updateOption = useUpdateOption();
  const createOption = useCreateOption();
  const sort = useSort();
  const [name, setName] = useState("");
  const [nameMs, setNameMs] = useState("");
  const [price, setPrice] = useState<number | null>(0);
  const onError = (e: unknown) => notifyError(t, e);
  const ids = group.options.map((o) => o.id);

  return (
    <Paper withBorder p="md" style={{ opacity: group.is_active ? 1 : 0.6 }}>
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <Title order={4}>{group.name}</Title>
          {group.name_ms && <Text c="dimmed">/ {group.name_ms}</Text>}
          <Badge variant="light">{ruleLabel(t, group)}</Badge>
          {!group.is_active && <Badge color="gray">{t("admin.menu.hidden")}</Badge>}
        </Group>
        <Button size="xs" variant="default" onClick={onEdit}>
          {t("common.edit")}
        </Button>
      </Group>
      <Table verticalSpacing={4}>
        <Table.Tbody>
          {group.options.map((o, idx) => (
            <Table.Tr key={o.id} style={{ opacity: o.is_active ? 1 : 0.5 }}>
              <Table.Td>
                <TextInput size="xs" defaultValue={o.name} aria-label={t("admin.menu.nameEn")}
                  onBlur={(e) => e.currentTarget.value.trim() && e.currentTarget.value !== o.name &&
                    updateOption.mutate({ id: o.id, name: e.currentTarget.value.trim() }, { onError })} />
              </Table.Td>
              <Table.Td>
                <TextInput size="xs" defaultValue={o.name_ms ?? ""} placeholder={t("admin.menu.nameMs")}
                  aria-label={t("admin.menu.nameMs")}
                  onBlur={(e) => e.currentTarget.value !== (o.name_ms ?? "") &&
                    updateOption.mutate({ id: o.id, name_ms: e.currentTarget.value.trim() || null }, { onError })} />
              </Table.Td>
              <Table.Td w={130}>
                <PriceCell valueSen={o.price_delta_sen}
                  onSave={(sen) => updateOption.mutate({ id: o.id, price_delta_sen: sen }, { onError })} />
              </Table.Td>
              <Table.Td>
                <Switch size="sm" checked={o.is_active} aria-label={t("admin.menu.visible")}
                  onChange={(e) => updateOption.mutate({ id: o.id, is_active: e.currentTarget.checked }, { onError })} />
              </Table.Td>
              <Table.Td>{o.is_sold_out && <Badge color="yellow" size="sm">{t("menu.soldOut")}</Badge>}</Table.Td>
              <Table.Td w={80}>
                <SortButtons index={idx} count={ids.length}
                  onMove={(dir) => sort.mutate({ entity: "options", ids: moved(ids, idx, dir) }, { onError })} />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Group mt="xs" wrap="nowrap" align="flex-end">
        <TextInput size="xs" placeholder={t("admin.groups.newOption")} value={name} maxLength={100}
          onChange={(e) => setName(e.currentTarget.value)} style={{ flex: 1 }} />
        <TextInput size="xs" placeholder={t("admin.menu.nameMs")} value={nameMs} maxLength={100}
          onChange={(e) => setNameMs(e.currentTarget.value)} style={{ flex: 1 }} />
        <MoneyInput size="xs" w={130} valueSen={price} onChangeSen={setPrice} aria-label={t("admin.groups.extraPrice")} />
        <Button size="xs" disabled={!name.trim()} loading={createOption.isPending}
          onClick={() => createOption.mutate(
            { option_group_id: group.id, name: name.trim(), name_ms: nameMs.trim() || null, price_delta_sen: price ?? 0, is_active: true },
            { onSuccess: () => { setName(""); setNameMs(""); setPrice(0); }, onError },
          )}>
          {t("common.add")}
        </Button>
      </Group>
    </Paper>
  );
}

function PriceCell({ valueSen, onSave }: { valueSen: number; onSave: (sen: number) => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState<number | null>(valueSen);
  useEffect(() => setValue(valueSen), [valueSen]);
  return (
    <MoneyInput size="xs" valueSen={value} onChangeSen={setValue} aria-label={t("admin.groups.extraPrice")}
      onBlur={() => value !== null && value !== valueSen && onSave(value)} />
  );
}

function GroupModal({ group, onClose }: { group: AdminOptionGroup | "new" | null; onClose: () => void }) {
  const { t } = useTranslation();
  const create = useCreateGroup();
  const update = useUpdateGroup();
  const existing = group && group !== "new" ? group : null;
  const [form, setForm] = useState<OptionGroupIn>({ name: "", name_ms: "", min_select: 0, max_select: 1, is_active: true });
  const [lastGroup, setLastGroup] = useState<typeof group>(null);

  if (group !== lastGroup) {
    setLastGroup(group);
    setForm(existing
      ? { name: existing.name, name_ms: existing.name_ms ?? "", min_select: existing.min_select, max_select: existing.max_select, is_active: existing.is_active }
      : { name: "", name_ms: "", min_select: 0, max_select: 1, is_active: true });
  }
  if (!group) return null;

  const min = form.min_select ?? 0;
  const max = form.max_select ?? 1;
  const valid = form.name.trim() && min <= max && max >= 1;
  const body = { ...form, name: form.name.trim(), name_ms: form.name_ms?.trim() || null };
  const save = () => {
    const opts = { onSuccess: onClose, onError: (e: unknown) => notifyError(t, e) };
    if (existing) update.mutate({ id: existing.id, ...body }, opts);
    else create.mutate(body, opts);
  };

  return (
    <Modal opened onClose={onClose} title={existing ? t("admin.groups.edit") : t("admin.groups.add")} centered>
      <Stack>
        <TextInput label={t("admin.menu.nameEn")} required value={form.name} maxLength={100}
          onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} />
        <TextInput label={t("admin.menu.nameMs")} value={form.name_ms ?? ""} maxLength={100}
          onChange={(e) => setForm({ ...form, name_ms: e.currentTarget.value })} />
        <Group grow>
          <NumberInput label={t("admin.groups.min")} description={t("admin.groups.minHint")} min={0} max={20}
            value={min} onChange={(v) => setForm({ ...form, min_select: Number(v) || 0 })} />
          <NumberInput label={t("admin.groups.max")} min={1} max={20}
            value={max} onChange={(v) => setForm({ ...form, max_select: Number(v) || 1 })} />
        </Group>
        <Text size="sm" c="dimmed">
          {ruleLabel(t, { min_select: min, max_select: max })}
        </Text>
        <Switch label={t("admin.menu.visible")} checked={form.is_active ?? true}
          onChange={(e) => setForm({ ...form, is_active: e.currentTarget.checked })} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
          <Button disabled={!valid} loading={create.isPending || update.isPending} onClick={save}>
            {t("common.save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
