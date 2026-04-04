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
    coverage: {
      provider: "v8",
      thresholds: {
        lines: 75,
        statements: 75,
        functions: 75,
      },
      exclude: [
        "**/*.css",
        // Clerk + Prisma orchestration; covered by integration/E2E, not unit targets.
        "lib/user.ts",
        // DB client singleton + env; not meaningful under v8 unit coverage.
        "lib/prisma.ts",
        // Liveblocks + large client surface; behavior belongs in component/integration tests.
        "components/packing/PackingListEditor.tsx",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
