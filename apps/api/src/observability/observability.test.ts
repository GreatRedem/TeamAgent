import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../db/harness.js";
import { jobs, teams, users } from "../db/schema/index.js";
import { seedPermissions } from "../db/seed.js";
import {
  gaugeValue,
  incrementMetric,
  metricValue,
  observeHistogram,
  renderMetrics,
  resetMetrics,
  setGauge,
} from "./metrics.js";
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
    expect(() => setGauge("not_a_gauge", {}, 1)).toThrow(/unknown metric/);
    expect(() => observeHistogram("not_a_histogram", {}, 1)).toThrow(/unknown metric/);
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

describe("service-health and queue signals", () => {
  it("renders RED counters, gauges, and histograms", () => {
    incrementMetric("http_requests_total", {
      method: "POST",
      route: "/teams",
      status_class: "2xx",
    });
    incrementMetric("http_requests_total", {
      method: "POST",
      route: "/teams",
      status_class: "2xx",
    });
    incrementMetric("http_requests_total", {
      method: "GET",
      route: "unmatched",
      status_class: "4xx",
    });
    observeHistogram("http_request_duration_ms", { route: "/teams" }, 42);
    setGauge("queue_depth", { queue: "workflow_trigger", status: "queued" }, 3);

    const text = renderMetrics();
    expect(text).toContain(
      'http_requests_total{method="POST",route="/teams",status_class="2xx"} 2',
    );
    expect(text).toContain(
      'http_requests_total{method="GET",route="unmatched",status_class="4xx"} 1',
    );
    // Histogram exposition: cumulative buckets plus sum and count.
    expect(text).toContain('http_request_duration_ms_bucket{route="/teams",le="50"} 1');
    expect(text).toContain('http_request_duration_ms_count{route="/teams"} 1');
    expect(text).toContain('queue_depth{queue="workflow_trigger",status="queued"} 3');
    expect(gaugeValue("queue_depth", { queue: "workflow_trigger", status: "queued" })).toBe(3);
  });

  it("classifies statuses and templated routes at the edge", async () => {
    const { routeLabel, statusClass } = await import("./http.js");
    expect(statusClass(200)).toBe("2xx");
    expect(statusClass(429)).toBe("4xx");
    expect(statusClass(503)).toBe("5xx");
    expect(routeLabel({ url: "/x", routeOptions: { url: "/teams/:teamId/agents" } })).toBe(
      "/teams/:teamId/agents",
    );
    // No matched route: one bounded bucket, never the concrete URL.
    expect(routeLabel({ url: "/probe/8f2c1f90" })).toBe("unmatched");
  });

  it("collects queue depth from the jobs table at scrape time", async () => {
    const { collectQueueMetrics } = await import("./queue.js");
    const { enqueueJob } = await import("../modules/jobs/queue.js");

    await enqueueJob(t.db, { queue: "collect_test", payload: {} });
    await enqueueJob(t.db, { queue: "collect_test", payload: {} });
    await t.db.insert(jobs).values({
      id: randomUUID(),
      queue: "collect_test",
      payload: {},
      status: "dead",
    });

    await collectQueueMetrics(t.db);
    expect(gaugeValue("queue_depth", { queue: "collect_test", status: "queued" })).toBe(2);
    expect(gaugeValue("queue_depth", { queue: "collect_test", status: "dead" })).toBe(1);
    expect(gaugeValue("jobs_table_rows")).toBeGreaterThanOrEqual(3);
  });

  it("counts worker retries, dead letters, and durations", async () => {
    const { enqueueJob } = await import("../modules/jobs/queue.js");
    const { processOne } = await import("../modules/jobs/worker.js");
    const base = {
      database: t.db,
      workerId: "metrics-worker",
      pollIntervalMs: 10,
      leaseMs: 5000,
    };

    // Retry path: max_attempts=2, first failure returns the job to queued.
    await enqueueJob(t.db, {
      queue: "metrics_retry",
      payload: {},
      maxAttempts: 2,
      runAt: new Date(Date.now() - 1000),
    });
    await expect(
      processOne({
        ...base,
        handlers: {
          metrics_retry: async () => {
            throw new Error("boom");
          },
        },
      }),
    ).resolves.toBe("failed");
    expect(metricValue("job_retries_total", { queue: "metrics_retry" })).toBe(1);

    // Dead path: max_attempts=1, exhaustion is terminal.
    await enqueueJob(t.db, {
      queue: "metrics_dead",
      payload: {},
      maxAttempts: 1,
      runAt: new Date(Date.now() - 1000),
    });
    await expect(
      processOne({
        ...base,
        handlers: {
          metrics_dead: async () => {
            throw new Error("gone");
          },
        },
      }),
    ).resolves.toBe("failed");
    expect(metricValue("jobs_total", { queue: "metrics_dead", status: "dead" })).toBe(1);
    expect(metricValue("jobs_dead_total", { queue: "metrics_dead" })).toBe(1);

    // Duration was observed on every attempt, success or failure.
    observeHistogram("job_duration_seconds", { queue: "metrics_retry" }, 0.001);
    const text = renderMetrics();
    expect(text).toContain('job_duration_seconds_count{queue="metrics_retry"} 2');
  });

  it("counts model calls, tokens, and budget terminations from a run", async () => {
    // Integration through the real run path: a scripted provider that always
    // requests a tool drives the loop into the tool-call budget.
    const { buildTestApp, signInFresh, authHeader } =
      (await import("../modules/test-app.js")) as typeof import("../modules/test-app.js");
    const { ScriptedProvider, toolResult } = await import("../runtime/model/gateway.js");
    const { models, permissions, tools } = await import("../db/schema/index.js");

    // The scripted tool call must carry the granted tool's id — an unknown
    // id is the runtime's unknown-tool path, which never counts as a call.
    const toolId = randomUUID();
    const script = [
      toolResult(
        toolId,
        "http.fetch",
        { url: "https://example.com/" },
        { inputTokens: 40, outputTokens: 40 },
      ),
    ];
    const provider = new ScriptedProvider(script);
    const app = await buildTestApp({
      modelProvider: provider,
      // The tool must actually execute: denied calls do not count against
      // the tool-call budget, and the test needs the allowed-call path.
      toolHandlerDeps: {
        httpGet: async () => ({ status: 200, headers: {}, body: "ok", truncated: false }),
        resolveDns: async () => ["93.184.216.34"],
      },
    });
    try {
      const owner = await signInFresh(app.app);
      const created = await app.app.inject({
        method: "POST",
        url: "/teams",
        headers: authHeader(owner.accessToken),
        payload: { name: "Model Metrics Team" },
      });
      const tid = (created.json() as { data: { id: string } }).data.id;

      const modelId = randomUUID();
      await app.t.db
        .insert(models)
        .values({ id: modelId, provider: "openai", name: "mini", version: "1" });
      await app.t.db.insert(tools).values({
        id: toolId,
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

      const agent = await app.app.inject({
        method: "POST",
        url: `/teams/${tid}/agents`,
        headers: authHeader(owner.accessToken),
        payload: { name: "Metrics Runner", model_id: modelId },
      });
      const agentId = (agent.json() as { data: { id: string } }).data.id;
      // Budgets are set on the update path (same as the runs suite).
      const budgeted = await app.app.inject({
        method: "PATCH",
        url: `/teams/${tid}/agents/${agentId}`,
        headers: authHeader(owner.accessToken),
        payload: { budgets: { max_tool_calls: 1 } },
      });
      expect(budgeted.statusCode).toBe(200);

      const permRows = await app.t.db.select().from(permissions);
      const wanted = permRows.filter((p) => p.name === "tool.execute" || p.name === "browser.read");
      expect(wanted.length).toBe(2);
      const granted = await app.app.inject({
        method: "PUT",
        url: `/teams/${tid}/agents/${agentId}/permissions`,
        headers: authHeader(owner.accessToken),
        payload: { permission_ids: wanted.map((p) => p.id) },
      });
      expect(granted.statusCode).toBe(200);
      const toolsGranted = await app.app.inject({
        method: "PUT",
        url: `/teams/${tid}/agents/${agentId}/tools`,
        headers: authHeader(owner.accessToken),
        payload: { tool_ids: [toolId] },
      });
      expect(toolsGranted.statusCode).toBe(200);

      const run = await app.app.inject({
        method: "POST",
        url: `/teams/${tid}/agents/${agentId}/run`,
        headers: authHeader(owner.accessToken),
        payload: { messages: [{ role: "user", content: "loop" }] },
      });
      expect(run.statusCode).toBe(200);
      expect((run.json() as { data: { status: string } }).data.status).toBe("budget_exceeded");

      // One successful model iteration before the budget fired.
      expect(
        metricValue("model_calls_total", { provider: "openai", model: "mini", status: "ok" }),
      ).toBe(1);
      expect(
        metricValue("tokens_consumed_total", {
          provider: "openai",
          model: "mini",
          direction: "input",
        }),
      ).toBe(40);
      expect(
        metricValue("tokens_consumed_total", {
          provider: "openai",
          model: "mini",
          direction: "output",
        }),
      ).toBe(40);
      expect(metricValue("agent_runs_total", { status: "budget_exceeded" })).toBe(1);
      // C10 termination, labeled by the limit that fired.
      expect(metricValue("run_budget_exceeded_total", { limit_type: "tool-calls-exceeded" })).toBe(
        1,
      );
      // The per-call latency histogram has the provider series.
      const text = renderMetrics();
      expect(text).toContain('model_call_duration_seconds_count{provider="openai"} 1');
    } finally {
      await app.t.close();
    }
  }, 60000);
});
