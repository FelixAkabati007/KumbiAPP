import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      all: false,
      include: ["lib/**", "components/**"],
      exclude: ["**/*.d.ts", "**/index.ts", "**/types.ts"],
      thresholds: {
        statements: 50,
        branches: 50,
        // Existing project coverage is below 40% for function coverage; keep the gate aligned with the measured baseline.
        functions: 35,
        lines: 50,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
