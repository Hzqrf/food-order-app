import { Button, Center, Group, Loader, Modal, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconDeviceTablet } from "@tabler/icons-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router";

import { useLogout, useSession, useUnregisterDevice } from "../../../api/auth";
import { notifyError } from "../../../components/errors";
import { SectionCard } from "./SectionCard";

/** Owner-only console pages. Never on the shared shop tablet, even for an owner unlocked by PIN. */
export function OwnerRoute({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { data: session, isPending } = useSession();
  const unregister = useUnregisterDevice();
  const logout = useLogout();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  // The owner may be here by PIN, which only counts on the shop tablet. Once it is no longer the
  // tablet, end the session too, so owner tools never open on the shared device.
  const unregisterAndSignOut = () =>
    unregister.mutate(undefined, {
      onSuccess: () => logout.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) }),
      onError: (e) => notifyError(t, e),
    });

  if (isPending) {
    return (
      <Center h="40vh">
        <Loader />
      </Center>
    );
  }
  const user = session?.user;
  // A locked tablet: ConsoleLayout already shows the PIN pad on every page except the queue.
  if (!user) return null;
  if (user.role !== "admin") return <Navigate to="/staff" replace />;
  if (session.device_registered) {
    return (
      <Center mih="50vh">
        <SectionCard maw={480}>
          <Stack align="center" gap="sm" ta="center">
            <ThemeIcon size={48} radius="xl" variant="light">
              <IconDeviceTablet size={26} />
            </ThemeIcon>
            <Title order={3} fz={18}>
              {t("console.ownerOnTablet.title")}
            </Title>
            <Text c="dimmed" size="sm">
              {t("console.ownerOnTablet.body")}
            </Text>
            {/* Unregistering only works from the tablet itself, so it lives here rather than in Settings. */}
            <Button variant="light" color="gray" mt="xs" onClick={() => setConfirming(true)}>
              {t("console.ownerOnTablet.unregister")}
            </Button>
          </Stack>
        </SectionCard>
        <Modal opened={confirming} onClose={() => setConfirming(false)} centered radius={16}
          title={t("console.ownerOnTablet.confirmTitle")}>
          <Text size="sm" c="dimmed">{t("console.ownerOnTablet.confirmBody")}</Text>
          <Group justify="flex-end" mt="lg" gap="xs">
            <Button variant="default" onClick={() => setConfirming(false)}>{t("common.cancel")}</Button>
            <Button color="red" loading={unregister.isPending || logout.isPending} onClick={unregisterAndSignOut}>
              {t("console.ownerOnTablet.confirm")}
            </Button>
          </Group>
        </Modal>
      </Center>
    );
  }
  return <>{children}</>;
}
