import { cp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const dist = new URL("./dist/", import.meta.url);
await rm(dist, { recursive: true, force: true });
const compiler = resolve(
  dirname(require.resolve("typescript/package.json")),
  require("typescript/package.json").bin.tsc,
);
const result = spawnSync(process.execPath, [compiler, "-p", "tsconfig.json"], {
  cwd: fileURLToPath(new URL("./", import.meta.url)),
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
await cp(new URL("./src/db/migrations/", import.meta.url), new URL("./db/migrations/", dist), {
  recursive: true,
});
