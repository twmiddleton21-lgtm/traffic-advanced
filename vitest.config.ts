import { defineConfig } from "vitest/config";

export default defineConfig({
  // The app build's identity is stamped in by vite.config.ts; tests get a fixed stand-in.
  define: { __TA_BUILD__: JSON.stringify({ commit: "0123456789ab", dirty: false, builtAt: "2026-10-09T10:00:00.000Z" }) },
  test: {
    environment: "node",
    include: ["shared/**/*.test.ts", "scripts/**/*.test.ts", "web/src/**/*.test.ts", "worker/**/*.test.ts"],
  },
});
