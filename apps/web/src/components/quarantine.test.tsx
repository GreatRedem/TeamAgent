import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import en from "../i18n/en.json";
import fa from "../i18n/fa.json";
import { escapeControls, Quarantine } from "./quarantine.js";

const hiddenCodes = [
  ...Array.from({ length: 32 }, (_, code) => code).filter((code) => code !== 9 && code !== 10),
  ...Array.from({ length: 33 }, (_, index) => 127 + index),
  173,
  1564,
  ...Array.from({ length: 5 }, (_, index) => 8203 + index),
  ...Array.from({ length: 7 }, (_, index) => 8232 + index),
  ...Array.from({ length: 16 }, (_, index) => 8288 + index),
  65279,
];

describe("quarantined text", () => {
  it.each(hiddenCodes)("renders hidden code point %i as visible uppercase notation", (code) => {
    const character = String.fromCodePoint(code);
    expect(escapeControls(`before${character}after`)).toBe(
      `before[U+${code.toString(16).toUpperCase().padStart(4, "0")}]after`,
    );
  });

  it("preserves printable Unicode, tabs, newlines and literal markup for React to escape", () => {
    const text = 'فارسی\tEnglish\n😀 <script>"&</script>';
    expect(escapeControls(text)).toBe(text);
    expect(escapeControls("")).toBe("");
  });

  it.each(["en", "fa"])(
    "SSR escapes markup and bidi controls and counts original code points in %s",
    async (language) => {
      const i18n = createInstance();
      await i18n.init({
        lng: language,
        fallbackLng: "en",
        resources: { en: { translation: en }, fa: { translation: fa } },
        interpolation: { escapeValue: false },
      });
      const text = '<script>alert("x")</script>&\u202Eabc\u2069😀\n';
      const markup = renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <Quarantine text={text} origin={'Stored <name> "origin"'} id="quarantined-name" />
        </I18nextProvider>,
      );
      expect(markup).toContain('id="quarantined-name"');
      expect(markup).toContain(
        '<pre tabindex="0" aria-label="Stored &lt;name&gt; &quot;origin&quot;">',
      );
      expect(markup).toContain(
        "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;[U+202E]abc[U+2069]😀\n",
      );
      expect(markup).not.toContain("<script>");
      expect(markup).not.toContain("\u202E");
      expect(markup).not.toContain("\u2069");
      const countText = new Intl.NumberFormat(language).format(Array.from(text).length);
      expect(markup).toContain(
        `<div class="quarantine-count">${i18n.t("agents.characters", { countText })}</div>`,
      );
    },
  );
});
