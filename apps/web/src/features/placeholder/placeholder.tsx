import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * Placeholder for nav areas whose screens have not been built yet. The API
 * surface for them exists; each arrives with its own slice and real states.
 * The placeholder exists so the shell's navigation is real from day one --
 * dead links are worse than honest stubs -- and so the screen inventory in
 * docs/25-ui-information.md is the checklist that retires them one by one.
 */
export function PlaceholderScreen({ screen }: { screen: string }): ReactNode {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="placeholder-title" className="screen">
      <h1 id="placeholder-title">{t("placeholder.title", { name: t(`nav.${screen}`) })}</h1>
      <p>{t("placeholder.body")}</p>
      <p className="panel-help">{t("placeholder.detail")}</p>
    </section>
  );
}
