import { useTranslation } from "react-i18next";
import "./quarantine.css";

export function escapeControls(value: string): string {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0)!;
    const hidden =
      (code < 32 && code !== 9 && code !== 10) ||
      (code >= 127 && code <= 159) ||
      code === 173 ||
      code === 1564 ||
      (code >= 8203 && code <= 8207) ||
      (code >= 8232 && code <= 8238) ||
      (code >= 8288 && code <= 8303) ||
      code === 65279;
    return hidden ? `[U+${code.toString(16).toUpperCase().padStart(4, "0")}]` : character;
  }).join("");
}

export function Quarantine({ text, origin, id }: { text: string; origin: string; id?: string }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="quarantine" id={id}>
      <div className="quarantine-origin">{origin}</div>
      <pre tabIndex={0} aria-label={origin}>
        {escapeControls(text)}
      </pre>
      <div className="quarantine-count">
        {t("agents.characters", {
          countText: new Intl.NumberFormat(i18n.language).format(Array.from(text).length),
        })}
      </div>
    </div>
  );
}
