import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.tsx", "tests/**/*.test.ts"],
    // lib/config.ts throws at import time when this is missing; setting it
    // here runs before any module is evaluated, unlike vi.stubEnv inside a
    // test (imports are hoisted and the module has already run by then).
    env: { NEXT_PUBLIC_API_URL: "http://api.test/api/v1" },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
