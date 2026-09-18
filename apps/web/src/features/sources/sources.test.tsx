import { createInstance } from "i18next";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { ConfirmDialog } from "../../components/confirm-dialog.js";
import { Quarantine } from "../../components/quarantine.js";
import en from "../../i18n/en.json";
import fa from "../../i18n/fa.json";
import type { Source, SourceConnection } from "../../lib/sources.js";
import { ConnectionList, SourceDate, SourceError, SourceForm, SourcesView } from "./sources.js";
import { createSourcesStore, type SourcesSnapshot } from "./store.js";

const hostile = '<img src="https://example.invalid">[click](https://example.invalid)\u202E';
const source: Source = {
  id: "source-id",
  name: hostile,
  kind: hostile,
  status: "active",
  has_webhook: true,
  created_at: "2026-06-01T12:00:00Z",
};
const connection: SourceConnection = {
  id: "connection-id",
  name: hostile,
  owner_scope: "user",
  status: hostile,
  created_at: source.created_at,
};
const store = createSourcesStore({
  permissions: async () => ({ permissions: [] }),
  list: async () => ({ sources: [] }),
  get: async () => source,
  connections: async () => ({ connections: [] }),
  create: async () => ({ id: "new" }),
  update: async () => source,
  connect: async () => ({ id: "new" }),
  disconnect: async () => ({}),
});
function snapshot(patch: Partial<SourcesSnapshot> = {}): SourcesSnapshot {
  return {
    kind: "ready",
    permissions: ["source.read", "source.connect", "source.disconnect"],
    selection: null,
    sources: [source],
    source: null,
    connections: [],
    error: null,
    result: null,
    busy: false,
    revision: 0,
    ...patch,
  };
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
function view(state: SourcesSnapshot) {
  return <SourcesView state={state} store={store} teamName={hostile} teamId="team-id" />;
}
function keys(value: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, item]) =>
    typeof item === "object" && item !== null
      ? keys(item as Record<string, unknown>, `${prefix}${key}.`)
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
  }
}

describe("Sources SSR", () => {
  it("keeps EN/FA copy keys aligned", () =>
    expect(keys(en.sources).sort()).toEqual(keys(fa.sources).sort()));
  it.each(["en", "fa"])(
    "quarantines carried values and states registry limitations in %s",
    async (language) => {
      const copy = language === "en" ? en.sources : fa.sources;
      const markup = await render(
        view(snapshot({ source, selection: source.id, connections: [connection] })),
        language,
      );
      expect(markup).not.toMatch(/<(img|a|script)\b/);
      expect(markup).toContain("&lt;img");
      expect(markup).toContain("[U+202E]");
      expect(markup.replace(/<input\b[^>]*>/g, "")).not.toContain("\u202E");
      expect(markup).toContain(copy.registryOnly);
      expect(markup).toContain(copy.limits);
      expect(markup).toContain(copy.teamOnly.replaceAll("'", "&#x27;"));
      expect(markup).toContain(copy.connectionStatusHelp);
      expect(markup).toContain(copy.owners.user);
      expect(markup).toContain(copy.webhookPresent);
      expect(markup).not.toMatch(
        /name="(config|credential_ref|webhook_secret_ref|user_id|owner_scope)"/,
      );
      quarantines(markup);
      expect(markup).not.toMatch(/>sources\.[^<]+</);
    },
  );
  it.each(Array.from({ length: 8 }, (_, mask) => mask))(
    "renders independently permitted controls for mask %s",
    async (mask) => {
      const permissions = ["source.read", "source.connect", "source.disconnect"].filter(
        (_, index) => mask & (1 << index),
      );
      const list = await render(view(snapshot({ permissions, sources: mask & 1 ? [source] : [] })));
      expect(list.includes(en.sources.create)).toBe(Boolean(mask & 2));
      expect(list.includes("Open source 1")).toBe(Boolean(mask & 1));
      if (mask & 1) {
        const detail = await render(
          view(snapshot({ permissions, source, selection: source.id, connections: [connection] })),
        );
        expect(detail.includes(en.sources.save)).toBe(Boolean(mask & 2));
        expect(detail.includes(en.sources.createConnection)).toBe(Boolean(mask & 2));
        expect(detail.includes("Remove connection 1")).toBe(Boolean(mask & 4));
      }
    },
  );
  it("distinguishes loading, empty, denied and failed states", async () => {
    expect(await render(view(snapshot({ kind: "loading" })))).toContain(en.sources.loading);
    expect(await render(view(snapshot({ sources: [] })))).toContain(en.sources.empty);
    const denied = await render(view(snapshot({ permissions: [], sources: [] })));
    expect(denied).toContain("source-denied");
    expect(denied).toContain("source.read");
    expect(denied).not.toContain("<form");
    const failed = await render(
      view(
        snapshot({ kind: "error", error: { key: "load", denied: false, requestId: "load-id" } }),
      ),
    );
    expect(failed).toContain("load-id");
    expect(failed).toContain(en.sources.errors.load);
    expect(failed).not.toContain(en.sources.empty);
    expect(failed).not.toContain("<table");
    expect(failed).not.toContain("<form");
  });
  it("preserves request references for denial and in-use failures", async () => {
    for (const key of ["denied", "inUse"] as const) {
      const markup = await render(
        <SourceError error={{ key, denied: key === "denied", requestId: "reference-123" }} />,
      );
      expect(markup).toContain("reference-123");
      expect(markup).toContain(en.sources.errors[key].replaceAll("'", "&#x27;"));
      expect(markup.includes("source-denied")).toBe(key === "denied");
      quarantines(markup);
    }
  });
  it.each([true, false])("locks mutations for busy/unknown outcomes: busy=%s", async (busy) => {
    const markup = await render(
      view(
        snapshot({
          source,
          selection: source.id,
          connections: [connection],
          busy,
          result: busy ? null : { key: "unknown", denied: false, requestId: "unknown-reference" },
        }),
      ),
    );
    expect(markup).toContain('<fieldset disabled="">');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Remove connection 1<\/button>/);
    if (!busy) {
      expect(markup).toContain(en.sources.errors.unknown);
      expect(markup).toMatch(
        /<button type="button" class="button">Reload records and access<\/button>/,
      );
    }
  });
  it("renders native constraints without errors on a fresh creation form", async () => {
    const markup = await render(<SourceForm blocked={false} onSave={async () => {}} />);
    expect(markup).toContain('maxLength="200"');
    expect(markup).toContain('maxLength="100"');
    expect(markup).toContain('pattern=".*\\S.*"');
    expect(markup).not.toContain('aria-invalid="true"');
    expect(markup).not.toContain("<select");
    quarantines(markup);
  });
  it("edits only name and active/disabled availability", async () => {
    const markup = await render(
      <SourceForm
        source={{ ...source, status: "disabled" }}
        blocked={false}
        onSave={async () => {}}
      />,
    );
    expect(markup).not.toContain('name="type"');
    expect(markup).toContain('<option value="disabled" selected="">');
    expect(markup.match(/<option /g)).toHaveLength(2);
    expect(markup).not.toContain("textarea");
  });
  it("does not invent ownership or a health label for unknown values", async () => {
    const markup = await render(
      <ConnectionList
        connections={[{ ...connection, owner_scope: hostile }]}
        canRemove={false}
        blocked={false}
        onRemove={() => {}}
      />,
    );
    expect(markup).toContain(en.sources.owners.unknown);
    expect(markup).not.toContain("<button");
    quarantines(markup);
  });
  it("uses the existing native destructive dialog with controls outside quarantine", async () => {
    const markup = await render(
      <ConfirmDialog
        title={en.sources.confirmRemove}
        confirmLabel={en.sources.remove}
        busy={false}
        onClose={() => {}}
        onConfirm={() => {}}
      >
        <Quarantine text={hostile} origin={en.sources.connectionRecord} />
        <p>{en.sources.removeHelp}</p>
      </ConfirmDialog>,
    );
    expect(markup).toContain("<dialog");
    expect(markup).toContain("aria-labelledby=");
    expect(markup).toContain(en.sources.removeHelp);
    expect(markup).toContain("autofocus=");
    quarantines(markup);
  });
  it.each(["en", "fa"])(
    "renders Intl dates and handles malformed timestamps in %s",
    async (language) => {
      const markup = await render(<SourceDate value={source.created_at} />, language);
      expect(markup).toContain(
        new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(
          new Date(source.created_at),
        ),
      );
      const invalid = await render(<SourceDate value="bad" />, language);
      expect(invalid).not.toContain("<time");
      expect(invalid).toContain(
        language === "en" ? en.sources.unavailableDate : fa.sources.unavailableDate,
      );
    },
  );
});
