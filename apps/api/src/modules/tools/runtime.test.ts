import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { teams, toolCalls, tools, users } from "../../db/schema/index.js";
import { buildTestApp, type TestApp } from "../test-app.js";
import { executeToolCall } from "./runtime.js";
import type { HttpGet } from "./registry.js";

let t: TestApp;
let readToolId: string;
let writeToolId: string;
let teamId: string;

const GRANTED = ["tool.execute", "browser.read"];

const fakeGet: HttpGet = async () => ({
  status: 200,
  headers: {},
  body: "hello",
  truncated: false,
});
const publicDns = async (host: string): Promise<string[]> => {
  if (host === "example.com") return ["93.184.216.34"];
  throw new Error("NXDOMAIN");
};

beforeAll(async () => {
  t = await buildTestApp();
  const ownerId = randomUUID();
  await t.t.db.insert(users).values({ id: ownerId });
  teamId = randomUUID();
  await t.t.db.insert(teams).values({ id: teamId, name: "runtime-team", ownerId });
  readToolId = randomUUID();
  writeToolId = randomUUID();
  await t.t.db.insert(tools).values({
    id: readToolId,
    teamId: null,
    name: "http.fetch",
    riskTier: "read_only",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string", maxLength: 2048 } },
      required: ["url"],
      additionalProperties: false,
    },
  });
  // A team-level override at write tier: same handler, stricter matrix row.
  // (R2 forbids a second system row with the same name — correctly so.)
  await t.t.db.insert(tools).values({
    id: writeToolId,
    teamId,
    name: "http.fetch",
    riskTier: "write",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string", maxLength: 2048 } },
      required: ["url"],
      additionalProperties: false,
    },
  });
}, 60000);

afterAll(async () => {
  await t.t.close();
});

async function toolCallRow(id: string): Promise<Record<string, unknown> | undefined> {
  const rows = await t.t.db.select().from(toolCalls).where(eq(toolCalls.id, id));
  const row = rows[0];
  return row as Record<string, unknown> | undefined;
}

describe("tool runtime and policy decision point", () => {
  it("writes the tool_calls row before execution and updates it after", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = executeToolCall(t.t.db, {
      teamId,
      actor: { type: "user", id: "u1" },
      toolId: readToolId,
      args: { url: "https://example.com/" },
      contextTrust: "trusted",
      callerPermissions: GRANTED,
      handlerDeps: {
        httpGet: async () => {
          await gate;
          return { status: 200, headers: {}, body: "done", truncated: false };
        },
        resolveDns: publicDns,
      },
    });

    let before: Record<string, unknown> | undefined;
    for (let i = 0; i < 100 && before === undefined; i += 1) {
      await new Promise((r) => setTimeout(r, 10));
      const ids = await t.t.db.select({ id: toolCalls.id }).from(toolCalls);
      const last = ids[ids.length - 1];
      if (last !== undefined) before = await toolCallRow(last.id);
    }
    expect(before?.["decision"]).toBe("allowed");
    expect(before?.["completedAt"] ?? before?.["completed_at"]).toBeFalsy();
    release();
    const outcome = await pending;
    expect(outcome.decision).toBe("allowed");
    if (outcome.decision !== "allowed") throw new Error("unreachable");
    const after = await toolCallRow(outcome.toolCallId);
    expect(after?.["completedAt"] ?? after?.["completed_at"]).toBeTruthy();
    expect(after?.["decision"]).toBe("allowed");
    expect(outcome.outputTrust).toBe("untrusted");
  });

  it("routes untrusted write-tier calls to approval without executing", async () => {
    let called = false;
    const outcome = await executeToolCall(t.t.db, {
      teamId,
      actor: { type: "user", id: "u1" },
      toolId: writeToolId,
      args: { url: "https://example.com/" },
      contextTrust: "untrusted",
      callerPermissions: GRANTED,
      handlerDeps: {
        httpGet: async () => {
          called = true;
          return { status: 200, headers: {}, body: "x", truncated: false };
        },
        resolveDns: publicDns,
      },
    });
    expect(outcome.decision).toBe("approval_required");
    expect(called).toBe(false);
    if (outcome.decision !== "approval_required") throw new Error("unreachable");
    const row = await toolCallRow(outcome.toolCallId);
    expect(row?.["decision"]).toBe("approval_required");
  });

  it("denies missing grants and invalid arguments without executing", async () => {
    let called = false;
    const spyingGet: HttpGet = async () => {
      called = true;
      return fakeGet({
        url: new URL("https://example.com/"),
        pinnedIp: "93.184.216.34",
        timeoutMs: 1,
        maxBytes: 1,
        signal: AbortSignal.timeout(1),
      });
    };
    const denied = await executeToolCall(t.t.db, {
      teamId,
      actor: { type: "user", id: "u1" },
      toolId: readToolId,
      args: { url: "https://example.com/" },
      contextTrust: "trusted",
      callerPermissions: [],
      handlerDeps: { httpGet: spyingGet, resolveDns: publicDns },
    });
    expect(denied.decision).toBe("denied");
    expect(called).toBe(false);

    const invalid = await executeToolCall(t.t.db, {
      teamId,
      actor: { type: "user", id: "u1" },
      toolId: readToolId,
      args: { url: "https://example.com/", injected: true },
      contextTrust: "trusted",
      callerPermissions: GRANTED,
      handlerDeps: { httpGet: spyingGet, resolveDns: publicDns },
    });
    expect(invalid.decision).toBe("denied");
    if (invalid.decision !== "denied") throw new Error("unreachable");
    expect(invalid.reason).toBe("invalid-arguments");
    expect(called).toBe(false);
  });

  it("enforces the destination allowlist on the agent path", async () => {
    const policy = { allowedDestinations: ["ops@example.com"], canInitiate: true };
    const denied = await executeToolCall(t.t.db, {
      teamId,
      actor: { type: "user", id: "u1" },
      toolId: writeToolId,
      args: { url: "https://example.com/" },
      contextTrust: "trusted",
      callerPermissions: GRANTED,
      destinationPolicy: policy,
      proposedDestination: "attacker@evil.com",
      handlerDeps: { httpGet: fakeGet, resolveDns: publicDns },
    });
    expect(denied.decision).toBe("denied");

    const allowed = await executeToolCall(t.t.db, {
      teamId,
      actor: { type: "user", id: "u1" },
      toolId: writeToolId,
      args: { url: "https://example.com/" },
      contextTrust: "trusted",
      callerPermissions: GRANTED,
      destinationPolicy: policy,
      proposedDestination: "ops@example.com",
      handlerDeps: { httpGet: fakeGet, resolveDns: publicDns },
    });
    expect(allowed.decision).toBe("allowed");
  });

  it("denies SSRF targets at the runtime boundary with no network touched", async () => {
    const outcome = await executeToolCall(t.t.db, {
      teamId,
      actor: { type: "user", id: "u1" },
      toolId: readToolId,
      args: { url: "http://169.254.169.254/latest/meta-data/" },
      contextTrust: "trusted",
      callerPermissions: GRANTED,
    });
    expect(outcome.decision).toBe("denied");
    if (outcome.decision !== "denied") throw new Error("unreachable");
    expect(outcome.reason).toBe("ssrf-denied");
  });
});
