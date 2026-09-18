import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAnnouncer, VisuallyHidden } from "./live-regions.js";
import { useSession } from "../features/session/session.js";
import { truncateAddress } from "../lib/format.js";
import { changeLocale, currentLocale, SUPPORTED_LOCALES, type Locale } from "../i18n/index.js";
import { i18n } from "../i18n/instance.js";

/**
 * The console shell (docs/25-ui-information.md):
 *
 * - Team scope is always visible, because a destructive action in the wrong
 *   team is a real failure mode. The switcher is a native select: keyboard
 *   and assistive-tech behaviour come free.
 * - The pending-approvals count is the only badge in the product. An
 *   unnoticed approval becomes a denial silently when it expires, so it sits
 *   in the header, read at a glance rather than navigated to. The count is
 *   rendered by the approvals slice (features/approvals) into the slot this
 *   shell provides, so the shell does not grow an approvals dependency.
 * - The connected wallet is checksummed and truncated (EIP-55, docs/20):
 *   sign-in is a signature, so which key is connected is state, not
 *   decoration.
 *
 * Identity comes from the session context; the shell renders only the
 * signed-in state and renders nothing otherwise (the router swaps screens).
 */

export type ScreenKey =
  | "overview"
  | "agents"
  | "sources"
  | "knowledge"
  | "workflows"
  | "approvals"
  | "runs"
  | "audit"
  | "settings";

const NAV_ITEMS: ScreenKey[] = [
  "overview",
  "agents",
  "sources",
  "knowledge",
  "workflows",
  "approvals",
  "runs",
  "audit",
  "settings",
];

interface AppShellProps {
  active: ScreenKey;
  onNavigate: (screen: ScreenKey) => void;
  /** Rendered in the header between the spacer and the wallet chip. */
  headerSlot?: ReactNode;
  children: ReactNode;
}

export function AppShell({ active, onNavigate, headerSlot, children }: AppShellProps): ReactNode {
  const { t } = useTranslation();
  const { state, signOut, setActiveTeam } = useSession();
  const { announce } = useAnnouncer();

  if (state.kind !== "signedIn") return null;

  const onLocaleChange = (next: Locale): void => {
    changeLocale(i18n, next);
    announce(next === "fa" ? "زبان به فارسی تغییر کرد" : "Language switched to English");
  };

  return (
    <div className="shell">
      <header className="shell-header">
        <span className="shell-brand">{t("app.name")}</span>

        <label className="team-switcher">
          <VisuallyHidden>{t("header.teamSwitcherLabel")}</VisuallyHidden>
          <select
            value={state.activeTeam.id}
            onChange={(event) => {
              const team = state.teams.find((tm) => tm.id === event.target.value);
              if (team === undefined) return;
              setActiveTeam({ id: team.id, name: team.name });
              announce(t("overview.subtitle", { team: team.name }));
            }}
          >
            {state.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>

        <div className="shell-spacer" />

        {headerSlot}

        <span className="wallet-chip">
          <VisuallyHidden>{t("header.walletLabel")}: </VisuallyHidden>
          {/* The wallet address is an identifier: mono, LTR, bidi-isolated,
              checksummed, truncated. The full value lives on the account
              screen; the header only needs to answer "which key am I". */}
          <bdi className="identifier">{truncateAddress(state.user.id)}</bdi>
        </span>

        <button type="button" className="button button-quiet" onClick={() => void signOut()}>
          {t("header.signOut")}
        </button>

        <label className="locale-switch">
          <VisuallyHidden>{t("locale.switch")}</VisuallyHidden>
          <select
            value={currentLocale(i18n)}
            onChange={(event) => onLocaleChange(event.target.value as Locale)}
          >
            {SUPPORTED_LOCALES.map((code) => (
              <option key={code} value={code}>
                {t(`locale.${code}`)}
              </option>
            ))}
          </select>
        </label>
      </header>

      <nav aria-label={t("nav.main")} className="shell-nav">
        <ul>
          {NAV_ITEMS.map((item) => (
            <li key={item}>
              <button
                type="button"
                className={item === active ? "nav-link nav-link-active" : "nav-link"}
                aria-current={item === active ? "page" : undefined}
                onClick={() => onNavigate(item)}
              >
                {t(`nav.${item}`)}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <main id="main" className="shell-main">
        {children}
      </main>
    </div>
  );
}
