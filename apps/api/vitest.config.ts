import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    globalSetup: ["./tests/globalSetup.ts"],
    setupFiles: ["./tests/setup.ts"],
    // The replica set downloads a binary on first run; give it room.
    testTimeout: 30000,
    hookTimeout: 60000,
    include: ["tests/**/*.test.ts"],
    // One shared mongod, but many workers hammering it. Capping threads keeps
    // the suite deterministic (M2 post-review, pendiente #1).
    poolOptions: { threads: { maxThreads: 4 } },
  },
});
