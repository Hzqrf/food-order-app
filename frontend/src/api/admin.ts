import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type { SettingsPatch, ShopOut, StaffIn, StaffOut } from "./types";

const staffKey = ["admin-staff"];

export function useStaffList() {
  return useQuery({ queryKey: staffKey, queryFn: () => api<StaffOut[]>("/admin/staff") });
}

function useStaffMutation<V, R = unknown>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: staffKey }) });
}

export const useCreateStaff = () => useStaffMutation((body: StaffIn) => api<StaffOut>("/admin/staff", { body }));

export const useUpdateStaff = () =>
  useStaffMutation(({ id, ...body }: Partial<Omit<StaffIn, "username" | "password" | "pin">> & { id: number }) =>
    api<StaffOut>(`/admin/staff/${id}`, { method: "PATCH", body }),
  );

export const useSetStaffActive = () =>
  useStaffMutation(({ id, active }: { id: number; active: boolean }) =>
    api<StaffOut>(`/admin/staff/${id}/${active ? "reactivate" : "deactivate"}`, { method: "POST" }),
  );

export const useSetStaffPin = () =>
  useStaffMutation(({ id, pin }: { id: number; pin: string }) => api(`/admin/staff/${id}/pin`, { body: { pin } }));

export const useResetStaffPassword = () =>
  useStaffMutation(({ id, password }: { id: number; password: string }) =>
    api(`/admin/staff/${id}/reset-password`, { body: { password } }),
  );

export function useSettings() {
  return useQuery({ queryKey: ["admin-settings"], queryFn: () => api<ShopOut>("/admin/settings") });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SettingsPatch) => api<ShopOut>("/admin/settings", { method: "PATCH", body }),
    onSuccess: (shop) => {
      qc.setQueryData(["admin-settings"], shop);
      qc.setQueryData(["shop"], shop);
    },
  });
}
