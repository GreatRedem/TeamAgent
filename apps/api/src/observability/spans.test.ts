import { afterAll, describe, expect, it } from "vitest";
import { SpanStatusCode } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { withSpan } from "./spans.js";
import { runWithTrace, currentTrace } from "./trace.js";

/**
 * Span wiring (docs/22 Tracing) verified against a real SDK pipeline with
 * an in-memory exporter: names, docs/22 attributes, nesting, error status,
 * and the trace_id correlation attribute.
 */
const exporter = new InMemorySpanExporter();
const sdk = new NodeSDK({
  serviceName: "spans-test",
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
sdk.start();

afterAll(async () => {
  await sdk.shutdown();
});

/** onEnd lands asynchronously — poll until the expected spans have arrived. */
async function flushSpans(minimum: number): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (exporter.getFinishedSpans().length < minimum && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Let stragglers from a previous test land, then start from a clean buffer. */
async function resetExporter(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
  exporter.reset();
}

describe("withSpan", () => {
  it("records the span with attributes and OK status", async () => {
    await resetExporter();
    const result = await withSpan(
      "model.call",
      { provider: "openai", model: "mini" },
      async () => 42,
    );
    expect(result).toBe(42);
    await flushSpans(1);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    const span = spans[0]!;
    expect(span.name).toBe("model.call");
    expect(span.attributes["provider"]).toBe("openai");
    expect(span.attributes["model"]).toBe("mini");
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });

  it("carries the ambient trace_id as an attribute", async () => {
    await resetExporter();
    await runWithTrace({ traceId: "trace_spancheck", spanId: "span_s" }, async () => {
      await withSpan("agent.run", {}, async () => null);
    });
    await flushSpans(1);
    const span = exporter.getFinishedSpans()[0]!;
    expect(span.attributes["trace_id"]).toBe("trace_spancheck");
  });

  it("nests child spans under the parent", async () => {
    await resetExporter();
    await withSpan("agent.run", {}, async () => {
      await withSpan("model.call", { provider: "openai" }, async () => null);
      await withSpan("tool.execute", { tool: "http.fetch" }, async () => null);
    });
    await flushSpans(3);

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(3);
    const parent = spans.find((s) => s.name === "agent.run")!;
    const child = spans.find((s) => s.name === "model.call")!;
    expect(child.parentSpanContext?.traceId).toBe(parent.spanContext().traceId);
    expect(child.parentSpanContext?.spanId).toBe(parent.spanContext().spanId);
  });

  it("marks errors on the span and rethrows", async () => {
    await resetExporter();
    await expect(
      withSpan("tool.execute", { tool: "boom" }, async () => {
        throw new Error("handler exploded");
      }),
    ).rejects.toThrow("handler exploded");
    await flushSpans(1);

    const span = exporter.getFinishedSpans()[0]!;
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.status.message).toBe("handler exploded");
    expect(span.events.some((e) => e.name === "exception")).toBe(true);
  });

  it("records the queue-boundary trace_id on worker job spans", async () => {
    // The enqueuer's context restored around the handler — the span the
    // docs/22 queue-boundary test asks for, now at the span level.
    await resetExporter();
    let observed: string | null = null;
    await runWithTrace({ traceId: "trace_enq_span", spanId: "span_q" }, async () => {
      const enqueued = currentTrace().traceId;
      await runWithTrace({ traceId: "trace_worker_restored", spanId: "span_r" }, async () => {
        await withSpan("worker.job", { queue: "trace_test" }, async () => {
          observed = currentTrace().traceId;
        });
      });
      expect(observed).toBe("trace_worker_restored");
      void enqueued;
    });
    await flushSpans(1);
    const span = exporter.getFinishedSpans()[0]!;
    expect(span.name).toBe("worker.job");
    expect(span.attributes["trace_id"]).toBe("trace_worker_restored");
  });
});
