import { SpanStatusCode, trace, type Attributes, type Span } from "@opentelemetry/api";
import { currentTrace } from "./trace.js";

/**
 * Span creation for the boundaries docs/22-observability.md names: model
 * call, knowledge retrieval, policy decision + tool execution, agent run,
 * worker job. Attributes carry the high-cardinality dimensions — team_id,
 * trust_level, decision, provider, model — that must never become metric
 * labels.
 *
 * Built on the global API: when no SDK is configured (no
 * OTEL_EXPORTER_OTLP_ENDPOINT) the tracer is the no-op, so every call site
 * is unconditional and costs a closed non-recording span. When the SDK is
 * up, spans join the exported trace.
 *
 * Every span carries `trace_id` — the correlation id on agent_runs,
 * tool_calls, and audit_logs — so a span search lands next to the
 * transactional record of the same operation. Nesting works through the
 * SDK's context; `startActiveSpan` makes children inherit automatically.
 */

const tracer = trace.getTracer("nuraai");

/** Ambient correlation: our trace_id and request_id, when a context exists. */
function correlationAttributes(): Attributes {
  const current = currentTrace();
  const attrs: Attributes = { trace_id: current.traceId };
  if (current.requestId !== undefined) {
    attrs.request_id = current.requestId;
  }
  return attrs;
}

/**
 * Run `fn` inside a span named `name`. Errors are recorded on the span and
 * rethrown — the span marks the failure, the caller keeps its control flow.
 */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(
    name,
    { attributes: { ...correlationAttributes(), ...attributes } },
    async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        if (error instanceof Error) {
          span.recordException(error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        } else {
          span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
        }
        throw error;
      } finally {
        span.end();
      }
    },
  );
}
