import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: false,
  test: {
    exclude: ["node_modules", "dist", "production.test.mjs"],
  },
});
