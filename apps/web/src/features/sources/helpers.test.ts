import { describe, expect, it } from "vitest";
import { ApiError, NetworkError } from "../../lib/api.js";
import {
  sourceAccess,
  sourceDate,
  sourceFailure,
  sourceStatus,
  validSourceText,
} from "./helpers.js";

describe("source helpers", () => {
  it.each(Array.from({ length: 8 }, (_, mask) => mask))(
    "gates independent effective permissions for mask %s",
    (mask) => {
      const permissions = ["source.read", "source.connect", "source.disconnect"].filter(
        (_, index) => mask & (1 << index),
      );
      expect(sourceAccess(permissions)).toEqual({
        read: Boolean(mask & 1),
        connect: Boolean(mask & 2),
        disconnect: Boolean(mask & 4),
      });
      expect(sourceAccess(["owner", "admin", "source.write"])).toEqual({
        read: false,
        connect: false,
        disconnect: false,
      });
    },
  );
  it.each(["", " ", "\n\t", "x".repeat(201)])("rejects invalid name %j", (name) =>
    expect(validSourceText(name)).toBe(false),
  );
  it("matches name/type boundaries and accepts plain untrusted input", () => {
    expect(validSourceText("x".repeat(200))).toBe(true);
    expect(validSourceText("x".repeat(100), 100)).toBe(true);
    expect(validSourceText("x".repeat(101), 100)).toBe(false);
    expect(validSourceText("<script>\u202eنام</script>")).toBe(true);
  });
  it.each(["active", "disabled", "connected", "__proto__", "<img>"])(
    "maps availability %s using controlled labels",
    (value) => {
      expect(sourceStatus(value)).toBe(
        value === "active" || value === "disabled" ? value : "unknown",
      );
    },
  );
  it.each(["en", "fa"])("formats absolute dates with Intl in %s", (locale) => {
    const value = "2026-06-01T12:00:00Z";
    expect(sourceDate(value, locale)).toBe(
      new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      ),
    );
    expect(sourceDate("bad date", locale)).toBeNull();
  });
  it.each([
    [403, "FORBIDDEN", "denied"],
    [401, "UNAUTHORIZED", "session"],
    [404, "NOT_FOUND", "notFound"],
    [409, "CONNECTION_IN_USE", "inUse"],
    [400, "INVALID_INPUT", "invalid"],
    [500, "INTERNAL", "unknown"],
  ] as const)("maps %s %s without exposing server text", (status, code, key) => {
    expect(
      sourceFailure(new ApiError(code, status, "private provider text", "request-id"), true),
    ).toEqual({ key, denied: status === 403, requestId: "request-id" });
  });
  it("distinguishes unknown mutation outcomes from failed reads", () => {
    for (const error of [new NetworkError(), new Error("private")]) {
      expect(sourceFailure(error).key).toBe("load");
      expect(sourceFailure(error, true)).toEqual({
        key: "unknown",
        denied: false,
        requestId: null,
      });
    }
  });
});
