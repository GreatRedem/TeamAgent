---
name: job-queue
description: "Use when implementing or reviewing NuraAI database-backed jobs, workers, leases, retries, schedulers, cleanup, or trace propagation."
---

# NuraAI Job Queue

Follow `docs/23-job-queue.md` and the runtime guarantees in `docs/11-runtime.md`.

## Rules

- Enqueue domain work and its job in the same database transaction.
- Claim jobs atomically with a single `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1)`. A select followed by an update hands one job to two workers; without `SKIP LOCKED` every worker queues behind the same row.
- Heartbeat leases and reclaim expired running jobs.
- Make handlers idempotent because lease recovery can rerun work.
- Classify errors before retrying; use exponential backoff with jitter and move exhausted jobs to `dead`.
- Keep polling as the delivery fallback even when PostgreSQL `NOTIFY` is available.
- Ensure only one scheduler tick runs per deployment.
- Keep payloads small and reference domain rows by ID.
- Propagate `trace_id` across enqueue and worker execution.
- Prune successful jobs and retain failed/dead jobs for investigation.

## Tests

Use real concurrent workers and a real database for claim races, lease recovery, retry limits, future scheduling, notification outages, trace propagation, and transaction rollback.
