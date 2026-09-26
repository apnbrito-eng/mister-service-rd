import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { entries: ["tests/manual/crm.html"] },
  resolve: {
    alias: [
      {
        find: /.*\/services\/equipoApi$/,
        replacement: resolve("tests/manual/crm-fixture.ts"),
      },
      {
        find: /.*\/services\/whatsapp.service$/,
        replacement: resolve("tests/manual/crm-fixture.ts"),
      },
      {
        find: /.*\/context\/AppContext$/,
        replacement: resolve("tests/manual/crm-fixture.ts"),
      },
    ],
  },
  server: { host: "127.0.0.1", port: 5188 },
});
