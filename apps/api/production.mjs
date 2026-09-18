import { loadEnvFile } from "node:process";

const entries = {
  api: "./dist/index.js",
  worker: "./dist/worker.js",
  migrate: "./dist/db/migrate.js",
  config: "./dist/config.js",
};
const [entry, ...args] = process.argv.slice(2);
if (!Object.hasOwn(entries, entry)) {
  throw new Error("Expected api, worker, migrate, or config.");
}
let envFile;
if (args.length === 1 && args[0].startsWith("--env-file=")) {
  envFile = args[0].slice(11);
} else if (args.length === 2 && args[0] === "--env-file") {
  envFile = args[1];
}
if (args.length && (!envFile || envFile.startsWith("--"))) {
  throw new Error("Expected one optional --env-file=<path> argument.");
}
process.env.NODE_ENV = "production";
if (envFile) loadEnvFile(envFile);
await import(new URL(entries[entry], import.meta.url).href);
