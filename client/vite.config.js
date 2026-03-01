import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Proxy WebSocket connections to the signaling server during development.
    // The frontend connects to ws://<vite-host>/ws which Vite forwards to the
    // Node signaling server on port 3001. In production the frontend build is
    // served by the same server so no proxy is needed.
    proxy: {
      "/ws": {
        target: "http://localhost:3001",
        ws: true,
      },
    },
  },
});
