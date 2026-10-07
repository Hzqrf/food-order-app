import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type { DeviceStaff, SessionOut, TotpSetupOut } from "./types";

export const sessionKey = ["session"];

export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: () => api<SessionOut>("/auth/session"),
    staleTime: 60_000,
  });
}

function useSessionMutation<V, R extends SessionOut | void>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      if (data) qc.setQueryData(sessionKey, data);
      else qc.invalidateQueries({ queryKey: sessionKey });
    },
  });
}

export function useLogin() {
  return useSessionMutation((body: { login: string; password: string; totp_code?: string }) =>
    api<SessionOut>("/auth/login", { body }),
  );
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      // Forget the person at once so no screen briefly acts as them, then confirm with the server.
      qc.setQueryData<SessionOut>(sessionKey, (s) => (s ? { ...s, user: null, via_pin: false } : s));
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "session" && q.queryKey[0] !== "menu" });
      qc.invalidateQueries({ queryKey: sessionKey });
    },
  });
}

export function usePinUnlock() {
  return useSessionMutation((body: { user_id: number; pin: string }) =>
    api<SessionOut>("/auth/pin", { body }),
  );
}

export function useDeviceStaff(enabled: boolean) {
  return useQuery({
    queryKey: ["device-staff"],
    queryFn: () => api<DeviceStaff[]>("/auth/device/staff"),
    enabled,
  });
}

export function useRegisterDevice() {
  return useSessionMutation(() => api("/auth/device/register", { method: "POST" }));
}

export function useUnregisterDevice() {
  return useSessionMutation(() => api("/auth/device/unregister", { method: "POST" }));
}

export function useTotpSetup() {
  return useMutation({ mutationFn: () => api<TotpSetupOut>("/auth/totp/setup", { method: "POST" }) });
}

export function useTotpEnable() {
  return useSessionMutation((code: string) => api("/auth/totp/enable", { body: { code } }));
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { current_password: string; new_password: string }) =>
      api("/auth/password", { body }),
  });
}
