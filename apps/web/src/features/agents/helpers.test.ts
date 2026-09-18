import { describe, expect, it } from "vitest";
import { ApiError, NetworkError } from "../../lib/api.js";
import type { Agent, SourceGrant } from "../../lib/agents.js";
import {
  agentFailure,
  agentInput,
  BUDGET_FIELDS,
  makeAgentDraft,
  mergeGrantedResources,
  newSourceGrant,
  sourceRemovals,
  validAgentDraft,
  validDestination,
  validPositiveInteger,
  validSourceGrants,
} from "./helpers.js";

function storedAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    name: "Stored agent",
    model_id: "unavailable-model",
    system_prompt: "Stored prompt",
    settings: { temperature: 0.7, future: { enabled: true } },
    budgets: null,
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function grant(overrides: Partial<SourceGrant> = {}): SourceGrant {
  return { ...newSourceGrant("connection-1"), ...overrides };
}

describe("destinations and source grants", () => {
  it.each([
    "channel:123",
    "user@example.com",
    "https://example.com/channel",
    "کانال",
    "a".repeat(500),
  ])("accepts explicit destination %s", (value) => expect(validDestination(value)).toBe(true));

  it.each([
    "",
    " ",
    "a b",
    "a\tb",
    "a\nb",
    "a\u00a0b",
    "a".repeat(501),
    ...Array.from("*?[]{}\\", (character) => `channel${character}`),
    ...[0, 31, 127, 159, 173, 1564, 8203, 8207, 8232, 8238, 8288, 8303, 65279].map(
      (code) => `channel${String.fromCodePoint(code)}`,
    ),
  ])("rejects blank, wildcard, whitespace or hidden destination %j", (value) => {
    expect(validDestination(value)).toBe(false);
    expect(validSourceGrants([grant({ allowed_destinations: [value] })])).toBe(false);
  });

  it("defaults to reply-only with no allowlist", () => {
    expect(newSourceGrant("source-id")).toEqual({
      source_connection_id: "source-id",
      can_reply: true,
      can_initiate: false,
      allowed_destinations: [],
    });
    expect(validSourceGrants([grant()])).toBe(true);
    expect(validSourceGrants([])).toBe(true);
  });

  it("requires a nonempty valid allowlist for initiation even without reply permission", () => {
    expect(validSourceGrants([grant({ can_initiate: true })])).toBe(false);
    expect(
      validSourceGrants([
        grant({ can_reply: false, can_initiate: true, allowed_destinations: ["channel:1"] }),
      ]),
    ).toBe(true);
  });

  it("rejects duplicate destinations and connection grants", () => {
    expect(validSourceGrants([grant({ allowed_destinations: ["channel:1", "channel:1"] })])).toBe(
      false,
    );
    expect(validSourceGrants([grant(), grant({ can_reply: false })])).toBe(false);
    expect(
      validSourceGrants([
        grant({ allowed_destinations: ["channel:1"] }),
        grant({ source_connection_id: "connection-2", allowed_destinations: ["channel:1"] }),
      ]),
    ).toBe(true);
  });

  it("enforces grant and destination count limits at their boundaries", () => {
    const grants = Array.from({ length: 100 }, (_, index) => newSourceGrant(`connection-${index}`));
    expect(validSourceGrants(grants)).toBe(true);
    expect(validSourceGrants([...grants, newSourceGrant("extra")])).toBe(false);
    const allowed_destinations = Array.from({ length: 200 }, (_, index) => `channel:${index}`);
    expect(validSourceGrants([grant({ allowed_destinations })])).toBe(true);
    expect(
      validSourceGrants([grant({ allowed_destinations: [...allowed_destinations, "extra"] })]),
    ).toBe(false);
  });
});

describe("agent drafts and budgets", () => {
  it.each(["1", " 2 ", "120000", String(Number.MAX_SAFE_INTEGER)])(
    "accepts positive safe integer %j",
    (value) => {
      expect(validPositiveInteger(value)).toBe(true);
    },
  );

  it.each(["", " ", "0", "-1", "1.5", "NaN", "Infinity", "no", "9007199254740992"])(
    "rejects invalid budget %j in every field",
    (value) => {
      expect(validPositiveInteger(value)).toBe(false);
      for (const { key } of BUDGET_FIELDS) {
        const draft = makeAgentDraft(storedAgent());
        draft.budgets[key] = value;
        expect(validAgentDraft(draft)).toBe(false);
      }
    },
  );

  it("initializes defaults and handles null stored fields", () => {
    expect(makeAgentDraft()).toEqual({
      name: "",
      modelId: "",
      prompt: "",
      budgets: {
        max_model_iterations: "10",
        max_tool_calls: "10",
        max_wall_clock_ms: "120000",
        max_tokens: "50000",
      },
    });
    const draft = makeAgentDraft(storedAgent({ model_id: null, system_prompt: null }));
    expect(draft.modelId).toBe("");
    expect(draft.prompt).toBe("");
    expect(validAgentDraft(draft)).toBe(true);
  });

  it.each(BUDGET_FIELDS)(
    "reads $key and its legacy alias without mutating stored budgets",
    ({ key, alias, fallback }) => {
      expect(makeAgentDraft(storedAgent({ budgets: { [key]: 23 } })).budgets[key]).toBe("23");
      expect(
        makeAgentDraft(storedAgent({ budgets: { [key]: 23, [alias]: 12.9 } })).budgets[key],
      ).toBe("12");
      for (const value of [0, -1, NaN, Infinity, "23", null]) {
        expect(makeAgentDraft(storedAgent({ budgets: { [key]: value } })).budgets[key]).toBe(
          String(fallback),
        );
      }
    },
  );

  it("validates name and prompt boundaries", () => {
    const draft = makeAgentDraft(storedAgent());
    expect(validAgentDraft({ ...draft, name: " " })).toBe(false);
    expect(validAgentDraft({ ...draft, name: "a".repeat(200), prompt: "a".repeat(20000) })).toBe(
      true,
    );
    expect(validAgentDraft({ ...draft, name: "a".repeat(201) })).toBe(false);
    expect(validAgentDraft({ ...draft, prompt: "a".repeat(20001) })).toBe(false);
  });

  it("normalizes edited budgets but preserves unknown budgets and leaves settings untouched", () => {
    const budgets = Object.fromEntries(
      BUDGET_FIELDS.flatMap(({ key, alias }) => [
        [key, 8],
        [alias, 9],
      ]),
    );
    const agent = storedAgent({ budgets: { ...budgets, future_limit: { value: 42 } } });
    const before = structuredClone(agent);
    const draft = makeAgentDraft(agent);
    draft.name = "  Edited agent  ";
    draft.prompt = "  exact prompt\n";
    for (const { key } of BUDGET_FIELDS) draft.budgets[key] = "21";
    const input = agentInput(draft, agent);
    expect(input).toEqual({
      name: "Edited agent",
      model_id: "unavailable-model",
      system_prompt: "  exact prompt\n",
      budgets: {
        max_model_iterations: 21,
        max_tool_calls: 21,
        max_wall_clock_ms: 21,
        max_tokens: 21,
        future_limit: { value: 42 },
      },
    });
    expect(input).not.toHaveProperty("settings");
    expect(agent).toEqual(before);
    expect(agentInput({ ...draft, modelId: "" }).model_id).toBeNull();
  });
});

describe("grant preservation and removals", () => {
  it("retains unavailable grant IDs once and preserves catalog metadata and inputs", () => {
    const catalog = [{ id: "known", name: "Known", risk_tier: "high" }];
    const ids = ["known", "unknown", "unknown", "other"];
    expect(mergeGrantedResources(catalog, ids)).toEqual([
      ...catalog,
      { id: "unknown", name: "" },
      { id: "other", name: "" },
    ]);
    expect(catalog).toEqual([{ id: "known", name: "Known", risk_tier: "high" }]);
    expect(ids).toEqual(["known", "unknown", "unknown", "other"]);
    expect(mergeGrantedResources([], ids).map(({ id }) => id)).toEqual([
      "known",
      "unknown",
      "other",
    ]);
    expect(mergeGrantedResources(catalog, [])).toEqual(catalog);
  });

  it("reports a deleted source and all of its destinations", () => {
    expect(sourceRemovals([grant({ allowed_destinations: ["a", "b"] })], [])).toEqual([
      "connection-1",
      "a",
      "b",
    ]);
  });

  it.each(["can_reply", "can_initiate"] as const)(
    "reports revocation of %s and removed destinations",
    (permission) => {
      const before = grant({
        can_reply: true,
        can_initiate: true,
        allowed_destinations: ["a", "b"],
      });
      expect(
        sourceRemovals(
          [before],
          [{ ...before, [permission]: false, allowed_destinations: ["b", "c"] }],
        ),
      ).toEqual(["connection-1", "a"]);
    },
  );

  it("reports destination-only removals and does not report additions or reordering", () => {
    const before = grant({ allowed_destinations: ["a", "b"] });
    expect(sourceRemovals([before], [{ ...before, allowed_destinations: ["b"] }])).toEqual(["a"]);
    expect(
      sourceRemovals(
        [before],
        [
          { ...before, can_initiate: true, allowed_destinations: ["b", "a", "c"] },
          newSourceGrant("new"),
        ],
      ),
    ).toEqual([]);
    expect(sourceRemovals([], [before])).toEqual([]);
    expect(before.allowed_destinations).toEqual(["a", "b"]);
  });
});

describe("agent failures", () => {
  it.each([
    ["UNKNOWN_CONNECTION", 400, "unknownResource"],
    ["ALLOWLIST_REQUIRED", 400, "allowlist"],
    ["AGENT_IN_USE", 409, "inUse"],
    ["INVALID_INPUT", 400, "invalid"],
    ["NOT_FOUND", 404, "notFound"],
    ["UNKNOWN", 500, "failed"],
    ["UNKNOWN_CONNECTION", 403, "denied"],
    ["UNKNOWN_CONNECTION", 401, "expired"],
  ] as const)("maps %s/%i without exposing server text", (code, status, key) => {
    expect(agentFailure(new ApiError(code, status, "untrusted message", "request-1"))).toEqual({
      key,
      denied: status === 403,
      requestId: "request-1",
    });
  });

  it("distinguishes network failures from unexpected exceptions", () => {
    expect(agentFailure(new NetworkError())).toEqual({
      key: "network",
      denied: false,
      requestId: null,
    });
    expect(agentFailure(new Error("unexpected"))).toEqual({
      key: "failed",
      denied: false,
      requestId: null,
    });
  });
});
