import { createInstance } from "i18next";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import en from "../../i18n/en.json";
import fa from "../../i18n/fa.json";
import type { KnowledgeItemDetail } from "../../lib/knowledge.js";
import {
  BaseForm,
  IngestionForm,
  KnowledgeDate,
  KnowledgeError,
  KnowledgeView,
  TrustConfirmation,
} from "./knowledge.js";
import { createKnowledgeStore, type KnowledgeSnapshot } from "./store.js";

const hostile = '<img src="https://example.invalid">[click](https://example.invalid)\u202e';
const item: KnowledgeItemDetail = {
  id: "item-id",
  knowledge_base_id: "base-id",
  title: hostile,
  content: `  \n${hostile}\n${"whole content ".repeat(1000)}END  `,
  metadata: { hostile, nested: ["retained"] },
  trust_level: "untrusted",
  trusted_by: "trusting-user-id",
  trusted_at: "2026-09-18T12:00:00.123456Z",
  ingested_from: hostile,
  ingested_by: "ingesting-user-id",
  created_at: "2026-09-18T11:00:00.654321Z",
};
const base = {
  id: "base-id",
  name: hostile,
  description: hostile,
  type: hostile,
  created_at: item.created_at,
};
const store = createKnowledgeStore({
  permissions: async () => ({ permissions: [] }),
  bases: async () => ({ knowledge_bases: [] }),
  items: async () => ({ items: [], next_cursor: null, has_more: false }),
  detail: async () => item,
  create: async () => ({}),
  ingest: async () => ({}),
  trust: async () => ({}),
});
function snapshot(patch: Partial<KnowledgeSnapshot> = {}): KnowledgeSnapshot {
  return {
    ...store.getSnapshot(),
    kind: "ready",
    permissions: ["knowledge.read", "knowledge.write"],
    bases: [base],
    ...patch,
  };
}
function detail(patch: Partial<KnowledgeSnapshot> = {}) {
  return snapshot({ baseId: base.id, itemId: item.id, items: [item], detail: item, ...patch });
}
function view(state: KnowledgeSnapshot) {
  return <KnowledgeView state={state} store={store} teamId="team-id" teamName={hostile} />;
}
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
      <div dir={language === "fa" ? "rtl" : "ltr"}>{node}</div>
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
function quarantines(markup: string) {
  const blocks =
    markup.match(
      /<div class="quarantine"[\s\S]*?<div class="quarantine-count">[\s\S]*?<\/div><\/div>/g,
    ) ?? [];
  expect(blocks.length).toBeGreaterThan(0);
  for (const block of blocks) {
    expect(block).not.toMatch(/<(button|input|select|textarea|a|img|script)\b/);
    expect(block).toContain('class="quarantine-origin"');
    expect(block).toContain('class="quarantine-count"');
    expect(block).toContain('tabindex="0"');
  }
}

describe("Knowledge SSR", () => {
  it("keeps every EN/FA copy key aligned", () =>
    expect(keys(en.knowledge).sort()).toEqual(keys(fa.knowledge).sort()));
  it.each(["en", "fa"])(
    "quarantines base fields and states exact scope limitations in %s",
    async (language) => {
      const copy = language === "en" ? en.knowledge : fa.knowledge;
      const markup = await render(view(snapshot()), language);
      expect(markup).toContain(copy.limits);
      expect(markup).toContain("&lt;img");
      expect(markup).toContain("[U+202E]");
      expect(markup).not.toMatch(/<(img|a|script)\b/);
      expect(markup).not.toContain("\u202e");
      expect(markup).toContain('<th scope="col">');
      expect(markup).toContain(language === "fa" ? 'dir="rtl"' : 'dir="ltr"');
      expect(markup).not.toMatch(/>knowledge\.[^<]+</);
      quarantines(markup);
    },
  );
  it.each(["en", "fa"])(
    "shows complete raw content, metadata and all provenance together even when trusted in %s",
    async (language) => {
      const copy = language === "en" ? en.knowledge : fa.knowledge;
      const trusted = { ...item, trust_level: "trusted" };
      const markup = await render(view(detail({ detail: trusted, items: [trusted] })), language);
      expect(markup).toContain("whole content ".repeat(1000));
      expect(markup).toContain("END  </pre>");
      expect(markup).toContain("retained");
      expect(markup).toContain(item.ingested_by!);
      expect(markup).toContain(item.trusted_by!);
      expect(markup).toContain(item.trusted_at!);
      expect(markup).toContain(copy.provenanceHelp);
      expect(markup).toContain(copy.trustHelp);
      expect(markup).toContain(copy.revokeTrust);
      expect(markup).not.toContain(copy.markTrusted);
      expect(markup).not.toMatch(/<(img|a|script)\b/);
      expect(markup).not.toContain("\u202e");
      expect(markup).not.toMatch(/>knowledge\.[^<]+</);
      quarantines(markup);
    },
  );
  it.each(["en", "fa"])(
    "explicitly labels null provenance and attribution unknown in %s",
    async (language) => {
      const copy = language === "en" ? en.knowledge : fa.knowledge;
      const unknown = {
        ...item,
        title: null,
        trusted_by: null,
        trusted_at: null,
        ingested_from: null,
        ingested_by: null,
        metadata: null,
      };
      const markup = await render(view(detail({ detail: unknown, items: [unknown] })), language);
      expect(markup.split(copy.unknown).length).toBeGreaterThan(6);
      expect(markup).not.toContain("trusting-user-id");
      expect(markup).not.toContain("ingesting-user-id");
      expect(markup).toContain(copy.provenanceHelp);
    },
  );
  it.each([0, 1, 2, 3])("gates reads and writes independently for mask %s", async (mask) => {
    const permissions = ["knowledge.read", "knowledge.write"].filter(
      (_, index) => mask & (1 << index),
    );
    const markup = await render(view(snapshot({ permissions })));
    expect(markup.includes(en.knowledge.createBase)).toBe(Boolean(mask & 2));
    expect(markup.includes("Open base 1")).toBe(Boolean(mask & 1));
    const reviewed = await render(view(detail({ permissions })));
    expect(reviewed.includes(en.knowledge.ingest)).toBe(mask === 3);
    if (!(mask & 1)) expect(reviewed).not.toContain("END  </pre>");
    if (mask === 1)
      expect(reviewed).toMatch(/<button[^>]*disabled=""[^>]*>Mark this item trusted<\/button>/);
    if (mask === 3)
      expect(reviewed).toMatch(
        /<button type="button" class="button">Mark this item trusted<\/button>/,
      );
  });
  it("distinguishes loading, empty, denied and failed states", async () => {
    expect(await render(view(snapshot({ kind: "loading" })))).toContain(en.knowledge.loading);
    expect(await render(view(snapshot({ bases: [] })))).toContain(en.knowledge.emptyBases);
    expect(await render(view(snapshot({ baseId: base.id, items: [] })))).toContain(
      en.knowledge.emptyItems,
    );
    const denied = await render(view(snapshot({ permissions: [] })));
    expect(denied).toContain("knowledge-denied");
    expect(denied).toContain(en.knowledge.deniedRead);
    expect(denied).not.toContain("<table");
    expect(denied).not.toContain("<form");
    const error = await render(
      view(detail({ kind: "error", error: { key: "load", requestId: "read-ref" } })),
    );
    expect(error).toContain("read-ref");
    expect(error).not.toContain("END  </pre>");
    expect(error).not.toContain("<table");
    expect(error).not.toContain("<form");
  });
  it.each([
    { detail: null },
    { detail: { ...item, id: "wrong" } },
    { detail: { ...item, knowledge_base_id: "wrong" } },
    { detail: { ...item, content: undefined } as never },
    { detailLoading: true },
    { detailError: { key: "load" as const, requestId: "detail-ref" } },
  ])("does not expose previous or incomplete detail %#", async (patch) => {
    const markup = await render(view(detail(patch)));
    expect(markup).not.toContain("END  </pre>");
    expect(markup).not.toContain(en.knowledge.markTrusted);
  });
  it.each([
    { busy: true },
    { pageLoading: true },
    { pageError: { key: "cursor" as const, requestId: "page-ref" } },
    { result: { key: "unknown" as const, requestId: "unknown-ref" } },
  ])("blocks trust and ingestion during pending or failed work %#", async (patch) => {
    const markup = await render(view(detail(patch)));
    expect(markup).toContain('<fieldset disabled="">');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Mark this item trusted<\/button>/);
  });
  it("shows success separately from authoritative refresh failure", async () => {
    const markup = await render(
      view(
        detail({
          kind: "error",
          result: "trusted",
          error: { key: "load", requestId: "refresh-ref" },
          detail: null,
          items: [],
        }),
      ),
    );
    expect(markup).toContain(en.knowledge.results.trusted);
    expect(markup).toContain(en.knowledge.errors.load);
    expect(markup).toContain("refresh-ref");
    expect(markup).not.toContain(en.knowledge.markTrusted);
  });
  it("fails closed on unknown trust enums without interpolating raw enum as chrome", async () => {
    const markup = await render(
      view(
        detail({
          detail: { ...item, trust_level: hostile },
          items: [{ ...item, trust_level: hostile }],
        }),
      ),
    );
    expect(markup).toContain(en.knowledge.unknownTrust);
    expect(markup).toContain(en.knowledge.trust.unknown);
    expect(markup).not.toContain(en.knowledge.markTrusted);
    expect(markup).not.toContain(en.knowledge.revokeTrust);
  });
  it.each(["en", "fa"])(
    "provides native Cancel-default, item-bound trust/revoke confirmations in %s",
    async (language) => {
      const copy = language === "en" ? en.knowledge : fa.knowledge;
      const cancel = language === "en" ? en.agents.cancel : fa.agents.cancel;
      for (const trusted of [true, false]) {
        const markup = await render(
          <TrustConfirmation
            item={item}
            trusted={trusted}
            busy={false}
            onClose={() => {}}
            onConfirm={() => {}}
          />,
          language,
        );
        expect(markup).toContain("<dialog");
        expect(markup).toContain("aria-labelledby=");
        expect(markup).toMatch(new RegExp(`<button[^>]*autofocus=""[^>]*>${cancel}</button>`));
        expect(markup).toContain(item.id);
        expect(markup).toContain(item.knowledge_base_id);
        expect(markup).toContain(trusted ? copy.trustConsequence : copy.revokeConsequence);
        expect(markup.indexOf(cancel)).toBeLessThan(
          markup.lastIndexOf(trusted ? copy.markTrusted : copy.revokeTrust),
        );
        quarantines(markup);
      }
    },
  );
  it("renders native constrained forms without fresh validation errors, uploads or metadata editor", async () => {
    const baseForm = await render(<BaseForm blocked={false} onSave={async () => {}} />);
    expect(baseForm).toContain('maxLength="200"');
    expect(baseForm).toContain('maxLength="2000"');
    expect(baseForm).toContain('pattern=".*\\S.*"');
    const ingestion = await render(<IngestionForm blocked={false} onSave={async () => {}} />);
    expect(ingestion).toContain('maxLength="100000"');
    expect(ingestion).toContain('maxLength="500"');
    expect(ingestion).toContain('maxLength="2000"');
    expect(ingestion).toMatch(/<textarea[^>]*name="content"[^>]*required=""/);
    expect(ingestion).not.toMatch(/name="(metadata|trusted|ingested_by)"|type="file"/);
    expect(baseForm + ingestion).not.toContain('aria-invalid="true"');
    quarantines(baseForm + ingestion);
  });
  it.each(["en", "fa"])(
    "renders UTC six-digit timestamp values with localized Intl display in %s",
    async (language) => {
      const markup = await render(<KnowledgeDate value={item.created_at} />, language);
      expect(markup).toContain(
        new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "long" }).format(
          new Date(item.created_at),
        ),
      );
      expect(markup).toContain(`dateTime="${item.created_at}"`);
      for (const value of [null, "bad"]) {
        const unknown = await render(<KnowledgeDate value={value} />, language);
        expect(unknown).not.toContain("<time");
        expect(unknown).toContain(language === "en" ? en.knowledge.unknown : fa.knowledge.unknown);
      }
    },
  );
  it.each(["denied", "cursor", "unknown", "notFound"] as const)(
    "retains request references for %s without raw server prose",
    async (key) => {
      const markup = await render(<KnowledgeError error={{ key, requestId: "request-ref" }} />);
      expect(markup).toContain("request-ref");
      expect(markup).toContain(en.knowledge.errors[key]);
      expect(markup.includes("knowledge-denied")).toBe(key === "denied");
    },
  );
});
