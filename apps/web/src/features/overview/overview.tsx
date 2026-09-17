import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "../session/session.js";

/**
 * Overview (docs/25): activity, spend, security signals. The foundation ships
 * the frame and the empty states; the data slices (runs, cost rollups, denial
 * signals) fill the panels as their screens land.
 *
 * The security-signals panel is the one with a rule: an empty security view
 * is good news and must read that way (docs/24) -- "no denied calls in this
 * period", not "no data".
 */
export function OverviewScreen(): ReactNode {
  const { t } = useTranslation();
  const { state } = useSession();

  if (state.kind !== "signedIn") return null;

  return (
    <section aria-labelledby="overview-title" className="screen">
      <h1 id="overview-title">{t("overview.title")}</h1>
      <p className="screen-subtitle">{t("overview.subtitle", { team: state.activeTeam.name })}</p>

      <h2>{t("overview.signals")}</h2>
      <div className="panel panel-good" role="status">
        <p className="panel-good-title">{t("overview.signalsGood")}</p>
        <p className="panel-help">{t("overview.signalsGoodHelp")}</p>
      </div>

      <h2>{t("overview.title")}</h2>
      <div className="panel">
        <p className="panel-help">{t("overview.empty")}</p>
      </div>
    </section>
  );
}
