import type { FastifyReply } from "fastify";

/** Domain error with a stable API code and HTTP status (docs/15-api.md). */
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: string,
    statusCode: number,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function badRequest(
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): AppError {
  return new AppError(code, 400, message, details);
}

export function unauthorized(message = "Authentication required."): AppError {
  return new AppError("UNAUTHORIZED", 401, message);
}

export function forbidden(message = "You do not have access to this resource."): AppError {
  return new AppError("FORBIDDEN", 403, message);
}

/**
 * Another team's resource — or a genuinely missing one. Both return
 * NOT_FOUND so the API is not an existence oracle (docs/15-api.md).
 */
export function notFound(resource = "Resource"): AppError {
  return new AppError("NOT_FOUND", 404, `${resource} not found.`);
}

export function conflict(code: string, message: string): AppError {
  return new AppError(code, 409, message);
}

export function rateLimited(message = "Too many requests."): AppError {
  return new AppError("RATE_LIMITED", 429, message);
}

/**
 * request_id is the same id Fastify logged for the request (docs/22): one
 * correlation id across the log line and the response envelope, not two.
 */
export function ok(reply: FastifyReply, data: unknown): FastifyReply {
  return reply.send({
    success: true,
    data,
    error: null,
    request_id: reply.request.id,
  });
}

export function fail(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof AppError) {
    return reply.code(error.statusCode).send({
      success: false,
      data: null,
      error: { code: error.code, message: error.message, details: error.details },
      request_id: reply.request.id,
    });
  }
  // Framework errors with a 4xx status (body parsing, validation, routing)
  // keep their status and message; anything else is an opaque 500.
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
    return reply.code(statusCode).send({
      success: false,
      data: null,
      error: {
        code: typeof code === "string" ? code : "INVALID_REQUEST",
        message: typeof message === "string" ? message : "The request was invalid.",
        details: {},
      },
      request_id: reply.request.id,
    });
  }
  reply.log.error({ err: error }, "unhandled error");
  return reply.code(500).send({
    success: false,
    data: null,
    error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred.", details: {} },
    request_id: reply.request.id,
  });
}
