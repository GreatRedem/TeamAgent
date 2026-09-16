import { describe, expect, it } from "vitest";
import { resolveDestination } from "./destinations.js";
import { isPublicAddress, vetEgressUrl, type DnsResolver } from "./ssrf.js";
import { validateToolArguments } from "./validation.js";

describe("tool argument validation (C7)", () => {
  const schema = {
    type: "object",
    properties: {
      url: { type: "string", maxLength: 2048 },
      mode: { type: "string", enum: ["get", "head"] },
      retries: { type: "integer", minimum: 0, maximum: 3 },
    },
    required: ["url"],
    additionalProperties: false,
  };

  it("accepts narrow, well-typed arguments", () => {
    expect(validateToolArguments(schema, { url: "https://example.com", mode: "get" })).toEqual({
      valid: true,
    });
  });

  it("rejects wrong types, missing required fields, and extra properties", () => {
    expect(validateToolArguments(schema, { url: 42 }).valid).toBe(false);
    expect(validateToolArguments(schema, { mode: "get" }).valid).toBe(false);
    const extra = validateToolArguments(schema, {
      url: "https://example.com",
      sql: "DROP TABLE x",
    });
    expect(extra.valid).toBe(false);
  });

  it("rejects enum violations, out-of-range integers, and non-objects", () => {
    expect(
      validateToolArguments(schema, { url: "https://example.com", mode: "delete" }).valid,
    ).toBe(false);
    expect(validateToolArguments(schema, { url: "https://example.com", retries: 99 }).valid).toBe(
      false,
    );
    expect(validateToolArguments(schema, "https://example.com").valid).toBe(false);
    expect(validateToolArguments(schema, null).valid).toBe(false);
  });
});

describe("destination resolution (C3)", () => {
  const policy = {
    allowedDestinations: ["ops@example.com", "alerts@example.com"],
    canInitiate: true,
  };

  it("allows a proposed destination present in the allowlist", () => {
    expect(resolveDestination({ proposed: "ops@example.com", ...policy })).toEqual({
      allowed: true,
    });
  });

  it("denies absent destinations and records the reason", () => {
    expect(resolveDestination({ proposed: "attacker@evil.com", ...policy })).toEqual({
      allowed: false,
      reason: "destination-not-allowlisted",
    });
  });

  it("denies case, whitespace, and near-match variants — no leniency", () => {
    for (const proposed of [
      "Ops@example.com",
      " ops@example.com",
      "ops@example.com ",
      "ops@example.com\n",
      "ops@example.co",
      "xops@example.com",
    ]) {
      expect(resolveDestination({ proposed, ...policy }).allowed).toBe(false);
    }
  });

  it("denies initiation elsewhere when can_initiate is false, allows the origin", () => {
    expect(
      resolveDestination({
        proposed: "ops@example.com",
        allowedDestinations: ["ops@example.com"],
        canInitiate: false,
      }).allowed,
    ).toBe(false);
    expect(
      resolveDestination({
        proposed: "origin-chat",
        allowedDestinations: [],
        canInitiate: false,
        origin: "origin-chat",
      }),
    ).toEqual({ allowed: true });
  });
});

describe("SSRF guard (C8)", () => {
  it("classifies public and non-public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2001:4860:4860::8888"]) {
      expect(isPublicAddress(ip)).toBe(true);
    }
    for (const ip of [
      "10.0.0.1",
      "172.16.0.1",
      "192.168.1.1",
      "127.0.0.1",
      "0.0.0.0",
      "169.254.169.254",
      "100.64.0.1",
      "224.0.0.1",
      "::1",
      "::",
      "fc00::1",
      "fe80::1",
      "ff02::1",
      "2001:db8::1",
      "::ffff:10.0.0.1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isPublicAddress(ip)).toBe(false);
    }
  });

  const publicOnly: DnsResolver = async (host) => {
    if (host === "example.com") return ["93.184.216.34"];
    if (host === "mixed.example.com") return ["93.184.216.34", "10.0.0.1"];
    if (host === "private.example.com") return ["10.9.9.9"];
    throw new Error("NXDOMAIN");
  };

  it("allows vetted public URLs and returns the pinned addresses", async () => {
    const vetted = await vetEgressUrl("https://example.com/path?q=1", publicOnly);
    expect(vetted.pinnedIps).toEqual(["93.184.216.34"]);
  });

  it("denies schemes, credentials, local names, literals, and DNS tricks", async () => {
    await expect(vetEgressUrl("ftp://example.com/x", publicOnly)).rejects.toThrow(/SSRF_DENIED/);
    await expect(vetEgressUrl("https://user:pass@example.com/", publicOnly)).rejects.toThrow(
      /SSRF_DENIED/,
    );
    await expect(vetEgressUrl("http://localhost:3000/", publicOnly)).rejects.toThrow(/SSRF_DENIED/);
    await expect(vetEgressUrl("http://singlelabel/", publicOnly)).rejects.toThrow(/SSRF_DENIED/);
    await expect(vetEgressUrl("http://db.internal/", publicOnly)).rejects.toThrow(/SSRF_DENIED/);
    await expect(vetEgressUrl("http://127.0.0.1/", publicOnly)).rejects.toThrow(/SSRF_DENIED/);
    await expect(vetEgressUrl("http://[::1]/", publicOnly)).rejects.toThrow(/SSRF_DENIED/);
    await expect(vetEgressUrl("https://private.example.com/", publicOnly)).rejects.toThrow(
      /SSRF_DENIED/,
    );
    await expect(vetEgressUrl("https://mixed.example.com/", publicOnly)).rejects.toThrow(
      /SSRF_DENIED/,
    );
    await expect(vetEgressUrl("https://missing.example.com/", publicOnly)).rejects.toThrow(
      /SSRF_DENIED/,
    );
  });
});
