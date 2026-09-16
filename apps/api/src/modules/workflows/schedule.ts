import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { AnyDb } from "../../db/db.js";
import { jobSchedules, workflowVersions, workflows } from "../../db/schema/index.js";
import { badRequest } from "../../lib/http.js";
import { nextCronRun, parseCron } from "../jobs/cron.js";

/**
 * The queue the scheduler fires scheduled workflows through. The row lives
 * in `job_schedules` with this queue name; `apps/api/src/modules/jobs` owns
 * the fire, `trigger.ts` owns what the fired job does.
 */
export const WORKFLOW_TRIGGER_QUEUE = "workflow_trigger";

function triggerCron(trigger: unknown): string | null {
  if (typeof trigger !== "object" || trigger === null) return null;
  const parsed = trigger as Record<string, unknown>;
  if (parsed["type"] !== "schedule") return null;
  const config = parsed["config"];
  if (typeof config !== "object" || config === null) return null;
  const cron = (config as Record<string, unknown>)["cron"];
  return typeof cron === "string" && cron.trim().length > 0 ? cron : null;
}

/**
 * Fail a publish whose schedule trigger can never work: a malformed cron, or
 * one with no occurrence in the next year (February 30th). Publishing a
 * schedule that sits due forever, or silently never runs, is worse than
 * refusing the publish — the author is right here to fix it.
 */
export function assertValidScheduleCron(
  triggerConfig: Record<string, unknown> | null | undefined,
): void {
  const cron = triggerConfig?.["cron"];
  if (typeof cron !== "string" || cron.trim().length === 0) {
    throw badRequest(
      "INVALID_CRON",
      "A schedule trigger needs a cron expression in trigger_config.cron.",
    );
  }
  let parsed: ReturnType<typeof parseCron>;
  try {
    parsed = parseCron(cron);
  } catch (error) {
    throw badRequest(
      "INVALID_CRON",
      error instanceof Error ? error.message : "Invalid cron expression.",
    );
  }
  if (nextCronRun(parsed, new Date()) === null) {
    throw badRequest("INVALID_CRON", "The cron expression has no future occurrence.");
  }
}

/**
 * Reconcile the `job_schedules` row with the workflow's desired state: armed
 * iff the workflow is active AND its current version carries a schedule
 * trigger. Everything else (paused, archived, non-schedule trigger, missing
 * version) disarms it.
 *
 * This is derived state, not a second source of truth: the workflow row and
 * its versions decide, and this function makes the schedule row agree. It
 * runs on every publish that sets a current version and every status change,
 * so a paused workflow stops firing and reactivating resumes on cadence.
 *
 * The lookup filters this team's schedule rows by payload in the application:
 * `job_schedules` has no workflow_id column (docs/14 keeps the queue schema
 * workflow-agnostic), the table is tiny, and a jsonb index for a
 * once-per-publish query is not worth it.
 */
export async function syncWorkflowSchedule(database: AnyDb, workflowId: string): Promise<void> {
  const workflowRows = await database.select().from(workflows).where(eq(workflows.id, workflowId));
  const workflow = workflowRows[0];
  if (workflow === undefined) return;

  let cron: string | null = null;
  if (workflow.status === "active" && workflow.currentVersionId !== null) {
    const versionRows = await database
      .select({ trigger: workflowVersions.trigger })
      .from(workflowVersions)
      .where(eq(workflowVersions.id, workflow.currentVersionId));
    cron = triggerCron(versionRows[0]?.trigger);
  }

  const existing = await database
    .select()
    .from(jobSchedules)
    .where(
      and(eq(jobSchedules.teamId, workflow.teamId), eq(jobSchedules.queue, WORKFLOW_TRIGGER_QUEUE)),
    );
  const mine = existing.filter(
    (row) => (row.payload as Record<string, unknown> | null)?.["workflow_id"] === workflow.id,
  );
  const disarm = async (): Promise<void> => {
    if (mine.length === 0) return;
    await database.delete(jobSchedules).where(
      inArray(
        jobSchedules.id,
        mine.map((row) => row.id),
      ),
    );
  };

  if (cron === null) {
    await disarm();
    return;
  }
  // Unparseable or never-firing crons are rejected at publish; a row that
  // predates that check (or was written by hand) is disarmed rather than
  // left to skip loudly on every tick.
  let next: Date | null = null;
  try {
    next = nextCronRun(parseCron(cron), new Date());
  } catch {
    next = null;
  }
  if (next === null) {
    await disarm();
    return;
  }

  const row = mine[0];
  if (row === undefined) {
    await database.insert(jobSchedules).values({
      id: randomUUID(),
      queue: WORKFLOW_TRIGGER_QUEUE,
      cron,
      payload: { workflow_id: workflow.id } as Record<string, unknown>,
      nextRunAt: next,
      enabled: true,
      teamId: workflow.teamId,
    });
  } else if (row.cron !== cron) {
    // New cadence: recompute. The old next_run_at belongs to the dead cron.
    await database
      .update(jobSchedules)
      .set({ cron, nextRunAt: next })
      .where(eq(jobSchedules.id, row.id));
  }
  // Same cron: leave next_run_at alone. Re-publishing an unchanged schedule
  // must not push the next fire out, or every edit silently defers it.
  // Any duplicate rows beyond the first collapse onto it.
  if (mine.length > 1) {
    await database.delete(jobSchedules).where(
      inArray(
        jobSchedules.id,
        mine.slice(1).map((row) => row.id),
      ),
    );
  }
}
