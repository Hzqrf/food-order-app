// Old owner-area and staff-tab URLs, kept working for bookmarks and the installed tablet app.
export const ADMIN_REDIRECTS: Record<string, string> = {
  "/admin": "/staff/dashboard",
  "/admin/today": "/staff/dashboard",
  "/admin/orders": "/staff/sales",
  "/admin/reports": "/staff/reports",
  "/admin/menu": "/staff/menu",
  "/admin/staff": "/staff/team",
  "/admin/audit": "/staff/audit",
  "/admin/settings": "/staff/settings",
  "/staff/sold-out": "/staff/menu",
};

export function mapLegacyPath(path: string): string {
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return ADMIN_REDIRECTS[clean] ?? path;
}
