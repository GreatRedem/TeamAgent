import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import type { i18n as I18n } from "i18next";
import { AppShell, type ScreenKey } from "../components/app-shell.js";
import { LiveRegionsProvider } from "../components/live-regions.js";
import { OverviewScreen } from "../features/overview/overview.js";
import { AgentsScreen } from "../features/agents/agents.js";
import { SourcesScreen } from "../features/sources/sources.js";
import { KnowledgeScreen } from "../features/knowledge/knowledge.js";
import { ApprovalsBadge, ApprovalsScreen } from "../features/approvals/approvals.js";
import { ApprovalsProvider } from "../features/approvals/provider.js";
import { PlaceholderScreen } from "../features/placeholder/placeholder.js";
import { SignInScreen } from "../features/signin/sign-in.js";
import { SessionProvider, useSession } from "../features/session/session.js";

/**
 * Root composition. i18n first (so no string renders before resources are
 * ready), then the live regions (so every screen can announce), then the
 * session (which decides sign-in vs shell), then the active screen.
 *
 * Navigation is deliberately state-in-component rather than a router package:
 * the foundation has one signed-in surface and no deep links yet. When runs
 * and audit screens need URLs that survive a paste into a ticket (docs/24:
 * sort/filter state lives in the URL), this swaps for a real router without
 * touching the screens.
 */
export function AppRoot({ i18n }: { i18n: I18n }): ReactNode {
  return (
    <I18nextProvider i18n={i18n}>
      <LiveRegionsProvider>
        <SessionProvider>
          <Screens />
        </SessionProvider>
      </LiveRegionsProvider>
    </I18nextProvider>
  );
}

function Screens(): ReactNode {
  const { state, http } = useSession();
  const { t } = useTranslation();
  const [screen, setScreen] = useState<ScreenKey>("overview");

  // Reset to overview on sign-in; a stale selection from a previous session
  // should not silently re-open a team-scoped view for a different wallet.
  useEffect(() => {
    if (state.kind === "signedIn") setScreen("overview");
  }, [state.kind]);

  if (state.kind === "loading") {
    return (
      <main id="main" className="signin">
        <p className="panel-help" role="status">
          {t("signin.verifying")}
        </p>
      </main>
    );
  }
  if (state.kind === "signedOut") {
    return <SignInScreen />;
  }

  return (
    <ApprovalsProvider
      key={`${state.user.id}:${state.activeTeam.id}`}
      http={http}
      teamId={state.activeTeam.id}
    >
      <AppShell
        active={screen}
        onNavigate={setScreen}
        headerSlot={<ApprovalsBadge onNavigate={() => setScreen("approvals")} />}
      >
        {screen === "overview" ? (
          <OverviewScreen />
        ) : screen === "agents" ? (
          <AgentsScreen />
        ) : screen === "sources" ? (
          <SourcesScreen />
        ) : screen === "knowledge" ? (
          <KnowledgeScreen />
        ) : screen === "approvals" ? (
          <ApprovalsScreen />
        ) : (
          <PlaceholderScreen screen={screen} />
        )}
      </AppShell>
    </ApprovalsProvider>
  );
}
