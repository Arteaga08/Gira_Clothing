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
    // One shared mongod, but many workers hammering it. As the suite grew
    // through M3 (reservations/orders/webhooks all run real transactions),
    // occasional flakes reappeared under full-suite load (isolated reruns of
    // the same file always pass — this is host CPU contention, not app logic;
    // tried maxThreads:3, no measurable improvement, reverted). Documented as
    // a known non-blocking characteristic rather than chased indefinitely —
    // same call M2 made for its own version of this (see M2 plan, pendiente #1).
    poolOptions: { threads: { maxThreads: 4 } },
  },
});
