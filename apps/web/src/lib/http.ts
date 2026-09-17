import { ApiError, NetworkError, type Envelope } from "./api.js";

/**
 * Typed client helpers for the API (docs/15-api.md). Feature components never
 * call fetch directly (skills/frontend/SKILL.md) -- they call these.
 *
 * Same-origin by construction: __API_BASE_URL__ is empty under the documented
 * deployment, where nginx serves this build and routes the API prefixes.
 * Token storage and 401 handling live in lib/session; this module stays
 * transport-only, so it can never grow a dependency on React.
 */

const BASE: string = __API_BASE_URL__;

export type Query = Record<string, string | number | boolean | undefined>;

function buildUrl(path: string, query?: Query): string {
  const url = BASE + path;
  if (query === undefined) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded === "" ? url : `${url}?${encoded}`;
}

export class Http {
  /**
   * accessToken is injected by lib/session so this module never touches
   * storage itself. onUnauthorized is the session layer's refresh hook.
   */
  constructor(
    private readonly getAccessToken: () => string | null,
    private readonly onUnauthorized: () => Promise<string | null>,
  ) {}

  async request<T>(
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    options: { body?: unknown; query?: Query } = {},
  ): Promise<T> {
    return this.send(method, path, options, true);
  }

  /** Like request, but without attaching credentials (sign-in endpoints). */
  async requestUnauthenticated<T>(
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    options: { body?: unknown; query?: Query } = {},
  ): Promise<T> {
    return this.send(method, path, options, false);
  }

  private async send<T>(
    method: string,
    path: string,
    options: { body?: unknown; query?: Query },
    withAuth: boolean,
    retryOn401 = true,
  ): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (options.body !== undefined) headers["content-type"] = "application/json";
    if (withAuth) {
      const token = this.getAccessToken();
      if (token !== null) headers.authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await fetch(buildUrl(path, options.query), {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        // The API is same-origin; nothing here should carry ambient
        // credentials anywhere else.
        credentials: "same-origin",
      });
    } catch (cause) {
      throw new NetworkError(cause);
    }

    if (response.status === 401 && withAuth && retryOn401) {
      // Access tokens live 15 minutes; a transparent refresh keeps an active
      // operator signed in without a flash of "expired". Exactly one retry:
      // if the refresh also fails, the session layer signs out.
      const next = await this.onUnauthorized();
      if (next !== null) {
        return this.send<T>(method, path, options, true, false);
      }
    }

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      // A proxy error page or a truncated body is not the API's envelope.
      throw new NetworkError();
    }

    if (!response.ok || !envelope.success || envelope.error !== null) {
      const error = envelope.error;
      throw new ApiError(
        error?.code ?? "INTERNAL_SERVER_ERROR",
        response.status,
        error?.message ?? "The request failed.",
        envelope.request_id ?? null,
        error?.details ?? {},
      );
    }
    return envelope.data;
  }
}
