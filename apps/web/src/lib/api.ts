/**
 * The response envelope every endpoint returns (docs/15-api.md):
 * { success, data, error, request_id }. One type here, so the client and the
 * screens agree on the shape rather than each screen improvising.
 */
export interface Envelope<T> {
  success: boolean;
  data: T;
  error: null | { code: string; message: string; details: Record<string, unknown> };
  request_id: string;
}

/** Structured API failure, carrying the code and the request id for support. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | null;
  readonly details: Record<string, unknown>;

  constructor(
    code: string,
    status: number,
    message: string,
    requestId: string | null,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.details = details;
  }
}

export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super("The service could not be reached.");
    this.name = "NetworkError";
    this.cause = cause;
  }
}
