import { ActionIcon, Group } from "@mantine/core";
import { IconArrowDown, IconArrowUp } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

export function moved(ids: number[], index: number, dir: -1 | 1): number[] {
  const next = [...ids];
  const target = index + dir;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function SortButtons({ index, count, onMove }: { index: number; count: number; onMove: (dir: -1 | 1) => void }) {
  const { t } = useTranslation();
  return (
    <Group gap={2} wrap="nowrap">
      <ActionIcon variant="subtle" color="gray" disabled={index === 0} onClick={() => onMove(-1)}
        aria-label={t("admin.moveUp")}>
        <IconArrowUp size={16} />
      </ActionIcon>
      <ActionIcon variant="subtle" color="gray" disabled={index === count - 1} onClick={() => onMove(1)}
        aria-label={t("admin.moveDown")}>
        <IconArrowDown size={16} />
      </ActionIcon>
    </Group>
  );
}
