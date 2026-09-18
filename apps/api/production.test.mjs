import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

async function fixture(run) {
  const temporary = await mkdtemp(join(tmpdir(), "nuraai-runner-"));
  try {
    const app = join(temporary, "app");
    await mkdir(join(app, "dist", "db"), { recursive: true });
    await cp(new URL("./production.mjs", import.meta.url), join(app, "production.mjs"));
    await writeFile(join(app, "package.json"), JSON.stringify({ type: "module" }));
    for (const [entry, file] of Object.entries({
      api: "index.js",
      worker: "worker.js",
      migrate: "db/migrate.js",
      config: "config.js",
    })) {
      await writeFile(
        join(app, "dist", file),
        `process.stdout.write(JSON.stringify({ entry: '${entry}', mode: process.env.NODE_ENV, value: process.env.FIXTURE_VALUE }));`,
      );
    }
    const invoke = (entry, args = [], env = {}) => {
      const result = spawnSync(process.execPath, [join(app, "production.mjs"), entry, ...args], {
        cwd: temporary,
        env,
        encoding: "utf8",
        timeout: 10000,
      });
      if (result.error) throw result.error;
      return result;
    };
    await run({ temporary, invoke });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

test("all production entries force production, preserve injection, and ignore implicit env files", async () => {
  await fixture(async ({ temporary, invoke }) => {
    await writeFile(join(temporary, ".env"), "FIXTURE_VALUE=must-not-load\n");
    await writeFile(join(temporary, ".env.production"), "FIXTURE_VALUE=must-not-load\n");
    for (const entry of ["api", "worker", "migrate", "config"]) {
      for (const NODE_ENV of [undefined, "development", "test"]) {
        const result = invoke(entry, [], { NODE_ENV, FIXTURE_VALUE: "injected" });
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(JSON.parse(result.stdout), {
          entry,
          mode: "production",
          value: "injected",
        });
      }
    }
    assert.deepEqual(JSON.parse(invoke("config").stdout), { entry: "config", mode: "production" });
  });
});

test("explicit env files are relative to the invoking directory, with injection taking precedence", async () => {
  await fixture(async ({ temporary, invoke }) => {
    await writeFile(
      join(temporary, "synthetic settings.env"),
      "NODE_ENV=development\nFIXTURE_VALUE=from-file\n",
    );
    for (const args of [
      ["--env-file=synthetic settings.env"],
      ["--env-file", "synthetic settings.env"],
    ]) {
      const result = invoke("config", args);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), {
        entry: "config",
        mode: "production",
        value: "from-file",
      });
      assert.equal(
        JSON.parse(invoke("config", args, { FIXTURE_VALUE: "injected" }).stdout).value,
        "injected",
      );
    }
  });
});

test("missing explicit files, invalid entries, and unsupported arguments fail before entry execution", async () => {
  await fixture(async ({ invoke }) => {
    for (const [entry, args] of [
      ["config", ["--env-file=missing.env"]],
      ["config", ["--env-file"]],
      ["config", ["--env-file="]],
      ["config", ["--unknown"]],
      ["config", ["--env-file=a", "--env-file=b"]],
      ["../index", []],
    ]) {
      const result = invoke(entry, args);
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, "");
    }
  });
});
