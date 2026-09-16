/**
 * In-process counters for the security signals in docs/22-observability.md.
 * Deliberately dependency-free: the stack has no Prometheus yet, so the
 * registry exposes the Prometheus text exposition format at GET /metrics
 * and keeps recent increments for tests. Counters are monotonic and
 * process-local — with N instances the effective total is N times this, the
 * same caveat the in-process rate limiters carry.
 *
 * Cardinality rule (docs/22): labels are bounded enums — decision, reason,
 * tier, status — never ids. Per-team aggregates belong in a rollup, not
 * here.
 */

export type MetricLabels = Record<string, string>;

interface SeriesKey {
  readonly name: string;
  readonly labels: string;
}

const HELP_TEXT: Record<string, string> = {
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
};

const counters = new Map<string, number>();
/** Recent increments, most useful to tests and a tail exporter. */
const recent: Array<{ name: string; labels: MetricLabels; value: number; at: number }> = [];

function labelKey(labels: MetricLabels): string {
  const known = Object.keys(labels).sort();
  return known.map((k) => `${k}="${escapeLabel(labels[k] ?? "")}"`).join(",");
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/**
 * Increment a named counter. Names outside the registry are rejected rather
 * than silently accepted: an unregistered signal is a misspelled one, and
 * the registry doubles as the documentation of what is emitted.
 */
export function incrementMetric(name: string, labels: MetricLabels = {}, value = 1): void {
  const allowed = KNOWN_LABELS[name];
  if (allowed === undefined) {
    throw new Error(`unknown metric: ${name}`);
  }
  for (const key of Object.keys(labels)) {
    if (!allowed.includes(key)) {
      throw new Error(`metric ${name} does not accept label '${key}'`);
    }
  }
  const key: SeriesKey = { name, labels: labelKey(labels) };
  const series = `${key.name}{${key.labels}}`;
  counters.set(series, (counters.get(series) ?? 0) + value);
  recent.push({ name, labels, value, at: Date.now() });
  if (recent.length > 500) recent.splice(0, recent.length - 500);
}

export function metricValue(name: string, labels: MetricLabels = {}): number {
  return counters.get(`${name}{${labelKey(labels)}}`) ?? 0;
}

/** Prometheus text exposition: every registered series, including zeroes. */
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
  return `${lines.join("\n")}\n`;
}

/** Test isolation: clear all state. */
export function resetMetrics(): void {
  counters.clear();
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
