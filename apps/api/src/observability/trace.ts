import { randomBytes } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Trace context for one logical operation (docs/22-observability.md): the
 * `trace_id` that ties the request that caused work to every span that did
 * it, including across the queue boundary, plus the `request_id` and
 * `span_id` scoped to it.
 *
 * HTTP requests establish the context in a hook (http.ts). Background work —
 * where the boundary break actually happens — restores it from the job row,
 * so a handler and everything it awaits stays inside the enqueuer's trace.
 * Anything that runs outside a restored context mints a fresh trace root.
 */

export function newTraceId(): string {
  return `trace_${randomBytes(8).toString("hex")}`;
}

export function newSpanId(): string {
  return `span_${randomBytes(8).toString("hex")}`;
}

export interface TraceContext {
  traceId: string;
  /** Scoped to one hop: one HTTP request, or one job execution. */
  spanId: string;
  /** The HTTP request id, when the trace started at the API edge. */
  requestId?: string;
}

const storage = new AsyncLocalStorage<TraceContext>();

/** Run `fn` inside `context`; nested runs inherit unless replaced. */
export function runWithTrace<T>(context: TraceContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * Adopt `context` for the rest of the current async chain. This is the form
 * that works inside Fastify's onRequest hook: the lifecycle resumes from the
 * hook's continuation, which carries the adopted store into handlers, error
 * handlers, and response serialization.
 */
export function enterTrace(context: TraceContext): void {
  storage.enterWith(context);
}

/** The ambient context, or a fresh root when there is none. */
export function currentTrace(): TraceContext {
  return (
    storage.getStore() ?? {
      traceId: newTraceId(),
      spanId: newSpanId(),
    }
  );
}

/**
 * The enqueuer's side of the queue boundary (docs/22): snapshot the ambient
 * context onto the job so the worker can restore it.
 */
export function traceForQueue(): Pick<TraceContext, "traceId" | "requestId"> {
  const current = currentTrace();
  return { traceId: current.traceId, requestId: current.requestId };
}

/**
 * The worker's side: run a whole job execution inside the trace the
 * enqueuer wrote on the job row. A job with no stored trace still gets a
 * valid context — propagation degrades to a fresh root, never to none.
 */
export function runWithJobTrace<T>(
  job: { traceId?: string | null },
  fn: () => Promise<T>,
): Promise<T> {
  const traceId = job.traceId ?? newTraceId();
  return storage.run({ traceId, spanId: newSpanId(), requestId: undefined }, fn);
}
