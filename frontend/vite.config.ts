import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_TARGET = process.env.VITE_API_TARGET ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("yet-another-react-lightbox")) return "lightbox";
          if (id.includes("@codemirror") || id.includes("@uiw")) return "editor";
          if (id.includes("@lezer")) return "editor";
          if (id.includes("react-router")) return "router";
          if (id.includes("react")) return "react";
          return "vendor";
        },
      },
    },
  },
});
