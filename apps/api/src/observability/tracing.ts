import { NodeSDK } from "@opentelemetry/sdk-node";
import { tracing } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

/**
 * Trace export to a collector via OTLP/HTTP (docs/19: OpenTelemetry is the
 * observability stack; docs/22: span export to a backend was the one
 * tracing deliverable not yet wired).
 *
 * Entirely optional: no OTEL_EXPORTER_OTLP_ENDPOINT, no SDK, no spans, no
 * added startup cost — the trace_id fields in logs and database rows are
 * the substrate the product already guarantees, and the collector is a
 * presentation layer on top of them.
 *
 * Sampling follows docs/22: sample healthy traffic at TRACE_SAMPLE_RATIO
 * (ParentBased, so a sampled upstream keeps its children), while errors,
 * denials, and approvals stay on the roadmap's tail-sampling recommendation
 * — with a probabilistic root sampler those are caught by the backend's
 * tail policy keyed on the attributes below, not by raising the ratio.
 */
let sdk: NodeSDK | null = null;

export function startTracing(input: {
  endpoint: string | undefined;
  serviceName: string;
  sampleRatio: number;
}): boolean {
  if (input.endpoint === undefined || input.endpoint === "") {
    return false;
  }
  if (sdk !== null) return true;

  sdk = new NodeSDK({
    serviceName: input.serviceName,
    traceExporter: new OTLPTraceExporter({ url: joinOtlpSpans(input.endpoint) }),
    sampler: new tracing.ParentBasedSampler({
      root: new tracing.TraceIdRatioBasedSampler(input.sampleRatio),
    }),
  });
  sdk.start();
  return true;
}

/**
 * OTLP/HTTP expects the full signals path. Collectors accept both the bare
 * endpoint (legacy) and the path-suffixed form; normalize to the path so
 * either operator habit works. A trailing slash is trimmed first.
 */
function joinOtlpSpans(endpoint: string): string {
  const base = endpoint.replace(/\/+$/, "");
  return base.endsWith("/v1/traces") ? base : `${base}/v1/traces`;
}

/** Flush and shut down the exporter. Safe to call when tracing never started. */
export async function shutdownTracing(): Promise<void> {
  if (sdk === null) return;
  const current = sdk;
  sdk = null;
  await current.shutdown();
}
