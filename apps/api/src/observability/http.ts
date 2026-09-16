import type { FastifyInstance } from "fastify";
import type { Principal } from "../modules/auth/principal.js";
import { incrementMetric, observeHistogram, renderMetrics } from "./metrics.js";
import { enterTrace, newSpanId, newTraceId, type TraceContext } from "./trace.js";

/**
 * The RED route label: Fastify's `request.routeOptions.url` is the templated
 * path (`/teams/:teamId/agents/:agentId`), never the concrete one — concrete
 * ids on a metrics label is the cardinality accident docs/22 forbids.
 * Falls back to a class only when no route matched (404s, /metrics itself).
 */
function routeLabel(request: { url?: string; routeOptions?: { url?: string } }): string {
  const route = request.routeOptions?.url;
  if (typeof route === "string" && route.length > 0) return route;
  // No matched route (404s, malformed paths): one bounded bucket, never the
  // concrete URL — a scanner probing random paths would otherwise mint a
  // series per probe.
  return "unmatched";
}

function statusClass(statusCode: number): string {
  return `${Math.floor(statusCode / 100)}xx`;
}

declare module "fastify" {
  interface FastifyRequest {
    traceContext: TraceContext;
  }
}

/**
 * The observability edge (docs/22-observability.md): every HTTP request gets
 * a trace context that the rest of the lifecycle — handlers, the error
 * handler, the response envelope — inherits through AsyncLocalStorage, and
 * every response logs the structured fields the incident runbook filters on.
 *
 * `enterTrace` in onRequest is deliberate: the request lifecycle resumes
 * from this hook's continuation, so the store propagates into everything
 * Fastify does afterwards for this request.
 */
export async function observabilityPlugin(
  app: FastifyInstance,
  options: {
    /** Scrape-time collectors, e.g. the queue depth reader. */ collectors?: Array<
      () => Promise<void>
    >;
  } = {},
): Promise<void> {
  app.addHook("onRequest", async (request) => {
    const context: TraceContext = {
      traceId: newTraceId(),
      spanId: newSpanId(),
      requestId: request.id,
    };
    request.traceContext = context;
    enterTrace(context);
  });

  app.addHook("onResponse", async (request, reply) => {
    // Unauthenticated routes have no principal; the runtime augmentation
    // types it as always present, so read it honestly.
    const principal = (request as { principal?: Principal }).principal;
    const teamId = (request.params as { teamId?: string } | undefined)?.teamId;

    // RED per route (docs/22). The route label is templated; statuses are
    // bucketed into classes so the label space stays bounded.
    const route = routeLabel(request);
    incrementMetric("http_requests_total", {
      method: request.method,
      route,
      status_class: statusClass(reply.statusCode),
    });
    observeHistogram("http_request_duration_ms", { route }, reply.elapsedTime);
    request.log.info(
      {
        request_id: request.id,
        trace_id: request.traceContext?.traceId,
        team_id: teamId ?? null,
        actor_type: principal?.kind ?? null,
        actor_id: principal?.userId ?? principal?.apiKeyId ?? null,
        // docs/22: `ingress` says where work entered; trust says how dangerous
        // it was. Both are fields, never interpolated into the message.
        ingress: principal ? (principal.kind === "api_key" ? "api_key" : "interactive") : null,
        context_trust_level: principal?.ingressTrust ?? null,
        method: request.method,
        url: request.url,
        status_code: reply.statusCode,
        duration_ms: Math.round(reply.elapsedTime),
      },
      "request completed",
    );
  });

  // Scrape endpoint for the security signals. Unauthenticated on purpose:
  // nginx is the boundary (docs/19) and this must be reachable by the
  // metrics scraper inside the trust perimeter.
  app.get("/metrics", async (_request, reply) => {
    // Collectors run per scrape so gauges reflect the moment, not the last
    // event. A failing collector is logged and skipped — one broken query
    // must not take the whole exposition down.
    for (const collect of options.collectors ?? []) {
      try {
        await collect();
      } catch (error) {
        _request.log.warn({ err: error }, "metrics collector failed");
      }
    }
    return reply.type("text/plain; version=0.0.4; charset=utf-8").send(renderMetrics());
  });
}

export { routeLabel, statusClass };
