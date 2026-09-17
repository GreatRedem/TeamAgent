import type { Http, Query } from "./http.js";
import type { MeResponse, SignInOutcome, TokenPair } from "./session-store.js";

/**
 * Endpoint helpers for the slices this foundation covers (docs/15-api.md):
 * sign-in, the session itself, and team reads. Screen slices (agents,
 * approvals, ...) add their own module beside this one rather than growing
 * this file into an untyped bag.
 */

export interface WalletNonce {
  nonce: string;
  expiresAt: string;
}

export interface TeamMember {
  userId: string;
  displayName: string | null;
  roleName: string;
}

/** POST /auth/wallet/nonce -- unauthenticated, rate limited per address and IP. */
export function requestWalletNonce(
  http: Http,
  address: string,
): Promise<{ nonce: string; expiresAt: string }> {
  return http.requestUnauthenticated("POST", "/auth/wallet/nonce", { body: { address } });
}

/** POST /auth/wallet/verify -- the EIP-4361 exchange for tokens. */
export function verifyWalletSignIn(
  http: Http,
  message: string,
  signature: string,
): Promise<SignInOutcome> {
  return http.requestUnauthenticated("POST", "/auth/wallet/verify", {
    body: { message, signature },
  });
}

/** POST /auth/refresh -- rotates the presented token; reuse revokes the family. */
export function refreshSession(http: Http, refreshToken: string): Promise<TokenPair> {
  return http.requestUnauthenticated("POST", "/auth/refresh", { body: { refreshToken } });
}

/** POST /auth/logout -- revokes the presented refresh token's family. */
export function logout(http: Http, refreshToken: string): Promise<void> {
  return http.requestUnauthenticated("POST", "/auth/logout", { body: { refreshToken } });
}

/** GET /auth/me -- identity only; permissions are resolved server-side per request. */
export function fetchMe(http: Http): Promise<MeResponse> {
  return http.request("GET", "/auth/me");
}

/** GET /teams/:teamId/members (docs/15). */
export function listTeamMembers(http: Http, teamId: string): Promise<{ members: TeamMember[] }> {
  return http.request("GET", `/teams/${encodeURIComponent(teamId)}/members`);
}

/**
 * GET /teams/:teamId/permissions -- the caller's effective permission names,
 * resolved now (docs/15: never from a token claim). The console uses this to
 * decide what to offer, never as an access check: the API re-checks
 * everything, so the UI can only ever be optimistic, not authoritative.
 */
export function listEffectivePermissions(
  http: Http,
  teamId: string,
): Promise<{ permissions: string[] }> {
  return http.request("GET", `/teams/${encodeURIComponent(teamId)}/permissions`);
}

export function listQuery(params: Record<string, string | undefined>): Query {
  return params;
}
