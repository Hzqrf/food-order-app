import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the API runs on :8010 and is proxied, so the app and API share one origin
// and the session cookie stays first-party, exactly as behind Caddy in production.
const API = process.env.API_URL ?? "http://127.0.0.1:8010";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": API,
      "/media": API,
    },
  },
});
