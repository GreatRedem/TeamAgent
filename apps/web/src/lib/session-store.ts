import type { ApiError } from "./api.js";

/**
 * Everything the runtime hands a screen: tokens from the sign-in exchange,
 * the current user, and the team list. This is the single shape lib/http and
 * the session context agree on.
 */
export interface SessionUser {
  id: string;
  email: string | null;
  displayName: string | null;
  tokenVersion: number;
}

export interface UserTeam {
  id: string;
  name: string;
  role: string;
}

/** GET /auth/me (docs/15-api.md) as implemented by principal.ts. */
export interface MeResponse {
  user: SessionUser;
  identities: { provider: string; providerUserId: string; chainId: number | null }[];
  teams: UserTeam[];
}

/** POST /auth/wallet/verify response, reduced to what the client stores. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface SignInOutcome extends TokenPair {
  user: { id: string; address: string };
}

/** Chosen active team, persisted as a UI preference alongside locale. */
export interface ActiveTeam {
  id: string;
  name: string;
}

export type SessionState =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "signedIn"; user: SessionUser; teams: UserTeam[]; activeTeam: ActiveTeam };

/**
 * Refresh tokens are long-lived credentials; the access token is not, but
 * neither belongs in a place other code can read. They live in localStorage
 * here, scoped to one key, and never appear in logs, render output, or error
 * text (skills/frontend/SKILL.md).
 *
 * Storage failures (private mode, quota) degrade to memory-only: the session
 * works until the tab closes rather than breaking sign-in.
 */
const TOKEN_KEY = "nuraai.tokens";
const TEAM_KEY = "nuraai.activeTeam";

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Memory-only fallback; nothing to do.
  }
}

export const tokenStore = {
  read(): StoredTokens | null {
    const value = readJson<StoredTokens>(TOKEN_KEY);
    return value !== null && typeof value.accessToken === "string" && typeof value.refreshToken === "string"
      ? value
      : null;
  },
  write(tokens: TokenPair): void {
    writeJson(TOKEN_KEY, tokens);
  },
  clear(): void {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(TEAM_KEY);
    } catch {
      // Best effort.
    }
  },
};

export function readActiveTeam(): ActiveTeam | null {
  const value = readJson<ActiveTeam>(TEAM_KEY);
  return value !== null && typeof value.id === "string" && typeof value.name === "string" ? value : null;
}

export function writeActiveTeam(team: ActiveTeam): void {
  writeJson(TEAM_KEY, team);
}

/**
 * Map an API failure to a stable UI classification. Denials are not errors
 * (docs/24-ui-standards.md), and an expired session has its own path, so the
 * screens never string-match error messages.
 */
export type FailureKind = "denied" | "forbidden" | "notFound" | "network" | "other";

export function classifyFailure(error: unknown): FailureKind {
  if (error instanceof Error && error.name === "NetworkError") return "network";
  const code = (error as ApiError | null)?.code;
  if (code === undefined) return "other";
  if (code === "FORBIDDEN") return "forbidden";
  if (code === "NOT_FOUND") return "notFound";
  return "other";
}

export function requestIdOf(error: unknown): string | null {
  return (error as ApiError | null)?.requestId ?? null;
}
