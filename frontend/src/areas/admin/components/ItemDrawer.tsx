import { Button, Drawer, FileButton, Group, Image, MultiSelect, Select, Stack, Switch, Text, Textarea, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useCreateItem, useSetItemGroups, useUpdateItem, useUploadItemImage } from "../../../api/menu";
import type { AdminItem, AdminMenu } from "../../../api/types";
import { notifyError } from "../../../components/errors";
import { MoneyInput } from "../../../components/MoneyInput";

type Form = {
  category_id: string | null;
  name: string;
  name_ms: string;
  description: string;
  description_ms: string;
  price_sen: number | null;
  is_active: boolean;
  is_sold_out: boolean;
  groups: string[];
};

function initial(item: AdminItem | "new" | null, menu: AdminMenu): Form {
  if (item && item !== "new") {
    return {
      category_id: String(item.category_id),
      name: item.name,
      name_ms: item.name_ms ?? "",
      description: item.description ?? "",
      description_ms: item.description_ms ?? "",
      price_sen: item.price_sen,
      is_active: item.is_active,
      is_sold_out: item.is_sold_out,
      groups: item.option_group_ids.map(String),
    };
  }
  return {
    category_id: menu.categories[0] ? String(menu.categories[0].id) : null,
    name: "", name_ms: "", description: "", description_ms: "",
    price_sen: null, is_active: true, is_sold_out: false, groups: [],
  };
}

export function ItemDrawer({ item, menu, onClose }: { item: AdminItem | "new" | null; menu: AdminMenu; onClose: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Form>(() => initial(item, menu));
  const create = useCreateItem();
  const update = useUpdateItem();
  const setGroups = useSetItemGroups();
  const upload = useUploadItemImage();
  const existing = item && item !== "new" ? item : null;
  // Keep the latest image after an upload without closing the drawer.
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    setForm(initial(item, menu));
    setImageUrl(item && item !== "new" ? item.image_url : null);
    // Only reset when a different item is opened, not when the menu refreshes.
  }, [item]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const valid = form.name.trim() && form.price_sen !== null && form.category_id;
  const saving = create.isPending || update.isPending || setGroups.isPending;

  const save = async () => {
    if (!valid) return;
    const body = {
      category_id: Number(form.category_id),
      name: form.name.trim(),
      name_ms: form.name_ms.trim() || null,
      description: form.description.trim() || null,
      description_ms: form.description_ms.trim() || null,
      price_sen: form.price_sen!,
      is_active: form.is_active,
    };
    try {
      const saved = existing
        ? await update.mutateAsync({ id: existing.id, ...body, is_sold_out: form.is_sold_out })
        : await create.mutateAsync(body);
      const groupIds = form.groups.map(Number);
      if (groupIds.join() !== saved.option_group_ids.join()) {
        await setGroups.mutateAsync({ id: saved.id, groupIds });
      }
      notifications.show({ color: "green", message: t("admin.saved") });
      onClose();
    } catch (e) {
      notifyError(t, e);
    }
  };

  return (
    <Drawer opened={item !== null} onClose={onClose} position="right" size="md"
      title={existing ? t("admin.menu.editItem") : t("admin.menu.addItem")}>
      <Stack>
        <Select label={t("admin.menu.category")} required allowDeselect={false} value={form.category_id}
          onChange={(v) => set("category_id", v)}
          data={menu.categories.map((c) => ({ value: String(c.id), label: c.name }))} />
        <TextInput label={t("admin.menu.nameEn")} required maxLength={100} value={form.name}
          onChange={(e) => set("name", e.currentTarget.value)} />
        <TextInput label={t("admin.menu.nameMs")} maxLength={100} value={form.name_ms}
          onChange={(e) => set("name_ms", e.currentTarget.value)} />
        <Textarea label={t("admin.menu.descriptionEn")} maxLength={500} autosize minRows={2} value={form.description}
          onChange={(e) => set("description", e.currentTarget.value)} />
        <Textarea label={t("admin.menu.descriptionMs")} maxLength={500} autosize minRows={2} value={form.description_ms}
          onChange={(e) => set("description_ms", e.currentTarget.value)} />
        <MoneyInput label={t("admin.menu.price")} required valueSen={form.price_sen}
          onChangeSen={(v) => set("price_sen", v)} />
        <MultiSelect label={t("admin.menu.optionGroups")} description={t("admin.menu.optionGroupsHint")}
          value={form.groups} onChange={(v) => set("groups", v)} searchable
          data={menu.option_groups.map((g) => ({ value: String(g.id), label: g.is_active ? g.name : `${g.name} (${t("admin.menu.hidden")})` }))} />
        <Switch label={t("admin.menu.visible")} checked={form.is_active}
          onChange={(e) => set("is_active", e.currentTarget.checked)} />
        {existing && (
          <Switch label={t("menu.soldOutToday")} checked={form.is_sold_out}
            onChange={(e) => set("is_sold_out", e.currentTarget.checked)} />
        )}

        {existing ? (
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {t("admin.menu.photo")}
            </Text>
            {imageUrl && <Image src={imageUrl} w={160} radius="md" alt="" />}
            <FileButton accept="image/jpeg,image/png,image/webp"
              onChange={(file) => {
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) return notifications.show({ color: "red", message: t("apiError.image_too_large") });
                upload.mutate({ id: existing.id, file }, {
                  onSuccess: (saved) => setImageUrl(saved.image_url),
                  onError: (e) => notifyError(t, e),
                });
              }}>
              {(props) => (
                <Button variant="light" loading={upload.isPending} {...props}>
                  {imageUrl ? t("admin.menu.replacePhoto") : t("admin.menu.uploadPhoto")}
                </Button>
              )}
            </FileButton>
          </Stack>
        ) : (
          <Text size="xs" c="dimmed">
            {t("admin.menu.photoAfterSave")}
          </Text>
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} loading={saving} disabled={!valid}>
            {t("common.save")}
          </Button>
        </Group>
      </Stack>
    </Drawer>
  );
}
