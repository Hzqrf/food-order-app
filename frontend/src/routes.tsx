import { Center, Loader } from "@mantine/core";
import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router";

import { ErrorState } from "./components/ErrorState";
import { RequireRole } from "./components/RequireRole";

// Three lazy-loaded areas: customers never download staff or admin code.
const CustomerLayout = lazy(() => import("./areas/customer/CustomerLayout"));
const CustomerMenuPage = lazy(() => import("./areas/customer/pages/MenuPage"));
const CartPage = lazy(() => import("./areas/customer/pages/CartPage"));
const CheckoutPage = lazy(() => import("./areas/customer/pages/CheckoutPage"));
const OrderPage = lazy(() => import("./areas/customer/pages/OrderPage"));

const LoginPage = lazy(() => import("./areas/staff/pages/LoginPage"));
const StaffLayout = lazy(() => import("./areas/staff/StaffLayout"));
const BoardPage = lazy(() => import("./areas/staff/pages/BoardPage"));
const TakeOrderPage = lazy(() => import("./areas/staff/pages/TakeOrderPage"));
const SearchPage = lazy(() => import("./areas/staff/pages/SearchPage"));
const SoldOutPage = lazy(() => import("./areas/staff/pages/SoldOutPage"));

const AdminLayout = lazy(() => import("./areas/admin/AdminLayout"));
const AdminMenuPage = lazy(() => import("./areas/admin/pages/MenuPage"));
const AdminStaffPage = lazy(() => import("./areas/admin/pages/StaffPage"));
const AdminSettingsPage = lazy(() => import("./areas/admin/pages/SettingsPage"));

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
    // A registered shop tablet may show the board while locked; StaffLayout handles the PIN lock.
    element: <RequireRole role="staff" allowDevice><Lazy><StaffLayout /></Lazy></RequireRole>,
    errorElement,
    children: [
      { index: true, element: <Lazy><BoardPage /></Lazy> },
      { path: "take", element: <Lazy><TakeOrderPage /></Lazy> },
      { path: "search", element: <Lazy><SearchPage /></Lazy> },
      { path: "sold-out", element: <Lazy><SoldOutPage /></Lazy> },
    ],
  },
  {
    path: "/admin",
    element: <RequireRole role="admin"><Lazy><AdminLayout /></Lazy></RequireRole>,
    errorElement,
    children: [
      { index: true, element: <Navigate to="menu" replace /> },
      { path: "menu", element: <Lazy><AdminMenuPage /></Lazy> },
      { path: "staff", element: <Lazy><AdminStaffPage /></Lazy> },
      { path: "settings", element: <Lazy><AdminSettingsPage /></Lazy> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
