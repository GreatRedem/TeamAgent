import { describe, expect, it } from "vitest";
import { collectStepReferences, renderTemplate, TemplateReferenceError } from "./template.js";

const context = {
  steps: { triage: { text: "refund", score: 3 }, fetch: { url: "https://example.com/" } },
  input: { customer: "ex-9", nested: { deep: true } },
};

describe("template renderer", () => {
  it("leaves plain values alone and interpolates embedded placeholders", () => {
    expect(renderTemplate("hello", context)).toBe("hello");
    expect(renderTemplate(42, context)).toBe(42);
    expect(renderTemplate(null, context)).toBe(null);
    expect(renderTemplate("case ${input.customer} scored ${steps.triage.score}", context)).toBe(
      "case ex-9 scored 3",
    );
  });

  it("preserves types for lone placeholders and stringifies objects inline", () => {
    expect(renderTemplate("${steps.triage}", context)).toEqual({ text: "refund", score: 3 });
    expect(renderTemplate("${input.nested.deep}", context)).toBe(true);
    expect(renderTemplate("got ${steps.triage}", context)).toBe('got {"text":"refund","score":3}');
  });

  it("renders nested structures and throws on unknown references", () => {
    expect(
      renderTemplate({ url: "${steps.fetch.url}", tags: ["${input.customer}", 1] }, context),
    ).toEqual({ url: "https://example.com/", tags: ["ex-9", 1] });
    expect(() => renderTemplate("${steps.missing.text}", context)).toThrow(TemplateReferenceError);
    expect(() => renderTemplate("${input.missing.deep}", context)).toThrow(TemplateReferenceError);
    // A steps key nested under input must not resolve against the steps map.
    expect(() => renderTemplate("${input.steps}", { steps: {}, input: {} })).toThrow(
      TemplateReferenceError,
    );
  });

  it("collects step references for publish-time checking", () => {
    expect(
      collectStepReferences({ a: "${steps.triage.text}", b: ["${steps.fetch.url}", "${input.x}"] }),
    ).toEqual(expect.arrayContaining(["triage", "fetch"]));
    expect(collectStepReferences("no refs")).toEqual([]);
  });
});
