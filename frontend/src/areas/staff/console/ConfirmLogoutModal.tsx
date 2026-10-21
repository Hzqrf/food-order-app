import { Button, Group, Modal, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { useBoard } from "../../../api/orders";
import { tileStyle } from "./SectionCard";
import { tokens } from "../../../ui/tokens";

/** "Log out of the console?" with how many orders are still in the kitchen. */
export function ConfirmLogoutModal({ opened, busy, onClose, onConfirm }: {
  opened: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const { data: orders = [] } = useBoard();
  const cooking = orders.filter((o) => o.status === "preparing").length;
  const waiting = orders.filter((o) => o.status === "ready").length;

  return (
    <Modal opened={opened} onClose={onClose} centered radius={16} title={t("console.logout.title")}
      styles={{ title: { fontSize: 18, fontWeight: 600 } }}>
      <Text fz={14} c={tokens.subtitle} mb="md">
        {t("console.logout.body")}
      </Text>
      <Text fz={14} c={tokens.body} p={14} style={tileStyle}>
        {t("console.logout.note", { cooking, waiting })}
      </Text>
      <Group justify="flex-end" mt="lg" gap="xs">
        <Button variant="default" onClick={onClose}>
          {t("console.logout.stay")}
        </Button>
        <Button color="red" loading={busy} onClick={onConfirm}>
          {t("console.logout.confirm")}
        </Button>
      </Group>
    </Modal>
  );
}
