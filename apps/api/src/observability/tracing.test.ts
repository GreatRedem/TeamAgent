import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { metrics, trace, ProxyTracerProvider } from "@opentelemetry/api";
import { startTracing, shutdownTracing } from "./tracing.js";

/**
 * The tracing bootstrap (docs/22 span export) is wired behind
 * OTEL_EXPORTER_OTLP_ENDPOINT. These tests exercise the contract against a
 * local HTTP sink that accepts the OTLP POSTs, so bootstrap, idempotence,
 * and shutdown are hermetic — no collector dependency, and no
 * unreachable-endpoint races leaking ECONNREFUSED through shutdown flush.
 */
let sink: Server;
let sinkUrl: string;

beforeAll(async () => {
  sink = createServer((req, res) => {
    req.resume(); // drain the protobuf body
    res.statusCode = 200;
    res.end();
  });
  await new Promise<void>((resolve) => sink.listen(0, "127.0.0.1", resolve));
  const addr = sink.address();
  const port = typeof addr === "object" && addr !== null ? addr.port : 0;
  sinkUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await shutdownTracing();
  await new Promise<void>((resolve) => sink.close(() => resolve()));
});

describe("tracing bootstrap", () => {
  it("does nothing without an endpoint", async () => {
    expect(startTracing({ endpoint: undefined, serviceName: "t", sampleRatio: 1 })).toBe(false);
    expect(startTracing({ endpoint: "", serviceName: "t", sampleRatio: 1 })).toBe(false);
    // No SDK: the global tracer provider still delegates to the no-op.
    const provider = trace.getTracerProvider() as ProxyTracerProvider;
    expect(provider.getDelegate?.()?.constructor.name).toBe("NoopTracerProvider");
  });

  it("starts once with an endpoint and is idempotent", async () => {
    const config = {
      endpoint: sinkUrl,
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
      endpoint: sinkUrl,
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
      endpoint: sinkUrl,
      serviceName: "tracing-test",
      sampleRatio: 1,
    });
    expect(metrics.getMeterProvider()).toBe(before);
    await shutdownTracing();
  });
});
