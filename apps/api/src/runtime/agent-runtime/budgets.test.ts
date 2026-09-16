import { describe, expect, it } from "vitest";
import { checkBudgets, DEFAULT_BUDGETS, parseBudgets, type BudgetUsage } from "./budgets.js";

const usage: BudgetUsage = {
  modelIterations: 1,
  toolCalls: 1,
  tokensTotal: 100,
  startedAtMs: 1000,
};

describe("budget parsing", () => {
  it("accepts known positive limits and defaults everything else", () => {
    expect(parseBudgets(null)).toEqual(DEFAULT_BUDGETS);
    expect(parseBudgets({ maxToolCalls: 3, unknownFutureLimit: 9 })).toMatchObject({
      maxToolCalls: 3,
      maxModelIterations: DEFAULT_BUDGETS.maxModelIterations,
    });
    expect(parseBudgets({ maxTokens: 0, maxWallClockMs: -5 })).toEqual(DEFAULT_BUDGETS);
    expect(parseBudgets({ maxModelIterations: 2.7 })).toMatchObject({ maxModelIterations: 2 });
    // The API speaks snake_case; both conventions parse.
    expect(parseBudgets({ max_tool_calls: 3, max_tokens: 100 })).toMatchObject({
      maxToolCalls: 3,
      maxTokens: 100,
    });
  });
});

describe("budget enforcement", () => {
  it("passes healthy usage and names each exceeded limit", () => {
    expect(checkBudgets(DEFAULT_BUDGETS, usage, 2000)).toBe("ok");
    expect(checkBudgets(DEFAULT_BUDGETS, { ...usage, modelIterations: 10 }, 2000)).toBe(
      "model-iterations-exceeded",
    );
    expect(checkBudgets(DEFAULT_BUDGETS, { ...usage, toolCalls: 10 }, 2000)).toBe(
      "tool-calls-exceeded",
    );
    expect(checkBudgets(DEFAULT_BUDGETS, { ...usage, tokensTotal: 50_000 }, 2000)).toBe(
      "tokens-exceeded",
    );
    expect(checkBudgets(DEFAULT_BUDGETS, usage, 1000 + 120_000)).toBe("wall-clock-exceeded");
  });
});
