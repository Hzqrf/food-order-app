import { Center, Loader } from "@mantine/core";
import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate, useLocation } from "react-router";

import { ErrorState } from "./components/ErrorState";
import { RequireRole } from "./components/RequireRole";
import { mapLegacyPath } from "./areas/staff/console/legacy";
import { OwnerRoute } from "./areas/staff/console/OwnerRoute";

// Two lazy-loaded areas: customers never download staff console code.
const CustomerLayout = lazy(() => import("./areas/customer/CustomerLayout"));
const CustomerMenuPage = lazy(() => import("./areas/customer/pages/MenuPage"));
const CartPage = lazy(() => import("./areas/customer/pages/CartPage"));
const CheckoutPage = lazy(() => import("./areas/customer/pages/CheckoutPage"));
const OrderPage = lazy(() => import("./areas/customer/pages/OrderPage"));

const LoginPage = lazy(() => import("./areas/staff/pages/LoginPage"));
const ConsoleLayout = lazy(() => import("./areas/staff/console/ConsoleLayout"));
const BoardPage = lazy(() => import("./areas/staff/pages/BoardPage"));
const TakeOrderPage = lazy(() => import("./areas/staff/pages/TakeOrderPage"));
const SearchPage = lazy(() => import("./areas/staff/pages/SearchPage"));
const StaffOrderPage = lazy(() => import("./areas/staff/pages/OrderPage"));
const StaffMenuPage = lazy(() => import("./areas/staff/pages/MenuPage"));

const DashboardPage = lazy(() => import("./areas/staff/pages/DashboardPage"));
const SalesHistoryPage = lazy(() => import("./areas/staff/pages/SalesHistoryPage"));
const SalesReportPage = lazy(() => import("./areas/staff/pages/SalesReportPage"));
const AuditPage = lazy(() => import("./areas/staff/pages/AuditPage"));
const TeamPage = lazy(() => import("./areas/staff/pages/TeamPage"));
const SettingsPage = lazy(() => import("./areas/staff/pages/SettingsPage"));

function Lazy({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <Center h="60vh">
          <Loader />
        </Center>
      }
    >
      {children}
    </Suspense>
  );
}

const errorElement = <ErrorState fullPage />;

/** Old /admin/* links (and the old sold-out tab) land on their console page. */
function LegacyRedirect() {
  const { pathname } = useLocation();
  const target = mapLegacyPath(pathname);
  return <Navigate to={target === pathname ? "/staff/dashboard" : target} replace />;
}

const owner = (page: ReactNode) => <OwnerRoute><Lazy>{page}</Lazy></OwnerRoute>;

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Lazy><CustomerLayout /></Lazy>,
    errorElement,
    children: [
      { index: true, element: <Lazy><CustomerMenuPage /></Lazy> },
      { path: "cart", element: <Lazy><CartPage /></Lazy> },
      { path: "checkout", element: <Lazy><CheckoutPage /></Lazy> },
      { path: "t/:token", element: <Lazy><OrderPage /></Lazy> },
    ],
  },
  { path: "/login", element: <Lazy><LoginPage /></Lazy>, errorElement },
  {
    path: "/staff",
    // A registered shop tablet may show the queue while locked; ConsoleLayout handles the PIN lock.
    element: <RequireRole role="staff" allowDevice><Lazy><ConsoleLayout /></Lazy></RequireRole>,
    errorElement,
    children: [
      { index: true, element: <Lazy><BoardPage /></Lazy> },
      { path: "take", element: <Lazy><TakeOrderPage /></Lazy> },
      { path: "search", element: <Lazy><SearchPage /></Lazy> },
      { path: "orders/:id", element: <Lazy><StaffOrderPage /></Lazy> },
      { path: "menu", element: <Lazy><StaffMenuPage /></Lazy> },
      { path: "sold-out", element: <LegacyRedirect /> },
      { path: "dashboard", element: owner(<DashboardPage />) },
      { path: "sales", element: owner(<SalesHistoryPage />) },
      { path: "reports", element: owner(<SalesReportPage />) },
      { path: "team", element: owner(<TeamPage />) },
      { path: "audit", element: owner(<AuditPage />) },
      { path: "settings", element: owner(<SettingsPage />) },
    ],
  },
  { path: "/admin/*", element: <LegacyRedirect /> },
  { path: "*", element: <Navigate to="/" replace /> },
]);
