import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["shared/**/*.test.ts", "scripts/**/*.test.ts", "web/src/**/*.test.ts", "worker/**/*.test.ts"],
  },
});
