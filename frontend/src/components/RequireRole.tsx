import { Center, Loader } from "@mantine/core";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

import { useSession } from "../api/auth";
import { ErrorState } from "./ErrorState";

/** Client-side guard for convenience only; the server checks every request. */
export function RequireRole({
  role,
  allowDevice = false,
  children,
}: {
  role: "staff" | "admin";
  allowDevice?: boolean;
  children: ReactNode;
}) {
  const { data, isPending, isError, refetch } = useSession();
  const location = useLocation();

  if (isPending) {
    return (
      <Center h="60vh">
        <Loader />
      </Center>
    );
  }
  if (isError) return <ErrorState onRetry={() => refetch()} fullPage />;

  const user = data.user;
  const roleOk = user && (role === "staff" || user.role === "admin");
  if (roleOk || (allowDevice && data.device_registered)) return <>{children}</>;
  // Staff in the owner area, or a locked shop tablet, go to the board.
  if ((user && !roleOk) || data.device_registered) return <Navigate to="/staff" replace />;
  return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
}
