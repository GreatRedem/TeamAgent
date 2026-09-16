/**
 * In-process metrics for docs/22-observability.md: the security signal
 * counters, the RED service-health series, and the queue/domain signals.
 * Deliberately dependency-free: the stack has no Prometheus yet, so the
 * registry exposes the Prometheus text exposition format at GET /metrics
 * (API) and on the worker's scrape port, and keeps recent increments for
 * tests. Counters are monotonic and process-local — with N instances the
 * effective total is N times this, the same caveat the in-process rate
 * limiters carry.
 *
 * Cardinality rule (docs/22): labels are bounded enums — decision, reason,
 * tier, status, method, templated route — never ids. Per-team aggregates
 * belong in a rollup, not here.
 */

export type MetricLabels = Record<string, string>;

const HELP_TEXT: Record<string, string> = {
  // Security signals (docs/22): the observable signature of the threat model.
  refresh_token_reuse_total: "Refresh token replay detected (W6). Zero in healthy operation.",
  cross_team_access_denied_total: "Tenant isolation rejections. Zero in healthy operation.",
  destination_denied_total: "Egress destinations rejected against the allowlist (C3).",
  tool_calls_denied_total: "Tool executions denied by the policy decision point.",
  approval_requests_total: "Approval gates opened, by the context trust that triggered them.",
  auth_failures_total: "Wallet sign-in failures, by reason (W2 phishing shows as domain_mismatch).",
  eip1271_failures_total: "EIP-1271 verification failures (W4): RPC degradation or attack.",
  agent_permission_grant_rejected_total:
    "R3 rejections: attempts to grant agents admin capability.",
  apikey_trust_ceiling_raised_total: "Keys issued or used at user_input ceiling (T16).",
  apikey_auth_failures_total: "API key authentication failures, by reason.",
  workflow_runs_total: "Workflow runs by status and trigger source.",
  agent_runs_total: "Agent runs by terminal status.",
  // Service health (docs/22): RED per route.
  http_requests_total: "HTTP requests by method, templated route, and status class.",
  // Queue (docs/22): the queue is a table, so rates are emitted by the worker
  // and levels are collected by a query at scrape time (observability/queue.ts).
  jobs_total: "Job terminal outcomes by queue and status.",
  job_retries_total: "Jobs returned to the queue for retry after a failure.",
  jobs_dead_total: "Jobs that exhausted max_attempts (subset of jobs_total dead).",
  jobs_reclaimed_total:
    "Jobs reaped after a lease expiry. A steady non-zero rate means workers are dying or the lease is mistuned.",
  // Domain (docs/22).
  model_calls_total: "Model gateway calls by provider, model, and status.",
  tokens_consumed_total: "Tokens billed, by provider, model, and direction.",
  run_budget_exceeded_total: "C10 budget terminations, by the limit that fired.",
};

const KNOWN_LABELS: Record<string, readonly string[]> = {
  refresh_token_reuse_total: [],
  cross_team_access_denied_total: [],
  destination_denied_total: [],
  tool_calls_denied_total: [],
  approval_requests_total: ["context_trust_level"],
  auth_failures_total: ["reason"],
  eip1271_failures_total: [],
  agent_permission_grant_rejected_total: [],
  apikey_trust_ceiling_raised_total: [],
  apikey_auth_failures_total: ["reason"],
  workflow_runs_total: ["status", "trigger_source"],
  agent_runs_total: ["status"],
  http_requests_total: ["method", "route", "status_class"],
  jobs_total: ["queue", "status"],
  job_retries_total: ["queue"],
  jobs_dead_total: ["queue"],
  jobs_reclaimed_total: [],
  model_calls_total: ["provider", "model", "status"],
  tokens_consumed_total: ["provider", "model", "direction"],
  run_budget_exceeded_total: ["limit_type"],
};

/**
 * Gauges: point-in-time levels. `queue_depth` and `jobs_table_rows` are set
 * by the scrape-time collector (observability/queue.ts), not by event code.
 */
const GAUGE_LABELS: Record<string, readonly string[]> = {
  queue_depth: ["queue", "status"],
  jobs_table_rows: [],
};

const GAUGE_HELP: Record<string, string> = {
  queue_depth: "Jobs waiting to run, by queue and status. The earliest indicator of async trouble.",
  jobs_table_rows: "Total rows in the jobs table. Unbounded growth degrades the claim index.",
};

/** Bucket sets, per histogram. `le` values are inclusive upper bounds. */
const HISTOGRAM_BUCKETS: Record<string, readonly number[]> = {
  // Interactive latency: sub-50ms is the common case for non-agent routes.
  http_request_duration_ms: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  // Job durations, up to a deliberately over-length lease (10m default lease).
  job_duration_seconds: [0.1, 0.5, 1, 5, 15, 60, 300, 900, 3600],
  // Enqueue-to-claim wait. The low end matters most: starvation shows as
  // mass moving from the sub-second buckets into the seconds/minutes ones.
  queue_wait_seconds: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 300],
  // Model calls: provider latency, usually the first dependency to degrade.
  model_call_duration_seconds: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120],
};

const HISTOGRAM_LABELS: Record<string, readonly string[]> = {
  http_request_duration_ms: ["route"],
  job_duration_seconds: ["queue"],
  queue_wait_seconds: ["queue"],
  model_call_duration_seconds: ["provider"],
};

const HISTOGRAM_HELP: Record<string, string> = {
  http_request_duration_ms: "Request latency by templated route (RED duration).",
  job_duration_seconds: "Job execution duration by queue, claim to terminal write.",
  queue_wait_seconds:
    "Enqueue to claim wait by queue. Rising wait with flat depth means too few workers.",
  model_call_duration_seconds: "Model provider latency. Provider degradation shows here first.",
};

const counters = new Map<string, number>();
const gauges = new Map<string, number>();
interface HistogramState {
  counts: number[];
  sum: number;
  count: number;
}
const histograms = new Map<string, HistogramState>();

/** Recent increments, most useful to tests and a tail exporter. */
const recent: Array<{ name: string; labels: MetricLabels; value: number; at: number }> = [];

function labelKey(labels: MetricLabels): string {
  const known = Object.keys(labels).sort();
  return known.map((k) => `${k}="${escapeLabel(labels[k] ?? "")}"`).join(",");
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function requireRegistered(
  registry: Record<string, readonly string[]>,
  kind: string,
  name: string,
  labels: MetricLabels,
): void {
  const allowed = registry[name];
  if (allowed === undefined) {
    throw new Error(`unknown metric: ${name}`);
  }
  for (const key of Object.keys(labels)) {
    if (!allowed.includes(key)) {
      throw new Error(`metric ${name} does not accept label '${key}'`);
    }
  }
}

/**
 * Increment a named counter. Names outside the registry are rejected rather
 * than silently accepted: an unregistered signal is a misspelled one, and
 * the registry doubles as the documentation of what is emitted.
 */
export function incrementMetric(name: string, labels: MetricLabels = {}, value = 1): void {
  requireRegistered(KNOWN_LABELS, "counter", name, labels);
  const series = `${name}{${labelKey(labels)}}`;
  counters.set(series, (counters.get(series) ?? 0) + value);
  recent.push({ name, labels, value, at: Date.now() });
  if (recent.length > 500) recent.splice(0, recent.length - 500);
}

/** Set a gauge to an observed level. Levels replace, they do not accumulate. */
export function setGauge(name: string, labels: MetricLabels = {}, value: number): void {
  requireRegistered(GAUGE_LABELS, "gauge", name, labels);
  gauges.set(`${name}{${labelKey(labels)}}`, value);
}

export function metricValue(name: string, labels: MetricLabels = {}): number {
  return counters.get(`${name}{${labelKey(labels)}}`) ?? 0;
}

export function gaugeValue(name: string, labels: MetricLabels = {}): number {
  return gauges.get(`${name}{${labelKey(labels)}}`) ?? 0;
}

/**
 * Record one observation of a histogram. Missing buckets default to the
 * registered set; the +Inf bucket is implicit from `count`.
 */
export function observeHistogram(name: string, labels: MetricLabels, value: number): void {
  requireRegistered(HISTOGRAM_LABELS, "histogram", name, labels);
  const buckets = HISTOGRAM_BUCKETS[name];
  if (buckets === undefined) throw new Error(`histogram ${name} has no bucket set`);
  const key = `${name}{${labelKey(labels)}}`;
  let state = histograms.get(key);
  if (state === undefined) {
    state = { counts: Array.from({ length: buckets.length }, () => 0), sum: 0, count: 0 };
    histograms.set(key, state);
  }
  for (let i = 0; i < buckets.length; i += 1) {
    if (value <= buckets[i]) {
      state.counts[i] += 1;
      break;
    }
  }
  state.sum += value;
  state.count += 1;
}

function renderHistograms(): string[] {
  const lines: string[] = [];
  for (const [name, help] of Object.entries(HISTOGRAM_HELP)) {
    const seriesKeys = [...histograms.keys()].filter((s) => s.startsWith(`${name}{`));
    if (seriesKeys.length === 0) continue;
    const buckets = HISTOGRAM_BUCKETS[name];
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} histogram`);
    for (const key of seriesKeys.sort()) {
      const state = histograms.get(key);
      if (state === undefined) continue;
      const labels = key.slice(name.length + 1, -1);
      const withLabel = (suffix: string, extra: string, value: number): string =>
        labels.length > 0
          ? `${name}_${suffix}{${labels},${extra}} ${value}`
          : `${name}_${suffix}{${extra}} ${value}`;
      let cumulative = 0;
      for (let i = 0; i < buckets.length; i += 1) {
        cumulative += state.counts[i];
        lines.push(withLabel("bucket", `le="${buckets[i]}"`, cumulative));
      }
      lines.push(withLabel("bucket", 'le="+Inf"', state.count));
      lines.push(
        labels.length > 0 ? `${name}_sum{${labels}} ${state.sum}` : `${name}_sum ${state.sum}`,
      );
      lines.push(
        labels.length > 0
          ? `${name}_count{${labels}} ${state.count}`
          : `${name}_count ${state.count}`,
      );
    }
  }
  return lines;
}

/** Prometheus text exposition: registered counters and gauges, plus observed histogram series. */
export function renderMetrics(): string {
  const lines: string[] = [];
  for (const [name, help] of Object.entries(HELP_TEXT)) {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} counter`);
    const allowed = KNOWN_LABELS[name] ?? [];
    const seriesNames = [...counters.keys()].filter((s) => s.startsWith(`${name}{`));
    if (seriesNames.length === 0) {
      // Emit the zero series so a scrape shows the signal exists at zero —
      // the "should be zero in healthy operation" alerts need the series.
      lines.push(allowed.length === 0 ? `${name} 0` : `# (no series yet)`);
      continue;
    }
    for (const series of seriesNames.sort()) {
      const value = counters.get(series) ?? 0;
      const labels = series.slice(name.length + 1, -1);
      lines.push(labels.length > 0 ? `${name}{${labels}} ${value}` : `${name} ${value}`);
    }
  }
  for (const [name, help] of Object.entries(GAUGE_HELP)) {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} gauge`);
    const seriesNames = [...gauges.keys()].filter((s) => s.startsWith(`${name}{`));
    if (seriesNames.length === 0) {
      // Only label-less gauges get a zero series; labeled ones depend on
      // live state (empty queue == no series, not a fake backlog of zero).
      if ((GAUGE_LABELS[name] ?? []).length === 0) lines.push(`${name} 0`);
      continue;
    }
    for (const series of seriesNames.sort()) {
      const value = gauges.get(series) ?? 0;
      const labels = series.slice(name.length + 1, -1);
      lines.push(labels.length > 0 ? `${name}{${labels}} ${value}` : `${name} ${value}`);
    }
  }
  lines.push(...renderHistograms());
  return `${lines.join("\n")}\n`;
}

/** Test isolation: clear all state. */
export function resetMetrics(): void {
  counters.clear();
  gauges.clear();
  histograms.clear();
  recent.length = 0;
}

/** Recent increments (newest last), for tests and a tail exporter. */
export function recentIncrements(): ReadonlyArray<{
  name: string;
  labels: MetricLabels;
  value: number;
  at: number;
}> {
  return recent;
}
