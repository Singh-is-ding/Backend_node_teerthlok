import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,         // expose to local network
    https: false,       // we handle HTTPS via ngrok instead
    proxy: {
      "/download": "http://localhost:4000",
      "/jobs":     "http://localhost:4000",
      "/video":    "http://localhost:4000",
      "/info":     "http://localhost:4000",
      "/list":     "http://localhost:4000",
    },
  },
});
