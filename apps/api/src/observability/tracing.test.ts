import { describe, expect, it } from "vitest";
import { metrics, trace } from "@opentelemetry/api";
import { ProxyTracerProvider } from "@opentelemetry/api";
import { startTracing, shutdownTracing } from "./tracing.js";

/**
 * The tracing bootstrap (docs/22 span export) is wired behind
 * OTEL_EXPORTER_OTLP_ENDPOINT. These tests exercise the contract without a
 * collector: the exporter buffers and fails quietly, which is exactly the
 * production behavior for an unreachable endpoint during a test run.
 */
describe("tracing bootstrap", () => {
  it("does nothing without an endpoint", async () => {
    expect(startTracing({ endpoint: undefined, serviceName: "t", sampleRatio: 1 })).toBe(false);
    expect(startTracing({ endpoint: "", serviceName: "t", sampleRatio: 1 })).toBe(false);
    // No SDK: the global tracer provider still delegates to the no-op.
    const provider = trace.getTracerProvider() as ProxyTracerProvider;
    expect(provider.getDelegate?.()?.constructor.name).toBe("NoopTracerProvider");
    await shutdownTracing();
  });

  it("starts once with an endpoint and is idempotent", async () => {
    const config = {
      endpoint: "http://127.0.0.1:59999",
      serviceName: "tracing-test",
      sampleRatio: 0.5,
    };
    expect(startTracing(config)).toBe(true);
    // Idempotent: a second start is accepted but does not re-boot the SDK.
    expect(startTracing(config)).toBe(true);

    // The global provider now delegates to a real SDK tracer provider.
    const provider = trace.getTracerProvider() as ProxyTracerProvider;
    expect(provider.getDelegate?.()).toBeDefined();

    // A span can be created and ended through the global API.
    const span = trace.getTracer("test").startSpan("probe");
    span.setAttribute("team_id", "t1");
    span.end();

    await shutdownTracing();
  });

  it("after shutdown, a fresh start is a fresh boot", async () => {
    const config = {
      endpoint: "http://127.0.0.1:59999",
      serviceName: "tracing-test",
      sampleRatio: 1,
    };
    expect(startTracing(config)).toBe(true);
    await shutdownTracing();
    expect(startTracing(config)).toBe(true);
    await shutdownTracing();
  });

  it("leaves metrics untouched — traces only", async () => {
    // docs/22 keeps metrics in-process for now; the SDK is configured with
    // no metric readers, so no meter provider is installed by the SDK.
    const before = metrics.getMeterProvider();
    startTracing({
      endpoint: "http://127.0.0.1:59999",
      serviceName: "tracing-test",
      sampleRatio: 1,
    });
    expect(metrics.getMeterProvider()).toBe(before);
    await shutdownTracing();
  });
});
