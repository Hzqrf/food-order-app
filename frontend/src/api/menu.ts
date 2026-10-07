import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type {
  AdminItem,
  AdminMenu,
  AdminOption,
  AdminOptionGroup,
  ItemIn,
  ItemPatch,
  MenuOut,
  OptionGroupIn,
  OptionIn,
  ShopOut,
} from "./types";

export const menuKey = ["menu"];
const adminMenuKey = ["admin-menu"];

export function useMenu() {
  return useQuery({ queryKey: menuKey, queryFn: () => api<MenuOut>("/menu"), staleTime: 30_000 });
}

export function useShop() {
  return useQuery({ queryKey: ["shop"], queryFn: () => api<ShopOut>("/shop"), staleTime: 30_000 });
}

export function useSetSoldOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id, soldOut }: { kind: "items" | "options"; id: number; soldOut: boolean }) =>
      api(`/staff/menu/${kind}/${id}/sold-out`, { method: "PATCH", body: { is_sold_out: soldOut } }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: menuKey });
      qc.invalidateQueries({ queryKey: adminMenuKey });
    },
  });
}

export function useSetOnlineOrders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accepting: boolean) =>
      api<ShopOut>("/staff/shop/online-orders", { method: "PATCH", body: { accepting } }),
    onSuccess: (shop) => qc.setQueryData(["shop"], shop),
  });
}

// --- Admin ---------------------------------------------------------------------------------------

export function useAdminMenu() {
  return useQuery({ queryKey: adminMenuKey, queryFn: () => api<AdminMenu>("/admin/menu") });
}

/** Every admin menu mutation refreshes the admin view and the public menu. */
function useMenuMutation<V, R = unknown>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: adminMenuKey });
      qc.invalidateQueries({ queryKey: menuKey });
    },
  });
}

export const useCreateCategory = () =>
  useMenuMutation((body: { name: string; name_ms?: string | null }) =>
    api("/admin/menu/categories", { body }),
  );

export const useUpdateCategory = () =>
  useMenuMutation(({ id, ...body }: { id: number; name?: string; name_ms?: string | null; is_active?: boolean }) =>
    api(`/admin/menu/categories/${id}`, { method: "PATCH", body }),
  );

export const useCreateItem = () =>
  useMenuMutation((body: ItemIn) => api<AdminItem>("/admin/menu/items", { body }));

export const useUpdateItem = () =>
  useMenuMutation(({ id, ...body }: ItemPatch & { id: number }) =>
    api<AdminItem>(`/admin/menu/items/${id}`, { method: "PATCH", body }),
  );

export const useSetItemGroups = () =>
  useMenuMutation(({ id, groupIds }: { id: number; groupIds: number[] }) =>
    api<AdminItem>(`/admin/menu/items/${id}/option-groups`, {
      method: "PUT",
      body: { option_group_ids: groupIds },
    }),
  );

export const useUploadItemImage = () =>
  useMenuMutation(({ id, file }: { id: number; file: File }) => {
    const form = new FormData();
    form.append("file", file);
    return api<AdminItem>(`/admin/menu/items/${id}/image`, { method: "POST", form });
  });

export const useCreateGroup = () =>
  useMenuMutation((body: OptionGroupIn) => api<AdminOptionGroup>("/admin/menu/option-groups", { body }));

export const useUpdateGroup = () =>
  useMenuMutation(({ id, ...body }: Partial<OptionGroupIn> & { id: number }) =>
    api<AdminOptionGroup>(`/admin/menu/option-groups/${id}`, { method: "PATCH", body }),
  );

export const useCreateOption = () =>
  useMenuMutation((body: OptionIn) => api<AdminOption>("/admin/menu/options", { body }));

export const useUpdateOption = () =>
  useMenuMutation(({ id, ...body }: Partial<Omit<OptionIn, "option_group_id">> & { id: number }) =>
    api<AdminOption>(`/admin/menu/options/${id}`, { method: "PATCH", body }),
  );

export const useSort = () =>
  useMenuMutation((body: { entity: "categories" | "items" | "options"; ids: number[] }) =>
    api("/admin/menu/sort", { method: "PUT", body }),
  );
