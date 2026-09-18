import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fixture = {
  NODE_ENV: "production",
  TRUST_PROXY: "127.0.0.1",
  DATABASE_URL: "postgres://fixture:fixture@127.0.0.1:1/unused",
  JWT_SECRET: "synthetic-only-secret-not-for-use".repeat(2),
  SIWE_DOMAIN: "app.example.test",
  SIWE_URI: "https://app.example.test",
  SIWE_CHAIN_ID: "1",
  EVM_RPC_URL: "https://rpc.example.test",
};

function load(overrides: Record<string, string | undefined> = {}) {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `const { config } = await import('./src/config.ts'); process.stdout.write(JSON.stringify({ nodeEnv: config.NODE_ENV, origin: config.siweOrigin, access: config.JWT_ACCESS_TTL, refresh: config.REFRESH_TTL }));`,
    ],
    {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      env: { ...fixture, ...overrides },
      encoding: "utf8",
      timeout: 10000,
    },
  );
  if (result.error) throw result.error;
  return result;
}

describe("production configuration with synthetic environments", () => {
  it("accepts injected settings without a provider and preserves documented TTL defaults", () => {
    const result = load();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      nodeEnv: "production",
      origin: fixture.SIWE_URI,
      access: "15m",
      refresh: "30d",
    });
  });

  it.each([
    ["SIWE_URI", "http://app.example.test"],
    ["SIWE_DOMAIN", "other.example.test"],
    ["SIWE_URI", "https://app.example.test:8443"],
    ["JWT_SECRET", undefined],
    ["JWT_SECRET", "short"],
    ["TRUST_PROXY", "true"],
    ["JWT_ACCESS_TTL", "15minutes"],
    ["REFRESH_TTL", "1.5d"],
    ["REFRESH_TTL", "-1d"],
    ["MODEL_BASE_URL", "https://model.example.test/v1"],
    ["MODEL_API_KEY", "synthetic-key"],
  ])("rejects invalid %s", (key, value) => {
    const result = load({ [key]: value });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(key.startsWith("MODEL_") ? "MODEL_" : key);
    expect(result.stderr).not.toContain(fixture.JWT_SECRET);
    expect(result.stderr).not.toContain(fixture.DATABASE_URL);
  });

  it("allows an explicitly disabled provider", () => {
    expect(load({ MODEL_BASE_URL: "", MODEL_API_KEY: "" }).status).toBe(0);
  });

  it("accepts the endpoint and API key together without inventing an environment model ID", () => {
    expect(
      load({ MODEL_BASE_URL: "http://127.0.0.1:1/v1", MODEL_API_KEY: "synthetic-key" }).status,
    ).toBe(0);
  });

  it("accepts a matching nondefault HTTPS port", () => {
    expect(
      load({ SIWE_URI: "https://app.example.test:8443", SIWE_DOMAIN: "app.example.test:8443" })
        .status,
    ).toBe(0);
  });

  it("preserves development HTTP sign-in", () => {
    expect(load({ NODE_ENV: "development", SIWE_URI: "http://app.example.test" }).status).toBe(0);
  });

  it("accepts existing duration syntax and an explicit refresh lifetime without imposing a new policy", () => {
    const result = load({ JWT_ACCESS_TTL: " 900s ", REFRESH_TTL: "180d" });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).refresh).toBe("180d");
  });
});
