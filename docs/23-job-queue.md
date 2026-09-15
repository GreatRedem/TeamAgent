# Job Queue and Background Work

NuraAI runs on **one datastore**. There is no Redis, no RabbitMQ, and no separate message bus. Asynchronous work is queued in the same PostgreSQL database that holds everything else.

This document specifies that queue, because without a broker it is a component to be built rather than a dependency to be installed.

## What Redis was doing, and what replaces it

| Concern | Was | Now |
|---|---|---|
| Async job queue | BullMQ on Redis | `jobs` table, claimed with a conditional update |
| Scheduled triggers | BullMQ repeatable jobs | `job_schedules` table plus a scheduler tick |
| Permission cache | Redis, keyed by user and team | **No cache.** Resolve per request — see below |
| Rate limiting | Redis-backed counters | In-process counters, plus a query for the auth path |
| Worker wakeup | Redis pub/sub | `LISTEN`/`NOTIFY`, with polling as the durable fallback |

## The benefit worth naming first

Losing the broker costs throughput. It also removes an entire class of bug, and that trade is usually worth more than it looks.

With a separate broker, enqueueing a job and writing the domain row are two systems and cannot share a transaction. Every such site has a dual-write problem: the row commits and the enqueue fails, so the work never happens; or the enqueue succeeds and the transaction rolls back, so a worker picks up a job referencing a row that does not exist. Both are real, both are intermittent, and both are miserable to reproduce.

With the queue in the same database, **the enqueue is part of the transaction**. A workflow run row and the job that executes it commit together or not at all. For a system whose correctness claims rest on auditability, that is worth more than queue throughput.

## The `jobs` table

| Column | Notes |
|---|---|
| `id` | |
| `queue` | Logical queue name — `agent_run`, `workflow_step`, `ingest`, `cleanup` |
| `team_id` | Nullable for system jobs. Enables per-tenant fairness and metrics |
| `payload` | JSON, small. Reference rows by id; do not copy them in |
| `status` | `queued`, `running`, `succeeded`, `failed`, `dead` |
| `priority` | Higher runs first |
| `run_at` | Scheduling and backoff. A job is invisible until this time |
| `attempts`, `max_attempts` | |
| `locked_at`, `locked_by` | Lease holder and its heartbeat timestamp |
| `last_error` | |
| `idempotency_key` | Unique per queue. Makes enqueue safe to retry |
| `trace_id` | Propagates the calling trace across the queue boundary |
| `context_trust_level` | The trust level of the work this job carries, propagated across the queue boundary the same way `trace_id` is |
| `created_at`, `completed_at` | |

Indexes: `(status, run_at, priority)` for the claim; `(status, locked_at)` for the reaper; `(queue, status)` for metrics.

Keep payloads small. A payload that carries a full message body or retrieved knowledge duplicates data that already exists in a row, and makes the table churn far worse than it needs to be.

## Claiming a job

The whole correctness of a database-backed queue is in this one query. It must be a **single atomic statement** that both selects and locks — a select followed by an update is a race that hands the same job to two workers.

`FOR UPDATE SKIP LOCKED` is what lets concurrent workers claim different rows without blocking each other:

```sql
UPDATE jobs SET
  status = 'running', locked_at = now(), locked_by = $1, attempts = attempts + 1
WHERE id = (
  SELECT id FROM jobs
  WHERE status = 'queued' AND run_at <= now()
  ORDER BY priority DESC, run_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING *;
```

Without `SKIP LOCKED`, every worker queues behind the same row and throughput collapses to one at a time. It is not optional, and it is one of the reasons `docs/19-tech-stack.md` settled on PostgreSQL as the only engine — the obvious alternatives either lack it or serialize writers outright.

Two details in the query that are easy to drop and expensive to miss:

- **`run_at <= now()`** is what makes backoff and scheduling work. A job is invisible until its time, so rescheduling a failure is a single `UPDATE` rather than a separate delay mechanism.
- **`ORDER BY priority DESC, run_at`** inside the subquery, not outside it. Ordering after the lock has already been taken does nothing.

Check the affected row count. Zero means no job was available, which is the normal idle case — not an error.

## Leases and crash recovery

A worker that dies mid-job leaves the row in `running` forever. The lease is what prevents that.

- The worker **heartbeats** `locked_at` while running.
- A **reaper** periodically returns jobs whose `locked_at` is older than the lease timeout to `queued`.

The lease must be longer than the longest plausible job. This matters more here than in a typical application: an agent run waits on model inference and possibly several tool calls, and can legitimately run for minutes. A lease tuned for fast jobs will reclaim a healthy long-running agent run and execute it a second time — sending duplicate messages, making duplicate writes, and spending tokens twice.

Because reclaim-and-rerun can happen at all, **job handlers must be idempotent**. `agent_runs.idempotency_key` and `workflow_runs.idempotency_key` already exist for this; use them. `docs/11-runtime.md` lists idempotency as a runtime guarantee, and this is where it becomes load-bearing rather than aspirational.

## Retries, backoff, and the dead letter state

On failure: increment `attempts`, set `last_error`, and either reschedule with exponential backoff and jitter by setting `run_at` into the future, or — once `attempts >= max_attempts` — set `status = 'dead'`.

Jitter is not decoration. Without it, a batch of jobs that fail together against a downed provider retries in lockstep and hammers it back down the moment it recovers.

Dead jobs are kept, not deleted. They are the record of what failed and why, they need a way to be inspected and requeued, and a non-empty dead set is an alert in `docs/22-observability.md`.

Distinguish error classes before retrying. A provider timeout deserves a retry; a schema validation failure or a permission denial will fail identically every time, and retrying it five times just delays the dead-letter by an hour and triples the log noise. The taxonomy in `docs/16-backend-architecture.md` already separates these.

## Waking workers

`NOTIFY` on enqueue, workers `LISTEN`. Jobs start immediately instead of waiting out a poll interval.

`NOTIFY` is not durable — a notification delivered while no worker is listening is simply lost. It is a latency optimization, never the delivery mechanism. **Always keep a polling fallback**, and make sure the system is correct with notifications disabled entirely. A queue that only works when `NOTIFY` arrives will quietly stall after a network blip.

`NOTIFY` also fires on transaction commit, which is the correct semantics here: no worker is woken for a job whose transaction later rolls back.

The polling fallback wants an interval of one to two seconds. Every poll is a query against a table that other writers want, so a tighter interval buys latency that `NOTIFY` already provides and costs contention that it does not.

## Scheduled work

`job_schedules` holds cron-triggered workflows and system maintenance: `id`, `queue`, `cron`, `payload`, `next_run_at`, `last_run_at`, `enabled`, `team_id`.

A scheduler tick claims schedules whose `next_run_at` has passed, enqueues a job, and advances `next_run_at`.

**Only one scheduler may tick at a time**, or every scheduled workflow fires once per running instance.

Wrap the tick in `pg_try_advisory_lock`. Whichever instance acquires it does the work; the others skip and try again next tick. No leader-election protocol, no extra dependency, and the lock is released automatically if the holding session dies.

Missed ticks need a policy. If the scheduler was down for an hour, does an hourly workflow run once or sixty times? Default to once — catch-up storms are usually worse than a skipped run — and make it explicit rather than emergent.

## Cleanup

**A jobs table that is never pruned is the standard way this design fails.** Completed rows accumulate, the claim index degrades, and the churn creates sustained vacuum pressure.

- Delete `succeeded` rows after a short retention — hours to a few days.
- Keep `failed` and `dead` rows longer; they are diagnostic.
- Run cleanup as a scheduled job in this same queue.
- At high volume, partition by `created_at` and drop partitions rather than deleting rows.

## Tracing across the boundary

`trace_id` is a column on `jobs` specifically so the trace survives the queue. The enqueuer writes it; the worker restores the trace context from it before doing anything else.

`docs/22-observability.md` covers why this matters: without it, every model call, tool execution, and egress lands in a trace disconnected from the request that caused them.

**`context_trust_level` crosses the same boundary for the same reason.** A job is frequently the thing that carries work from an untrusted ingress — an inbound message, a webhook payload — to the runtime that will act on it. If the label is not on the row, the worker either reconstructs it from the referenced rows or, worse, starts the run at a default. Trust is only ever allowed to decrease, and a queue hop is exactly where it silently resets.

It also makes the trust dimension queryable at the queue level: *how much untrusted work is currently in flight* is a question worth being able to answer during an incident.

## Rate limiting without Redis

Three different needs, three different answers:

1. **Coarse per-IP limits** — in-process counters. With *N* instances the effective limit is *N* times the configured value; set the per-instance number accordingly and do not pretend it is a global limit. Genuinely global coarse limits belong in nginx (`limit_req`), which already terminates every request.
2. **Per-principal API limits** — in-process, same caveat. These are quota shaping, not a security boundary.
3. **The auth endpoints** — these *are* a security boundary (`docs/20-authentication.md` W8) and need to be accurate. No counter table is needed: `auth_nonces` already records every issuance with an address and a timestamp, so counting rows for an address or IP within a window is a direct indexed query against data that is being written anyway.

Per-team quotas from `teams.limits` are enforced against real usage in `agent_runs` and `tokens_consumed`, not against an in-memory counter. They are accounting, not rate limiting, and they belong in the database regardless.

## Caching without Redis

**Do not cache permission resolution.** Resolve it per request.

`docs/20-authentication.md` previously suggested caching it in Redis with explicit invalidation. Removing Redis removes the invalidation channel, and a TTL cache reintroduces precisely the staleness that document exists to prevent — a removed member continuing to act until the entry expires. That is the same defect as putting permissions in the JWT, relocated.

The lookup is an indexed join returning a small row set, executed once per request against a connection that is already open. Measure it before optimizing it; in almost every case it will not be the bottleneck, and the model call in the same request takes three orders of magnitude longer.

If profiling later proves otherwise, the answer is an in-process cache invalidated by `LISTEN`/`NOTIFY` on membership and grant changes — correct, and it keeps revocation immediate. A TTL is not an acceptable substitute: any staleness window is a security decision, not a performance tuning knob.

## What this costs

Stated plainly, so none of it is a surprise in production:

1. **Lower throughput ceiling.** A PostgreSQL-backed queue handles hundreds to low thousands of jobs per second; Redis handles far more. For this workload it is irrelevant — every job contains an LLM call measured in seconds, so the queue will never be the constraint.
2. **Queue load shares the application database.** Claim polling, heartbeats, and cleanup compete with application queries for connections and I/O. Size the pool with the worker fleet in mind, and keep polling intervals sane.
3. **Table churn.** High insert and update rates on `jobs` create vacuum pressure. Cleanup is mandatory, not optional, and at volume the answer is partitioning by `created_at` and dropping partitions.
4. **In-process rate limits are per instance.** Multiply by instance count and set expectations accordingly.
5. **PostgreSQL is now on the critical path for background work as well as requests.** One database to back up, secure, and operate — and one database whose outage stops everything rather than degrading one subsystem. That is the trade, and it is the right one at this scale.
6. **No pub/sub broker.** If streaming responses to clients is added later (`docs/15-api.md` has no streaming design yet), fanning out across multiple API instances needs a channel. `LISTEN`/`NOTIFY` serves, with the same caveat as above: it is not durable, so it can carry a live stream but must not be the delivery mechanism for anything that has to arrive.

## Build or adopt — reopened

An earlier revision recommended building this, and the reason was that `pg-boss` and `graphile-worker` are both PostgreSQL-only while the stack supported two dialects. **That objection is gone.** `docs/19-tech-stack.md` now commits to PostgreSQL exclusively, so both libraries are viable and the recommendation has to be re-argued rather than inherited.

**Adopting** — `graphile-worker` is the stronger candidate of the two, because its `graphile_worker.add_job(...)` is a SQL function callable inside an existing transaction, which preserves the transactional-enqueue property that is the entire reason the queue lives in this database. It also ships `SKIP LOCKED` claiming, `LISTEN`/`NOTIFY` wakeup, exponential backoff, and cron. All of it is battle-tested, and none of it is code to maintain.

**Building** — the surface is genuinely small: claim, heartbeat, complete, fail, reap, schedule, clean. A few hundred lines.

The real trade is **schema ownership**, not effort. Both libraries own their own tables in their own Postgres schema, and neither has `team_id`, `trace_id`, or `risk_tier` as first-class columns. Under an adopted library those live inside the payload, which means:

- per-tenant queue metrics (`queue_depth` by team, per-team fairness) become payload introspection rather than an indexed column
- the `jobs` table specified above and in `docs/14-database.md` is replaced by theirs, so the observability design in `docs/22-observability.md` queries a schema this project does not control
- dead-letter inspection and requeue happen through their model, not yours

None of that is disqualifying, and for most projects it would not be worth a bespoke implementation. Here the queue is a tenant-scoped, audited component in a system whose entire value proposition is provenance, which tilts it.

**Current recommendation: build the minimal version**, for the tenant-scoping and trace columns rather than for the dialect reason that no longer applies. **This is an open decision and should be confirmed deliberately** — it is the kind of thing that gets settled by inertia otherwise, and adopting `graphile-worker` is a defensible call that would save real time.

Whichever is chosen, the tests are the same, and they are the ones that matter: two workers never claim one job; a killed worker's job is reclaimed after the lease; a job exceeding `max_attempts` lands in `dead`; `trace_id` survives the boundary; `NOTIFY` being unavailable does not stop delivery; a job enqueued in a rolled-back transaction never runs.
