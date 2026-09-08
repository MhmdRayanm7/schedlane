import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/integration/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    isolate: true,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
