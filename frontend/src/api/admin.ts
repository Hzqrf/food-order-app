import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type { AuditPage, Dashboard, OrderPage, RefundIn, Report, SettingsPatch, ShopOut, StaffIn, StaffOut } from "./types";

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

// --- Today, orders, reports, audit -----------------------------------------------------------------

export function useDashboard() {
  return useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => api<Dashboard>("/admin/dashboard", { poll: true }),
    refetchInterval: 30_000,
  });
}

export type OrderFilters = {
  date_from?: string;
  date_to?: string;
  status?: string;
  payment_status?: string;
  channel?: string;
  staff_id?: string;
  q?: string;
};

function qs(params: Record<string, string | number | undefined | null>) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  });
  return p.toString();
}

export function useAdminOrders(filters: OrderFilters) {
  return useInfiniteQuery({
    queryKey: ["admin-orders", filters],
    queryFn: ({ pageParam }) => api<OrderPage>(`/admin/orders?${qs({ ...filters, cursor: pageParam, limit: 50 })}`),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export type ReportRange = { date_from: string; date_to: string; group_by: "day" | "week" | "month" };

export function useReport(range: ReportRange) {
  return useQuery({
    queryKey: ["admin-report", range],
    queryFn: () => api<Report>(`/admin/reports?${qs(range)}`),
    placeholderData: keepPreviousData, // refetch keeps the previous frame, no layout jump
  });
}

export function ordersCsvUrl(range: ReportRange) {
  return `/api/v1/admin/reports/orders.csv?${qs({ date_from: range.date_from, date_to: range.date_to })}`;
}

export type AuditFilters = { action?: string; date_from?: string; date_to?: string };

export function useAuditLogs(filters: AuditFilters) {
  return useInfiniteQuery({
    queryKey: ["admin-audit", filters],
    queryFn: ({ pageParam }) => api<AuditPage>(`/admin/audit-logs?${qs({ ...filters, cursor: pageParam })}`),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export function useRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: RefundIn & { id: number }) =>
      api(`/admin/orders/${id}/refund`, { body }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["order"] });
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      qc.invalidateQueries({ queryKey: ["admin-report"] });
    },
  });
}
