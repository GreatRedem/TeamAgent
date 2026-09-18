import { ApiError, NetworkError } from "../../lib/api.js";
import type { Agent, AgentInput, Resource, SourceGrant } from "../../lib/agents.js";

export const BUDGET_FIELDS = [
  { key: "max_model_iterations", alias: "maxModelIterations", fallback: 10 },
  { key: "max_tool_calls", alias: "maxToolCalls", fallback: 10 },
  { key: "max_wall_clock_ms", alias: "maxWallClockMs", fallback: 120000 },
  { key: "max_tokens", alias: "maxTokens", fallback: 50000 },
] as const;
export type BudgetKey = (typeof BUDGET_FIELDS)[number]["key"];
export interface AgentDraft {
  name: string;
  modelId: string;
  prompt: string;
  budgets: Record<BudgetKey, string>;
}

export function makeAgentDraft(agent?: Agent): AgentDraft {
  const budgets = {} as Record<BudgetKey, string>;
  for (const field of BUDGET_FIELDS) {
    const raw = agent?.budgets?.[field.alias] ?? agent?.budgets?.[field.key];
    budgets[field.key] = String(
      typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : field.fallback,
    );
  }
  return {
    name: agent?.name ?? "",
    modelId: agent?.model_id ?? "",
    prompt: agent?.system_prompt ?? "",
    budgets,
  };
}

export function validPositiveInteger(value: string): boolean {
  return value.trim() !== "" && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

export function validAgentDraft(draft: AgentDraft): boolean {
  return (
    draft.name.trim().length > 0 &&
    draft.name.length <= 200 &&
    draft.prompt.length <= 20000 &&
    BUDGET_FIELDS.every(({ key }) => validPositiveInteger(draft.budgets[key]))
  );
}

export function agentInput(draft: AgentDraft, agent?: Agent): AgentInput {
  const budgets = { ...agent?.budgets };
  for (const field of BUDGET_FIELDS) {
    delete budgets[field.alias];
    budgets[field.key] = Number(draft.budgets[field.key]);
  }
  return {
    name: draft.name.trim(),
    model_id: draft.modelId || null,
    system_prompt: draft.prompt,
    budgets,
  };
}

export function mergeGrantedResources<T extends Resource>(
  catalog: T[],
  grantedIds: string[],
): (T | Resource)[] {
  const known = new Set(catalog.map((item) => item.id));
  return [
    ...catalog,
    ...[...new Set(grantedIds)].filter((id) => !known.has(id)).map((id) => ({ id, name: "" })),
  ];
}

export function newSourceGrant(id: string): SourceGrant {
  return {
    source_connection_id: id,
    can_reply: true,
    can_initiate: false,
    allowed_destinations: [],
  };
}

export function validDestination(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 500 &&
    !/\s/u.test(value) &&
    !Array.from(value).some((character) => {
      const code = character.codePointAt(0)!;
      return (
        "*?[]{}\\".includes(character) ||
        code < 32 ||
        (code >= 127 && code <= 159) ||
        code === 173 ||
        code === 1564 ||
        (code >= 8203 && code <= 8207) ||
        (code >= 8232 && code <= 8238) ||
        (code >= 8288 && code <= 8303) ||
        code === 65279
      );
    })
  );
}

export function validSourceGrants(grants: SourceGrant[]): boolean {
  return (
    grants.length <= 100 &&
    new Set(grants.map((g) => g.source_connection_id)).size === grants.length &&
    grants.every(
      (g) =>
        (!g.can_initiate || g.allowed_destinations.length > 0) &&
        g.allowed_destinations.length <= 200 &&
        new Set(g.allowed_destinations).size === g.allowed_destinations.length &&
        g.allowed_destinations.every(validDestination),
    )
  );
}

export function sourceRemovals(before: SourceGrant[], after: SourceGrant[]): string[] {
  return before.flatMap((old) => {
    const next = after.find((g) => g.source_connection_id === old.source_connection_id);
    if (!next) return [old.source_connection_id, ...old.allowed_destinations];
    return [
      ...((old.can_reply && !next.can_reply) || (old.can_initiate && !next.can_initiate)
        ? [old.source_connection_id]
        : []),
      ...old.allowed_destinations.filter((d) => !next.allowed_destinations.includes(d)),
    ];
  });
}

export interface AgentFailure {
  key: string;
  denied: boolean;
  requestId: string | null;
}

export function agentFailure(error: unknown): AgentFailure {
  if (error instanceof ApiError) {
    const keys: Record<string, string> = {
      AGENT_IN_USE: "inUse",
      UNKNOWN_MODEL: "unknownResource",
      UNKNOWN_PERMISSION: "unknownResource",
      UNKNOWN_TOOL: "unknownResource",
      UNKNOWN_KNOWLEDGE_BASE: "unknownResource",
      UNKNOWN_CONNECTION: "unknownResource",
      ALLOWLIST_REQUIRED: "allowlist",
      INVALID_INPUT: "invalid",
      NOT_FOUND: "notFound",
      FORBIDDEN: "denied",
    };
    return {
      key:
        error.status === 403
          ? "denied"
          : error.status === 401
            ? "expired"
            : (keys[error.code] ?? "failed"),
      denied: error.status === 403,
      requestId: error.requestId,
    };
  }
  return {
    key: error instanceof NetworkError ? "network" : "failed",
    denied: false,
    requestId: null,
  };
}
