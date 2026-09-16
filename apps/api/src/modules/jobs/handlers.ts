import type { AnyDb } from "../../db/db.js";
import type { JobHandler } from "./worker.js";
import { workflowTriggerHandler } from "../workflows/trigger.js";
import type { WorkflowRuntimeDeps } from "../workflows/service.js";
import { pruneTerminalJobs } from "./cleanup.js";
import { rollupCosts } from "./cost-rollup.js";

/**
 * Every queue name the runtime enqueues into, with the handler that owns it.
 * A job whose queue has no handler fails loudly in `processOne` rather than
 * being silently dropped, and this map is the single registry that keeps
 * queue names and handlers from drifting apart.
 */
export function jobHandlers(
  database: AnyDb,
  runtime: WorkflowRuntimeDeps,
  options: {
    /** Jobs-table retention knobs (docs/23 Cleanup); tests pass short ones. */
    cleanup?: {
      succeededRetentionMs?: number;
      failedRetentionMs?: number;
    };
    /** Cost-rollup knobs (docs/22 Cost); tests pass small buckets. */
    costRollup?: {
      bucketSeconds?: number;
      lookbackMs?: number;
    };
  } = {},
): Record<string, JobHandler> {
  return {
    workflow_trigger: workflowTriggerHandler(database, runtime),
    // Docs/23: cleanup runs as a scheduled job in this same queue. It is a
    // handler like any other, so it inherits the worker's lease, retries,
    // and dead-lettering — a cleanup run that fails is visible, not silent.
    jobs_cleanup: async () => {
      await pruneTerminalJobs(database, options.cleanup);
    },
    // docs/22 Cost: token totals per team/agent/model into cost_rollups.
    // A scheduled job like cleanup — visible when it fails, lease-protected.
    jobs_cost_rollup: async () => {
      await rollupCosts(database, options.costRollup);
    },
  };
}
