import { Alert, Anchor, Button, Center, Group, Paper, PasswordInput, Stack, TextInput, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate, useSearchParams } from "react-router";

import { useLogin, useSession } from "../../../api/auth";
import { isApiError } from "../../../api/client";
import type { SessionOut } from "../../../api/types";
import { LanguageSwitch } from "../../../components/LanguageSwitch";
import { PoweredBy } from "../../../components/PoweredBy";
import { PinPad } from "../components/PinPad";

function home(session: SessionOut, next: string | null) {
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    if (!next.startsWith("/admin") || session.user?.role === "admin") return next;
  }
  return session.user?.role === "admin" && !session.device_registered ? "/admin" : "/staff";
}

export default function LoginPage() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const login = useLogin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usePassword, setUsePassword] = useState(false);
  const form = useForm({ initialValues: { login: "", password: "", totp_code: "" } });

  if (session?.user) return <Navigate to={home(session, params.get("next"))} replace />;

  const submit = form.onSubmit((values) => {
    setError(null);
    login.mutate(
      { login: values.login, password: values.password, totp_code: values.totp_code || undefined },
      {
        onSuccess: (s) => navigate(home(s, params.get("next")), { replace: true }),
        onError: (e) => {
          if (isApiError(e, "totp_required")) return setNeedTotp(true);
          if (isApiError(e, "account_locked") || isApiError(e, "too_many_requests")) return setError(t("login.locked"));
          if (isApiError(e, "invalid_totp")) return setError(t("login.badCode"));
          setError(isApiError(e, "invalid_credentials") ? t("login.wrong") : t("error.body"));
        },
      },
    );
  });

  const tablet = session?.device_registered && !usePassword;

  return (
    <Center mih="100vh" bg="gray.0" p="md">
      <Paper withBorder p="xl" w="100%" maw={tablet ? 560 : 400}>
        <Stack>
          <Group justify="space-between">
            <Title order={3}>{session?.branch_name ?? t("login.title")}</Title>
            <LanguageSwitch />
          </Group>
          {tablet ? (
            <>
              <PinPad onUnlocked={() => navigate("/staff", { replace: true })} />
              <Anchor size="sm" ta="center" onClick={() => setUsePassword(true)}>
                {t("login.withPassword")}
              </Anchor>
            </>
          ) : (
            <form onSubmit={submit}>
              <Stack>
                {error && <Alert color="red">{error}</Alert>}
                <TextInput label={t("login.username")} autoComplete="username" required autoFocus
                  {...form.getInputProps("login")} />
                <PasswordInput label={t("login.password")} autoComplete="current-password" required
                  {...form.getInputProps("password")} />
                {needTotp && (
                  <TextInput label={t("login.totp")} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                    required autoFocus {...form.getInputProps("totp_code")} />
                )}
                <Button type="submit" loading={login.isPending}>
                  {t("login.submit")}
                </Button>
              </Stack>
            </form>
          )}
        </Stack>
        <PoweredBy />
      </Paper>
    </Center>
  );
}
