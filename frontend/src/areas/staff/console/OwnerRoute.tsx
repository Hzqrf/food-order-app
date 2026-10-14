import { Center, Loader, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconDeviceTablet } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router";

import { useSession } from "../../../api/auth";
import { SectionCard } from "./SectionCard";

/** Owner-only console pages. Never on the shared shop tablet, even for an owner unlocked by PIN. */
export function OwnerRoute({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { data: session, isPending } = useSession();

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
          </Stack>
        </SectionCard>
      </Center>
    );
  }
  return <>{children}</>;
}
