import { Button, Group, Paper, Stack, Switch, Text, TextInput } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useCreateCategory, useSort, useUpdateCategory } from "../../../api/menu";
import type { AdminCategory } from "../../../api/types";
import { notifyError } from "../../../components/errors";
import { SortButtons, moved } from "./SortButtons";

export function CategoriesPanel({ categories }: { categories: AdminCategory[] }) {
  const { t } = useTranslation();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const sort = useSort();
  const [name, setName] = useState("");
  const [nameMs, setNameMs] = useState("");
  const ids = categories.map((c) => c.id);
  const onError = (e: unknown) => notifyError(t, e);

  return (
    <Stack>
      <Text size="sm" c="dimmed">
        {t("admin.menu.categoriesHint")}
      </Text>
      {categories.map((c, idx) => (
        <Paper key={c.id} withBorder p="sm">
          <Group wrap="nowrap">
            <TextInput defaultValue={c.name} aria-label={t("admin.menu.nameEn")} style={{ flex: 1 }}
              onBlur={(e) => e.currentTarget.value.trim() && e.currentTarget.value !== c.name &&
                update.mutate({ id: c.id, name: e.currentTarget.value.trim() }, { onError })} />
            <TextInput defaultValue={c.name_ms ?? ""} placeholder={t("admin.menu.nameMs")} aria-label={t("admin.menu.nameMs")}
              style={{ flex: 1 }}
              onBlur={(e) => e.currentTarget.value !== (c.name_ms ?? "") &&
                update.mutate({ id: c.id, name_ms: e.currentTarget.value.trim() || null }, { onError })} />
            <Switch label={t("admin.menu.visible")} checked={c.is_active}
              onChange={(e) => update.mutate({ id: c.id, is_active: e.currentTarget.checked }, { onError })} />
            <SortButtons index={idx} count={ids.length}
              onMove={(dir) => sort.mutate({ entity: "categories", ids: moved(ids, idx, dir) }, { onError })} />
          </Group>
        </Paper>
      ))}
      <Paper withBorder p="sm">
        <Group wrap="nowrap" align="flex-end">
          <TextInput label={t("admin.menu.newCategory")} value={name} onChange={(e) => setName(e.currentTarget.value)}
            style={{ flex: 1 }} maxLength={100} />
          <TextInput label={t("admin.menu.nameMs")} value={nameMs} onChange={(e) => setNameMs(e.currentTarget.value)}
            style={{ flex: 1 }} maxLength={100} />
          <Button disabled={!name.trim()} loading={create.isPending}
            onClick={() => create.mutate({ name: name.trim(), name_ms: nameMs.trim() || null }, {
              onSuccess: () => { setName(""); setNameMs(""); },
              onError,
            })}>
            {t("common.add")}
          </Button>
        </Group>
      </Paper>
    </Stack>
  );
}
