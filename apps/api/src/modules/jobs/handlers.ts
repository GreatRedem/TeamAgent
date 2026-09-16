import type { AnyDb } from "../../db/db.js";
import type { JobHandler } from "./worker.js";
import { workflowTriggerHandler } from "../workflows/trigger.js";
import type { WorkflowRuntimeDeps } from "../workflows/service.js";

/**
 * Every queue name the runtime enqueues into, with the handler that owns it.
 * A job whose queue has no handler fails loudly in `processOne` rather than
 * being silently dropped, and this map is the single registry that keeps
 * queue names and handlers from drifting apart.
 */
export function jobHandlers(
  database: AnyDb,
  runtime: WorkflowRuntimeDeps,
): Record<string, JobHandler> {
  return {
    workflow_trigger: workflowTriggerHandler(database, runtime),
  };
}
