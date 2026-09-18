import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import en from "../../i18n/en.json";
import fa from "../../i18n/fa.json";
import { LiveRegionsProvider } from "../../components/live-regions.js";
import { approval } from "./fixtures.js";
import {
  ApprovalEvidence,
  ApprovalError,
  ApprovalExpiry,
  ApprovalReview,
  ApprovalsBadge,
} from "./approvals.js";
import type { ApprovalsSnapshot } from "./store.js";

const mocked = vi.hoisted(() => ({ state: {} as ApprovalsSnapshot }));
vi.mock("./provider.js", () => ({
  useApprovals: () => ({ state: mocked.state, reload: vi.fn(), decide: vi.fn() }),
  useClock: () => Date.parse("2026-06-01T00:00:00Z"),
}));

beforeEach(() => {
  mocked.state = {
    kind: "ready",
    items: [approval()],
    error: null,
    refreshing: false,
    busyId: null,
    result: null,
  };
});

async function render(node: ReactNode, language = "en") {
  const i18n = createInstance();
  await i18n.init({
    lng: language,
    fallbackLng: "en",
    resources: { en: { translation: en }, fa: { translation: fa } },
    interpolation: { escapeValue: false },
  });
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <LiveRegionsProvider>{node}</LiveRegionsProvider>
    </I18nextProvider>,
  );
}

function keys(value: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, entry]) =>
    typeof entry === "object" && entry !== null
      ? keys(entry as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe("approval SSR evidence and controls", () => {
  it("has matching EN/FA approval translation keys", () => {
    expect(keys(en.approvals).sort()).toEqual(keys(fa.approvals).sort());
  });
  it.each(["en", "fa"])(
    "renders carried evidence as quarantined plain text in %s",
    async (language) => {
      const hostile = '<img src="https://example.invalid"> [click](https://example.invalid)\u202E';
      const item = approval({
        agent: { id: "agent", name: hostile },
        triggering_origin: { origin: hostile },
        triggering_content: hostile,
        proposed_action: {
          tool: hostile,
          risk_tier: "write",
          arguments: { text: hostile },
          resolved_destination: hostile,
        },
      });
      const markup = await render(<ApprovalEvidence item={item} now={0} />, language);
      expect(markup).not.toMatch(/<(img|a|script|button|input|textarea)\b/);
      expect(markup).toContain("&lt;img");
      expect(markup).toContain("[U+202E]");
      expect(markup).not.toContain("\u202E");
      expect(markup).toContain(
        language === "en" ? en.approvals.requestedUnverified : fa.approvals.requestedUnverified,
      );
      expect(markup).toContain(
        language === "en" ? en.approvals.sourceLimitation : fa.approvals.sourceLimitation,
      );
    },
  );
  it("shows missing metadata explicitly without inventing provenance", async () => {
    const markup = await render(
      <ApprovalEvidence
        item={approval({
          agent: null,
          triggering_origin: null,
          triggering_content: null,
          decision_reason: null,
          context_trust_level: null,
        })}
        now={0}
      />,
    );
    expect(markup).toContain(en.approvals.unavailable);
    expect(markup).toContain(en.approvals.reasons.unknown);
    expect(markup).toContain(en.approvals.trusts.unknown);
  });
  it("distinguishes locally elapsed pending from server-expired status", async () => {
    const markup = await render(
      <ApprovalExpiry item={approval({ expires_at: "2020-01-01T00:00:00Z" })} now={Date.now()} />,
    );
    expect(markup).toContain(en.approvals.elapsed);
    expect(markup).not.toContain(en.approvals.statuses.expired);
  });
  it.each(["loading", "error", "denied"] as const)(
    "does not show a zero badge for %s",
    async (kind) => {
      mocked.state = { ...mocked.state, kind, items: [] };
      const markup = await render(<ApprovalsBadge onNavigate={() => {}} />);
      expect(markup).not.toContain("0 actionable");
      expect(markup).toContain(
        kind === "denied"
          ? en.approvals.badgeDenied
          : kind === "error"
            ? en.approvals.badgeError
            : en.approvals.badgeUnknown,
      );
      expect(markup).toContain('<button type="button"');
    },
  );
  it("shows only actionable count in the header", async () => {
    mocked.state.items.push(
      approval({ id: "expired", expires_at: "2020-01-01T00:00:00Z" }),
      approval({ id: "bad", proposed_action: null }),
    );
    expect(await render(<ApprovalsBadge onNavigate={() => {}} />)).toContain(
      "1 actionable approvals in returned records",
    );
  });
  it("keeps known error references without displaying server text", async () => {
    const markup = await render(
      <ApprovalError
        error={{ key: "decided", requestId: "reference-123", denied: false, unknownOutcome: false }}
      />,
    );
    expect(markup).toContain("reference-123");
    expect(markup).toContain(en.approvals.errors.decided);
  });
  it.each(["expired", "invalid", "terminal", "unsafe", "busy"])(
    "disables approval for %s",
    async (kind) => {
      const item = approval(
        kind === "expired"
          ? { expires_at: "2020-01-01T00:00:00Z" }
          : kind === "invalid"
            ? { expires_at: "bad" }
            : kind === "terminal"
              ? { status: "approved" }
              : kind === "unsafe"
                ? { proposed_action: null }
                : {},
      );
      if (kind === "busy") mocked.state.busyId = item.id;
      const markup = await render(<ApprovalReview item={item} now={Date.now()} />);
      expect(markup).toMatch(/<button[^>]*class="button button-primary"[^>]*disabled=""/);
      expect(markup).not.toContain("<dialog");
      expect(markup).toContain('maxLength="2000"');
      expect(markup).not.toContain('name="note"');
      const quarantines =
        markup.match(
          /<div class="quarantine"[\s\S]*?<div class="quarantine-count">[\s\S]*?<\/div><\/div>/g,
        ) ?? [];
      expect(quarantines.length).toBeGreaterThan(0);
      for (const block of quarantines) expect(block).not.toMatch(/<(button|input|textarea|a)\b/);
    },
  );
  it("does not apply another selected request's decision result", async () => {
    mocked.state.result = {
      id: "different",
      kind: "error",
      error: {
        key: "outcomeUnknown",
        requestId: "other-reference",
        denied: false,
        unknownOutcome: true,
      },
    };
    const markup = await render(<ApprovalReview item={approval()} now={Date.now()} />);
    expect(markup).not.toContain("other-reference");
    expect(markup).not.toContain(en.approvals.errors.outcomeUnknown);
  });
});
