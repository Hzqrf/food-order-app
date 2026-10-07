import { Button, Center, Stack, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";

export function ErrorState({ onRetry, fullPage = false }: { onRetry?: () => void; fullPage?: boolean }) {
  const { t } = useTranslation();
  return (
    <Center h={fullPage ? "70vh" : undefined} py="xl">
      <Stack align="center" gap="xs">
        <Title order={4}>{t("error.title")}</Title>
        <Text c="dimmed" ta="center">
          {t("error.body")}
        </Text>
        <Button variant="light" onClick={onRetry ?? (() => window.location.reload())}>
          {t("common.tryAgain")}
        </Button>
      </Stack>
    </Center>
  );
}
