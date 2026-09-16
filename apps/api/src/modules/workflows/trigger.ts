import { eq } from "drizzle-orm";
import type { AnyDb } from "../../db/db.js";
import { AppError } from "../../lib/http.js";
import type { QueueJob } from "../jobs/queue.js";
import { workflows } from "../../db/schema/index.js";
import { startWorkflowRun, type WorkflowRuntimeDeps } from "./service.js";

/**
 * The queue handler for jobs the scheduler enqueues from `job_schedules`
 * (docs/23). One fired schedule = one workflow run of the current version.
 *
 * Unattended by construction: the run's principal is nobody — no user, no
 * key, no memberships — so `triggerPermissions` is empty and the executor's
 * unattended restrictions apply unchanged (read_only and reply tiers only,
 * approval gates deny). A cron schedule fires with no human present and
 * carries no ingress evidence, so the run is `untrusted`, matching the
 * `context_trust_level` the scheduler stamped on the job row.
 */
export function workflowTriggerHandler(
  database: AnyDb,
  runtime: WorkflowRuntimeDeps,
): (job: QueueJob) => Promise<void> {
  return async (job: QueueJob) => {
    const workflowId = job.payload["workflow_id"];
    if (typeof workflowId !== "string" || workflowId.length === 0) {
      // Malformed payload: retrying changes nothing. Fail so attempts
      // exhaust and the job lands in `dead` where it is visible (docs/23).
      throw new Error("workflow_trigger job payload is missing workflow_id");
    }

    const rows = await database.select().from(workflows).where(eq(workflows.id, workflowId));
    const workflow = rows[0];
    // Deleted or no longer runnable: not an error. The schedule row is
    // reconciled by publish/status changes; a fired job for a workflow that
    // vanished in between is a no-op, not a retry.
    if (workflow === undefined) return;
    if (workflow.status !== "active") return;
    if (workflow.currentVersionId === null) return;

    try {
      await startWorkflowRun(database, runtime, {
        teamId: workflow.teamId,
        workflowId: workflow.id,
        principal: {
          kind: "api_key",
          userId: null,
          apiKeyId: null,
          ingressTrust: "untrusted",
          memberships: [],
        },
        input: {
          trigger: "schedule",
          schedule_id: job.payload["schedule_id"] ?? null,
        },
        // A reclaimed job reruns (docs/23); the job id is stable across
        // reclaims, so this key collapses a rerun onto the original run
        // instead of double-firing the workflow.
        idempotencyKey: `workflow_trigger:${job.id}`,
        // Restore the trace the scheduler wrote on the job row (docs/23):
        // the run's calls stay connected to the fire that caused them.
        traceId: job.traceId,
        actorId: null,
      });
    } catch (error) {
      // Lost a race with a status change (paused/archived between the check
      // and the run): the workflow is not runnable, which is a no-op rather
      // than a retryable failure.
      if (
        error instanceof AppError &&
        (error.code === "WORKFLOW_NOT_ACTIVE" || error.code === "NO_CURRENT_VERSION")
      ) {
        return;
      }
      throw error;
    }
  };
}
