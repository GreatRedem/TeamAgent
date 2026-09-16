import { sql } from "drizzle-orm";
import type { AnyDb } from "../db/db.js";
import { setGauge } from "./metrics.js";

/**
 * Queue levels, collected at scrape time (docs/22-observability.md). The
 * queue is a table in the primary database (docs/23-job-queue.md), so depth
 * is a query, not a counter: nothing can enqueue a level event the way code
 * increments a counter, and a scrape-time read is always the truth.
 *
 * Reading at scrape time also keeps this dependency-free — no loop, no
 * polling interval, no metrics push. A scrape that fails simply leaves the
 * last gauges standing, the same staleness every pull-based scraper treats
 * as normal.
 */
export async function collectQueueMetrics(database: AnyDb): Promise<void> {
  const depth = (await database.execute(sql`
    SELECT queue, status, count(*)::int AS n
    FROM jobs
    GROUP BY queue, status
  `)) as unknown as { rows: Array<{ queue: string; status: string; n: number }> };
  for (const row of depth.rows) {
    setGauge("queue_depth", { queue: row.queue, status: row.status }, Number(row.n));
  }

  const total = (await database.execute(sql`
    SELECT count(*)::bigint AS n FROM jobs
  `)) as unknown as { rows: Array<{ n: string }> };
  const rows = total.rows[0]?.n;
  if (rows !== undefined) setGauge("jobs_table_rows", {}, Number(rows));
}
