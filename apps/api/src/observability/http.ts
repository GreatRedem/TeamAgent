import type { FastifyInstance } from "fastify";
import type { Principal } from "../modules/auth/principal.js";
import { renderMetrics } from "./metrics.js";
import { enterTrace, newSpanId, newTraceId, type TraceContext } from "./trace.js";

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
export async function observabilityPlugin(app: FastifyInstance): Promise<void> {
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
    return reply.type("text/plain; version=0.0.4; charset=utf-8").send(renderMetrics());
  });
}
