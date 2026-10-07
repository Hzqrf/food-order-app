import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./lib/i18n";

import { createTheme, MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import { isApiError } from "./api/client";
import { router } from "./routes";

const theme = createTheme({
  primaryColor: "orange",
  defaultRadius: "md",
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
});

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      // A session that ended mid-use: refresh who we are so guards redirect or show the PIN lock.
      if (isApiError(error, "not_authenticated")) queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  }),
  defaultOptions: {
    queries: {
      retry: (count, error) => !(isApiError(error) && error.status >= 400 && error.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications position="top-center" />
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
