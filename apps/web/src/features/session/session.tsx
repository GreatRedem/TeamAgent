import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ApiError } from "../../lib/api.js";
import {
  fetchMe,
  logout,
  refreshSession,
  requestWalletNonce,
  verifyWalletSignIn,
} from "../../lib/endpoints.js";
import { NetworkError } from "../../lib/api.js";
import { Http } from "../../lib/http.js";
import {
  readActiveTeam,
  tokenStore,
  writeActiveTeam,
  type ActiveTeam,
  type SessionState,
  type SignInOutcome,
} from "../../lib/session-store.js";
import { buildSiweMessage, connectWallet, signMessage } from "../../lib/wallet.js";
import { SIWE_CHAIN_ID } from "../../config.js";

/**
 * Owns the session lifecycle, in the order docs/20-authentication.md requires
 * on the client side:
 *
 * - restore: pick up tokens, then re-resolve identity and teams from
 *   /auth/me. Tokens are credentials, not state; /auth/me is the state.
 * - refresh on 401: lib/http calls back into refreshWithLock, which
 *   single-flights concurrent 401s into one POST /auth/refresh. The refresh
 *   token rotates on every use, so two parallel refreshes would make the
 *   second look like reuse and revoke the whole family (W6).
 * - sign-in: nonce -> build EIP-4361 -> wallet signature -> verify.
 * - sign-out: revoke the refresh family; the stateless access token simply
 *   expires (<= 15 minutes), which is why the TTL is short.
 *
 * Every sign-in failure ends in an error the sign-in screen renders with its
 * own copy; this module never surfaces raw provider or API text.
 */

export interface SignInStep {
  kind:
    | "connecting" // wallet prompt for accounts
    | "requesting-nonce" // POST /auth/wallet/nonce
    | "awaiting-signature" // personal_sign prompt in the wallet
    | "verifying"; // POST /auth/wallet/verify
}

interface SessionContextValue {
  state: SessionState;
  http: Http;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  setActiveTeam: (team: ActiveTeam) => void;
  step: SignInStep["kind"] | null;
  resetError: () => void;
  error: SignInError | null;
}

export interface SignInError {
  kind: "no-provider" | "wallet-rejected" | "expired" | "domain" | "failed" | "network";
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) throw new Error("useSession outside SessionProvider");
  return value;
}

/**
 * The statement line the wallet displays (docs/20-authentication.md). It
 * names the application and says plainly that no transaction is involved;
 * it is a security control rather than decoration, and the sign-in screen
 * shows the same text before the wallet prompt so nothing is a surprise.
 */
const SIWE_STATEMENT = "Sign in to NuraAI. This request will not trigger a transaction or cost any gas.";
const NONCE_TTL_MS = 5 * 60 * 1000;

export function SessionProvider({ children }: { children: ReactNode }): ReactNode {
  const [state, setState] = useState<SessionState>({ kind: "loading" });
  const [step, setStep] = useState<SignInStep["kind"] | null>(null);
  const [error, setError] = useState<SignInError | null>(null);

  // Single-flight refresh. A promise in a ref is the lock: every 401 that
  // arrives while a refresh is in flight awaits the same call, and lib/http
  // retries the original request with the token that refresh produced.
  const refreshInFlight = useRef<Promise<string | null> | null>(null);
  const tokensRef = useRef<{ accessToken: string | null; refreshToken: string | null }>({
    accessToken: null,
    refreshToken: null,
  });

  const applyTokens = useCallback((tokens: { accessToken: string; refreshToken: string }) => {
    tokensRef.current = { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
    tokenStore.write(tokens);
  }, []);

  const loadMe = useCallback(async (accessToken: string): Promise<void> => {
    const http = new Http(
      () => accessToken,
      () => Promise.resolve(null),
    );
    const me = await fetchMe(http);
    // Restore the stored team choice only while it is still a membership;
    // a removed member falls back to their first team, or to signed-out
    // treatment if they have none.
    const stored = readActiveTeam();
    const active =
      stored !== null && me.teams.some((t) => t.id === stored.id)
        ? stored
        : me.teams[0] !== undefined
          ? { id: me.teams[0].id, name: me.teams[0].name }
          : null;
    if (active === null) {
      setState({ kind: "signedOut" });
      return;
    }
    setState({ kind: "signedIn", user: me.user, teams: me.teams, activeTeam: active });
  }, []);

  const refreshWithLock = useCallback((): Promise<string | null> => {
    if (refreshInFlight.current !== null) return refreshInFlight.current;
    const run = (async () => {
      const refreshToken = tokensRef.current.refreshToken;
      if (refreshToken === null) return null;
      try {
        const http = new Http(() => null, () => Promise.resolve(null));
        const next = await refreshSession(http, refreshToken);
        applyTokens(next);
        return next.accessToken;
      } catch {
        // Rotation failed, token expired, or reuse was detected and the
        // family revoked: the session is over either way.
        tokensRef.current = { accessToken: null, refreshToken: null };
        tokenStore.clear();
        setState({ kind: "signedOut" });
        return null;
      } finally {
        refreshInFlight.current = null;
      }
    })();
    refreshInFlight.current = run;
    return run;
  }, [applyTokens]);

  // Restore an existing session once on mount.
  useEffect(() => {
    const stored = tokenStore.read();
    if (stored === null) {
      setState({ kind: "signedOut" });
      return;
    }
    tokensRef.current = { accessToken: stored.accessToken, refreshToken: stored.refreshToken };
    loadMe(stored.accessToken).catch(() => {
      // Access token expired is the normal case; try one refresh, then give up.
      void refreshWithLock().then((accessToken) => {
        if (accessToken !== null) {
          loadMe(accessToken).catch(() => {
            tokenStore.clear();
            setState({ kind: "signedOut" });
          });
        } else {
          setState({ kind: "signedOut" });
        }
      });
    });
  }, [loadMe, refreshWithLock]);

  const signIn = useCallback(async () => {
    setError(null);
    try {
      setStep("connecting");
      const address = await connectWallet();

      setStep("requesting-nonce");
      const nonceHttp = new Http(() => null, () => Promise.resolve(null));
      const { nonce, expiresAt } = await requestWalletNonce(nonceHttp, address);
      if (new Date(expiresAt).getTime() <= Date.now()) {
        throw new ApiError("NONCE_EXPIRED", 400, "The nonce expired before use.", null);
      }

      setStep("awaiting-signature");
      const domain = window.location.host;
      const statement = buildSiweMessage({
        domain,
        address,
        nonce,
        // Chain id is validated server-side against SIWE_CHAIN_ID, which the
        // message's Chain ID line must match exactly. It is a build-time
        // public value inlined by vite (see config.js), never a secret.
        chainId: CHAIN_ID,
        statement: SIWE_STATEMENT,
        issuedAt: new Date(),
        expirationTime: new Date(Date.now() + NONCE_TTL_MS),
      });
      const signature = await signMessage(statement, address);

      setStep("verifying");
      const outcome: SignInOutcome = await verifyWalletSignIn(nonceHttp, statement, signature);
      applyTokens(outcome);
      await loadMe(outcome.accessToken);
      setStep(null);
    } catch (caught) {
      setStep(null);
      setError(classifySignInError(caught));
    }
  }, [applyTokens, loadMe]);

  const signOut = useCallback(async () => {
    const refreshToken = tokensRef.current.refreshToken;
    if (refreshToken !== null) {
      try {
        const http = new Http(() => null, () => Promise.resolve(null));
        await logout(http, refreshToken);
      } catch {
        // Revocation is server-side cleanup; the local session ends regardless.
      }
    }
    tokensRef.current = { accessToken: null, refreshToken: null };
    tokenStore.clear();
    setState({ kind: "signedOut" });
  }, []);

  const setActiveTeam = useCallback((team: ActiveTeam) => {
    setState((current) => {
      if (current.kind !== "signedIn") return current;
      writeActiveTeam(team);
      return { ...current, activeTeam: team };
    });
  }, []);

  const http = useMemo(() => new Http(() => tokensRef.current.accessToken, refreshWithLock), [refreshWithLock]);

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      http,
      signIn,
      signOut,
      setActiveTeam,
      step,
      error,
      resetError: () => setError(null),
    }),
    [state, http, signIn, signOut, setActiveTeam, step, error],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function classifySignInError(caught: unknown): SignInError {
  if (caught instanceof Error) {
    if (caught.message === "no-provider" || caught.message === "no-accounts") return { kind: "no-provider" };
    // User closed the wallet prompt: retryable, and not an API failure.
    if (caught.message === "user rejected" || (caught as { code?: number }).code === 4001) {
      return { kind: "wallet-rejected" };
    }
  }
  if (caught instanceof NetworkError) return { kind: "network" };
  if (caught instanceof ApiError) {
    if (caught.code === "SIWE_MESSAGE_EXPIRED" || caught.code === "NONCE_INVALID_OR_REUSED") {
      return { kind: "expired" };
    }
    if (caught.code === "SIWE_DOMAIN_MISMATCH" || caught.code === "SIWE_URI_MISMATCH") {
      return { kind: "domain" };
    }
  }
  return { kind: "failed" };
}