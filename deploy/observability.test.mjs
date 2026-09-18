import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const FORBIDDEN_LABELS = ["team_id", "agent_id", "user_id", "run_id"];

function sectionKeys(source, constName) {
  const start = source.indexOf(`const ${constName}`);
  assert.ok(start !== -1, `${constName} not found`);
  const end = source.indexOf("};", start);
  assert.ok(end !== -1, `${constName} block not closed`);
  const block = source.slice(start, end);
  return [...block.matchAll(/^\s{2}([a-z][a-z0-9_]*)\s*:/gm)].map((match) => match[1]);
}

// Metric-like tokens: counters (_total), gauges, histogram bases and their
// Prometheus derivatives (_bucket/_count/_sum). Bounded label names
// (status_class, reason, queue, ...) never match this shape.
const METRIC_TOKEN =
  /\b([a-z_][a-z0-9_]*?(?:_total|_bucket|_count|_sum)|queue_depth|jobs_table_rows|http_request_duration_ms|job_duration_seconds|queue_wait_seconds|model_call_duration_seconds)\b/g;

function metricTokens(expr) {
  return [...expr.matchAll(METRIC_TOKEN)].map((match) => match[1]);
}

const metricsSource = await read("../apps/api/src/observability/metrics.ts");
const counters = new Set(sectionKeys(metricsSource, "KNOWN_LABELS"));
const gauges = new Set(sectionKeys(metricsSource, "GAUGE_LABELS"));
const histograms = new Set(sectionKeys(metricsSource, "HISTOGRAM_LABELS"));
assert.ok(counters.size > 0 && gauges.size > 0 && histograms.size > 0);

function isRegistered(token) {
  if (counters.has(token) || gauges.has(token) || histograms.has(token)) return true;
  for (const suffix of ["_bucket", "_count", "_sum"]) {
    if (token.endsWith(suffix) && histograms.has(token.slice(0, -suffix.length))) return true;
  }
  return false;
}

function assertNoForbiddenLabels(where, expr) {
  for (const label of FORBIDDEN_LABELS) {
    assert.doesNotMatch(expr, new RegExp(`\\b${label}\\b`), `${where} must not match on ${label}`);
  }
}

function assertMetricsRegistered(where, expr) {
  const tokens = metricTokens(expr);
  assert.ok(tokens.length > 0, `${where} has no recognizable metric`);
  for (const token of tokens) {
    assert.ok(isRegistered(token), `${where} uses unregistered metric ${token}`);
  }
}

const rulesText = await read("./observability/nuraai.rules.yml");
const ruleBlocks = rulesText.split(/-\s+alert:\s*/).slice(1);

test("alert rules encode the docs/22 tiers with real metric names only", () => {
  assert.ok(rulesText.includes("groups:"), "rules file has groups");
  assert.ok(ruleBlocks.length >= 12, `expected at least 12 rules, found ${ruleBlocks.length}`);
  const names = ruleBlocks.map((block) => block.split(/\r?\n/)[0].trim());
  for (const expected of [
    "refresh_token_reuse_total",
    "cross_team_access_denied_total",
    "http_requests_total",
    "queue_depth",
    "jobs_dead_total",
    "model_calls_total",
    "tool_calls_denied_total",
    "destination_denied_total",
    "auth_failures_total",
    "eip1271_failures_total",
    "approval_requests_total",
    "apikey_trust_ceiling_raised_total",
  ]) {
    assert.ok(rulesText.includes(expected), `rules file covers ${expected}`);
  }
  void names;
});

for (const block of ruleBlocks) {
  const alertName = block.split(/\r?\n/)[0].trim();
  test(`rule ${alertName} has for/severity/runbook and registered metrics`, () => {
    assert.match(block, /^\s*expr:\s*.+/m, `${alertName} needs expr:`);
    assert.match(block, /^\s*for:\s*.+/m, `${alertName} needs for:`);
    assert.match(block, /severity:\s*(page|ticket)/, `${alertName} needs severity: page|ticket`);
    assert.match(block, /summary:/, `${alertName} needs summary:`);
    assert.match(block, /description:/, `${alertName} needs description:`);
    assert.match(
      block,
      /runbook_url:\s*\S*26-runbook\.md#\S+/,
      `${alertName} needs runbook_url: to docs/26-runbook.md#...`,
    );
    const expr = block.match(/^\s*expr:\s*(.+)$/m)?.[1] ?? "";
    assertNoForbiddenLabels(alertName, expr);
    assertNoForbiddenLabels(alertName, block);
    assertMetricsRegistered(alertName, expr);
  });
}

for (const file of [
  "./observability/dashboards/security.json",
  "./observability/dashboards/service-health.json",
]) {
  test(`dashboard ${file} is valid Grafana with registered metrics only`, async () => {
    const text = await read(file);
    const dashboard = JSON.parse(text);
    assert.ok(typeof dashboard.uid === "string" && dashboard.uid.length > 0, "uid");
    assert.ok(typeof dashboard.title === "string" && dashboard.title.length > 0, "title");
    assert.ok(Array.isArray(dashboard.panels) && dashboard.panels.length > 0, "panels");
    assert.ok(
      Array.isArray(dashboard.templating?.list) &&
        dashboard.templating.list.some((entry) => entry.name === "datasource"),
      "Prometheus datasource templating",
    );
    assert.match(text, /prometheus/, "Prometheus datasource");
    assert.match(text, /\$\{datasource\}/, "panels use the templated datasource");
    for (const panel of dashboard.panels) {
      assert.ok(panel.title, "panel title");
      assert.ok(
        Array.isArray(panel.targets) && panel.targets.length > 0,
        `${panel.title} has targets`,
      );
      for (const target of panel.targets) {
        assert.ok(
          typeof target.expr === "string" && target.expr.length > 0,
          `${panel.title} target expr`,
        );
        assertNoForbiddenLabels(`${file} ${panel.title}`, target.expr);
        assertMetricsRegistered(`${file} ${panel.title}`, target.expr);
      }
    }
  });
}

test("security board covers the docs/22 security signals", async () => {
  const text = await read("./observability/dashboards/security.json");
  for (const expected of [
    "tool_calls_denied_total",
    "destination_denied_total",
    "auth_failures_total",
    "agent_permission_grant_rejected_total",
    "apikey_trust_ceiling_raised_total",
    "run_budget_exceeded_total",
  ]) {
    assert.ok(text.includes(expected), `security board covers ${expected}`);
  }
});

test("service-health board covers RED, queue, jobs, and model signals", async () => {
  const text = await read("./observability/dashboards/service-health.json");
  for (const expected of [
    "http_requests_total",
    "http_request_duration_ms_bucket",
    "queue_depth",
    "jobs_total",
    "job_retries_total",
    "jobs_dead_total",
    "jobs_reclaimed_total",
    "model_calls_total",
    "model_call_duration_seconds_bucket",
  ]) {
    assert.ok(text.includes(expected), `service-health board covers ${expected}`);
  }
});
