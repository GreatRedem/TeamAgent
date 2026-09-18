import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import type { ViteUserConfig } from "vitest/config";

const require = createRequire(new URL("../api/package.json", import.meta.url));

export default {
  envDir: false,
  resolve: {
    alias: {
      vitest: resolve(dirname(require.resolve("vitest/package.json")), "dist/index.js"),
    },
  },
  define: {
    __API_BASE_URL__: JSON.stringify(""),
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
} satisfies ViteUserConfig;
