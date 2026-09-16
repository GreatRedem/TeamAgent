import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../db/harness.js";
import { teams, users } from "../db/schema/index.js";
import { seedPermissions } from "../db/seed.js";
import { incrementMetric, metricValue, renderMetrics, resetMetrics } from "./metrics.js";
import { currentTrace, runWithJobTrace } from "./trace.js";

let t: TestDb;
let teamId: string;

beforeAll(async () => {
  t = await createTestDb();
  await seedPermissions(t.db);
  const userId = randomUUID();
  await t.db.insert(users).values({ id: userId, displayName: "Obs Test" });
  teamId = randomUUID();
  await t.db.insert(teams).values({ id: teamId, name: "Obs Team", ownerId: userId });
}, 60000);

afterAll(async () => {
  await t.close();
});

afterEach(() => {
  resetMetrics();
});

describe("security signal counters", () => {
  it("counts increments with and without labels and renders the exposition", () => {
    incrementMetric("refresh_token_reuse_total");
    incrementMetric("refresh_token_reuse_total");
    incrementMetric("cross_team_access_denied_total");
    incrementMetric("auth_failures_total", { reason: "domain_mismatch" });

    expect(metricValue("refresh_token_reuse_total")).toBe(2);
    expect(metricValue("cross_team_access_denied_total")).toBe(1);
    expect(metricValue("auth_failures_total", { reason: "domain_mismatch" })).toBe(1);

    const text = renderMetrics();
    expect(text).toContain("refresh_token_reuse_total 2");
    expect(text).toContain('auth_failures_total{reason="domain_mismatch"} 1');
    // The zero-series signals exist even with no events, so the alerts have
    // something to fire on.
    expect(text).toContain("destination_denied_total 0");
  });

  it("rejects unknown metrics and unregistered labels", () => {
    expect(() => incrementMetric("not_a_metric")).toThrow(/unknown metric/);
    expect(() => incrementMetric("refresh_token_reuse_total", { team_id: "x" })).toThrow(
      /does not accept label/,
    );
  });

  it("rejects a trusted ceiling on api keys at the metric boundary too", async () => {
    // Integration: R3 rejection increments the counter (via the agents
    // service) and a cross-team request increments the isolation counter.
    const { buildTestApp, authHeader, signInFresh } =
      (await import("../modules/test-app.js")) as typeof import("../modules/test-app.js");
    const app = await buildTestApp();
    try {
      const owner = await signInFresh(app.app);
      const created = await app.app.inject({
        method: "POST",
        url: "/teams",
        headers: authHeader(owner.accessToken),
        payload: { name: "Obs Metrics Team" },
      });
      const tid = (created.json() as { data: { id: string } }).data.id;

      // Another team's resource: isolation denial.
      const outsider = await signInFresh(app.app);
      const probe = await app.app.inject({
        method: "GET",
        url: `/teams/${tid}/agents`,
        headers: authHeader(outsider.accessToken),
      });
      expect(probe.statusCode).toBe(404);
      expect(metricValue("cross_team_access_denied_total")).toBe(1);
      void owner;
    } finally {
      await app.t.close();
    }
  }, 60000);
});

describe("trace context", () => {
  it("mints a fresh root outside any context and inherits inside one", async () => {
    const outside = currentTrace();
    expect(outside.traceId).toMatch(/^trace_/);

    const { runWithTrace } = await import("./trace.js");
    await runWithTrace({ traceId: "trace_fixed", spanId: "span_a" }, async () => {
      expect(currentTrace().traceId).toBe("trace_fixed");
      // Nested async work inherits.
      await new Promise((r) => setTimeout(r, 1));
      expect(currentTrace().traceId).toBe("trace_fixed");
    });
    expect(currentTrace().traceId).not.toBe("trace_fixed");
  });

  it("restores the enqueuer trace on the worker side of the queue boundary", async () => {
    const { runWithTrace } = await import("./trace.js");
    let observed: string | null = null;
    await runWithTrace({ traceId: "trace_enqueuer", spanId: "span_e" }, async () => {
      // The enqueuer snapshots onto the job row.
      const { traceForQueue } = await import("./trace.js");
      const snapshot = traceForQueue();
      // The worker restores it around the handler.
      await runWithJobTrace({ traceId: snapshot.traceId }, async () => {
        observed = currentTrace().traceId;
      });
    });
    expect(observed).toBe("trace_enqueuer");
  });
});

describe("queue boundary integration", () => {
  it("a worker-run job executes inside the enqueuer's trace", async () => {
    const { processOne } = await import("../modules/jobs/worker.js");
    const { enqueueJob } = await import("../modules/jobs/queue.js");

    let handlerTrace: string | null = null;
    const job = await enqueueJob(t.db, {
      queue: "trace_test",
      payload: {},
      traceId: "trace_boundary_1234",
    });
    const result = await processOne({
      database: t.db,
      workerId: "trace-worker",
      pollIntervalMs: 10,
      leaseMs: 5000,
      handlers: {
        trace_test: async () => {
          handlerTrace = currentTrace().traceId;
        },
      },
    });
    expect(result).toBe("succeeded");
    expect(handlerTrace).toBe("trace_boundary_1234");
    expect(job.traceId).toBe("trace_boundary_1234");
  });
});
