/**
 * Per-run budgets (docs/17 C10). Hard limits on token spend, tool-call
 * count, model iterations (recursion/fan-out depth in a single-agent loop),
 * and wall-clock duration. Enforced by the runtime on every iteration and
 * not adjustable from inside a run: the loop reads them from the pinned
 * agent snapshot, never from model output.
 */

export interface RunBudgets {
  maxModelIterations: number;
  maxToolCalls: number;
  maxWallClockMs: number;
  maxTokens: number;
}

export const DEFAULT_BUDGETS: RunBudgets = {
  maxModelIterations: 10,
  maxToolCalls: 10,
  maxWallClockMs: 120_000,
  maxTokens: 50_000,
};

const BUDGET_KEYS = ["maxModelIterations", "maxToolCalls", "maxWallClockMs", "maxTokens"] as const;

/** The API speaks snake_case; stored snapshots may hold either convention. */
const SNAKE_CASE_KEYS: Record<(typeof BUDGET_KEYS)[number], string> = {
  maxModelIterations: "max_model_iterations",
  maxToolCalls: "max_tool_calls",
  maxWallClockMs: "max_wall_clock_ms",
  maxTokens: "max_tokens",
};

/**
 * Lenient parse: known keys with positive finite numbers win, everything
 * else falls back to defaults. Unknown keys are ignored rather than
 * rejected so older snapshots keep parsing after new limits are added.
 */
export function parseBudgets(raw: unknown): RunBudgets {
  const budgets = { ...DEFAULT_BUDGETS };
  if (typeof raw !== "object" || raw === null) return budgets;
  const record = raw as Record<string, unknown>;
  for (const key of BUDGET_KEYS) {
    const value = record[key] ?? record[SNAKE_CASE_KEYS[key]];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      budgets[key] = Math.floor(value);
    }
  }
  return budgets;
}

export interface BudgetUsage {
  modelIterations: number;
  toolCalls: number;
  tokensTotal: number;
  startedAtMs: number;
}

export type BudgetVerdict =
  | "ok"
  | "model-iterations-exceeded"
  | "tool-calls-exceeded"
  | "tokens-exceeded"
  | "wall-clock-exceeded";

export function checkBudgets(
  budgets: RunBudgets,
  usage: BudgetUsage,
  nowMs: number,
): BudgetVerdict {
  if (usage.modelIterations >= budgets.maxModelIterations) return "model-iterations-exceeded";
  if (usage.toolCalls >= budgets.maxToolCalls) return "tool-calls-exceeded";
  if (usage.tokensTotal >= budgets.maxTokens) return "tokens-exceeded";
  if (nowMs - usage.startedAtMs >= budgets.maxWallClockMs) return "wall-clock-exceeded";
  return "ok";
}
