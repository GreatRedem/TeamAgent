import { eq } from "drizzle-orm";
import { workflows, workflowVersions } from "../../db/schema/index.js";
import type { AnyDb } from "../../db/db.js";

export class WorkflowVersionMismatchError extends Error {
  constructor() {
    super("workflow version does not belong to this workflow (R5)");
    this.name = "WorkflowVersionMismatchError";
  }
}

/**
 * R5 (docs/14-database.md): workflows.current_version_id must reference a
 * workflow_versions row belonging to that workflow. The column deliberately
 * carries no foreign key (mutually referential), so this application check
 * is the enforcement — every write to current_version_id goes through here.
 */
export async function setWorkflowCurrentVersion(
  database: AnyDb,
  workflowId: string,
  versionId: string,
): Promise<void> {
  const rows = await database
    .select({ workflowId: workflowVersions.workflowId })
    .from(workflowVersions)
    .where(eq(workflowVersions.id, versionId));
  const row = rows[0];
  if (row === undefined || row.workflowId !== workflowId) {
    throw new WorkflowVersionMismatchError();
  }
  await database
    .update(workflows)
    .set({ currentVersionId: versionId })
    .where(eq(workflows.id, workflowId));
}
