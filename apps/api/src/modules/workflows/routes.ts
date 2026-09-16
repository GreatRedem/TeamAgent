import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest, ok } from "../../lib/http.js";
import { authenticate, requirePermission, teamScope } from "../auth/guards.js";
import type { ApiDeps } from "../deps.js";
import {
  createWorkflow,
  getVersion,
  getWorkflow,
  getWorkflowRun,
  listVersions,
  listWorkflowRuns,
  listWorkflows,
  publishVersion,
  startWorkflowRun,
  STEP_KINDS,
  TRIGGER_TYPES,
  updateWorkflow,
  WORKFLOW_STATUSES,
} from "./service.js";

const CreateWorkflowBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});
const UpdateWorkflowBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    status: z.enum(WORKFLOW_STATUSES).optional(),
  })
  .refine((b) => b.name !== undefined || b.description !== undefined || b.status !== undefined, {
    message: "Nothing to update.",
  });
const StepBody = z.object({
  step_key: z.string().min(1).max(64),
  kind: z.enum(STEP_KINDS),
  config: z.record(z.string(), z.unknown()),
  position: z.number().int().min(0).optional(),
});
const PublishVersionBody = z.object({
  trigger_type: z.enum(TRIGGER_TYPES),
  trigger_config: z.record(z.string(), z.unknown()).optional(),
  settings: z
    .object({
      retry_count: z.number().int().optional(),
      timeout_seconds: z.number().int().optional(),
    })
    .optional(),
  steps: z.array(StepBody).min(1).max(50),
  set_current: z.boolean().optional(),
});
const StartRunBody = z.object({
  input: z.record(z.string(), z.unknown()).optional(),
  idempotency_key: z.string().min(1).max(200).optional(),
});

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw badRequest("INVALID_INPUT", "The request body is invalid.", {
        issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    throw error;
  }
}

function meta(request: { ip: string; headers: Record<string, unknown> }): {
  ip: string;
  userAgent: string | null;
} {
  const userAgent = request.headers["user-agent"];
  return { ip: request.ip, userAgent: typeof userAgent === "string" ? userAgent : null };
}

export async function workflowRoutes(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  const auth = authenticate({ db: deps.db, jwtSecret: deps.jwtSecret });
  const scope = teamScope();
  const view = requirePermission("workflow.view");
  const create = requirePermission("workflow.create");
  const edit = requirePermission("workflow.edit");
  const run = requirePermission("workflow.run");

  app.post(
    "/teams/:teamId/workflows",
    { preHandler: [auth, scope, create] },
    async (request, reply) => {
      const { teamId } = request.params as { teamId: string };
      const body = parseBody(CreateWorkflowBody, request.body);
      const created = await createWorkflow(deps.db, {
        teamId,
        name: body.name,
        description: body.description ?? null,
        actorId: request.principal.userId,
        ...meta(request),
      });
      return ok(reply, { id: created.id });
    },
  );

  app.get(
    "/teams/:teamId/workflows",
    { preHandler: [auth, scope, view] },
    async (request, reply) => {
      const { teamId } = request.params as { teamId: string };
      return ok(reply, { workflows: await listWorkflows(deps.db, teamId) });
    },
  );

  app.get(
    "/teams/:teamId/workflows/:workflowId",
    { preHandler: [auth, scope, view] },
    async (request, reply) => {
      const { teamId, workflowId } = request.params as { teamId: string; workflowId: string };
      return ok(reply, await getWorkflow(deps.db, teamId, workflowId));
    },
  );

  app.patch(
    "/teams/:teamId/workflows/:workflowId",
    { preHandler: [auth, scope, edit] },
    async (request, reply) => {
      const { teamId, workflowId } = request.params as { teamId: string; workflowId: string };
      const body = parseBody(UpdateWorkflowBody, request.body);
      await updateWorkflow(deps.db, {
        teamId,
        workflowId,
        name: body.name,
        description: body.description,
        status: body.status,
        actorId: request.principal.userId,
        ...meta(request),
      });
      return ok(reply, await getWorkflow(deps.db, teamId, workflowId));
    },
  );

  app.post(
    "/teams/:teamId/workflows/:workflowId/versions",
    { preHandler: [auth, scope, edit] },
    async (request, reply) => {
      const { teamId, workflowId } = request.params as { teamId: string; workflowId: string };
      const body = parseBody(PublishVersionBody, request.body);
      const published = await publishVersion(deps.db, {
        teamId,
        workflowId,
        triggerType: body.trigger_type,
        triggerConfig: (body.trigger_config ?? null) as Record<string, unknown> | null,
        settings:
          body.settings === undefined
            ? null
            : {
                retryCount: body.settings.retry_count,
                timeoutSeconds: body.settings.timeout_seconds,
              },
        steps: body.steps.map((s) => ({
          stepKey: s.step_key,
          kind: s.kind,
          config: s.config as Record<string, unknown>,
          position: s.position,
        })),
        setCurrent: body.set_current,
        actorId: request.principal.userId,
        ...meta(request),
      });
      return ok(reply, { id: published.id, version: published.version });
    },
  );

  app.get(
    "/teams/:teamId/workflows/:workflowId/versions",
    { preHandler: [auth, scope, view] },
    async (request, reply) => {
      const { teamId, workflowId } = request.params as { teamId: string; workflowId: string };
      return ok(reply, { versions: await listVersions(deps.db, teamId, workflowId) });
    },
  );

  app.get(
    "/teams/:teamId/workflows/:workflowId/versions/:versionId",
    { preHandler: [auth, scope, view] },
    async (request, reply) => {
      const { teamId, workflowId, versionId } = request.params as {
        teamId: string;
        workflowId: string;
        versionId: string;
      };
      return ok(reply, await getVersion(deps.db, teamId, workflowId, versionId));
    },
  );

  app.post(
    "/teams/:teamId/workflows/:workflowId/run",
    { preHandler: [auth, scope, run] },
    async (request, reply) => {
      const { teamId, workflowId } = request.params as { teamId: string; workflowId: string };
      const body = parseBody(StartRunBody, request.body);
      const result = await startWorkflowRun(
        deps.db,
        {
          provider: deps.modelProvider,
          toolHandlerDeps: deps.toolHandlerDeps,
          approvalTtlSeconds: deps.approvalTtlSeconds,
        },
        {
          teamId,
          workflowId,
          principal: {
            kind: request.principal.kind,
            userId: request.principal.userId,
            apiKeyId: request.principal.apiKeyId,
            ingressTrust: request.principal.ingressTrust,
            memberships: request.principal.memberships.map((m) => ({
              teamId: m.teamId,
              permissions: m.permissions,
            })),
          },
          input: (body.input ?? null) as Record<string, unknown> | null,
          idempotencyKey: body.idempotency_key ?? null,
          actorId: request.principal.userId,
          ...meta(request),
        },
      );
      return ok(reply, { run_id: result.runId, status: result.status, trace_id: result.traceId });
    },
  );

  app.get(
    "/teams/:teamId/workflows/:workflowId/runs",
    { preHandler: [auth, scope, view] },
    async (request, reply) => {
      const { teamId, workflowId } = request.params as { teamId: string; workflowId: string };
      return ok(reply, { runs: await listWorkflowRuns(deps.db, teamId, workflowId) });
    },
  );

  app.get(
    "/teams/:teamId/workflows/:workflowId/runs/:runId",
    { preHandler: [auth, scope, view] },
    async (request, reply) => {
      const { teamId, workflowId, runId } = request.params as {
        teamId: string;
        workflowId: string;
        runId: string;
      };
      return ok(reply, await getWorkflowRun(deps.db, teamId, workflowId, runId));
    },
  );
}
