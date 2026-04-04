import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "vitest-stub-css",
      enforce: "pre",
      load(id) {
        if (id.endsWith(".css")) {
          return "export default {}";
        }
      },
    },
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.tsx"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    passWithNoTests: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
