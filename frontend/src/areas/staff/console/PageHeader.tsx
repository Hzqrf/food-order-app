import { ActionIcon, Group, Stack, Text, Title } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { radius, tokens } from "./tokens";

export function PageHeader({ title, subtitle, actions, back }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  back?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Group justify="space-between" align="flex-start" gap="lg" wrap="wrap" mb={24}>
      <Group align="flex-start" gap="sm" wrap="nowrap" miw={0}>
        {back && (
          <ActionIcon size={40} radius={radius.button} variant="white" c={tokens.text} mt={2} onClick={back}
            aria-label={t("common.back")} style={{ boxShadow: tokens.cardShadow }}>
            <IconArrowLeft size={20} />
          </ActionIcon>
        )}
        <Stack gap={6} miw={0}>
          <Title order={1} fz={{ base: 24, sm: 30 }} lh={{ base: "32px", sm: "38px" }} fw={600} c={tokens.text}
            style={{ letterSpacing: "-0.02em" }}>
            {title}
          </Title>
          {subtitle && (
            <Text fz={15} lh="22px" c={tokens.subtitle}>
              {subtitle}
            </Text>
          )}
        </Stack>
      </Group>
      {actions && <Group gap="sm">{actions}</Group>}
    </Group>
  );
}
