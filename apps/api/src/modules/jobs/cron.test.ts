import { describe, expect, it } from "vitest";
import { CronParseError, nextCronRun, parseCron } from "./cron.js";

function utc(iso: string): Date {
  return new Date(iso);
}

describe("parseCron", () => {
  it("accepts the documented shapes and normalizes 7 to Sunday", () => {
    const everyMinute = parseCron("* * * * *");
    expect(everyMinute.minutes.size).toBe(60);
    expect(everyMinute.hours.size).toBe(24);
    expect(everyMinute.domRestricted).toBe(false);
    expect(everyMinute.dowRestricted).toBe(false);

    expect(parseCron("0 9 * * 1-5").daysOfWeek).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(parseCron("*/15 0 * * *").minutes).toEqual(new Set([0, 15, 30, 45]));
    expect(parseCron("0 0 1,15 * *").daysOfMonth).toEqual(new Set([1, 15]));
    expect(parseCron("30 2 29 2 *").daysOfMonth).toEqual(new Set([29]));
    // 7 is Sunday, same as 0.
    expect(parseCron("0 0 * * 7").daysOfWeek).toEqual(new Set([0]));
  });

  it("rejects malformed or out-of-range expressions", () => {
    expect(() => parseCron("0 0 * *")).toThrow(CronParseError);
    expect(() => parseCron("* * * * * *")).toThrow(CronParseError);
    expect(() => parseCron("60 * * * *")).toThrow(CronParseError);
    expect(() => parseCron("* 24 * * *")).toThrow(CronParseError);
    expect(() => parseCron("* * 0 * *")).toThrow(CronParseError);
    expect(() => parseCron("* * * 13 *")).toThrow(CronParseError);
    expect(() => parseCron("* * * * 8")).toThrow(CronParseError);
    expect(() => parseCron("5-1 * * * *")).toThrow(CronParseError);
    expect(() => parseCron("* * * * mon")).toThrow(CronParseError);
  });

  it("treats both day fields restricted as a union (vixie semantics)", () => {
    const parsed = parseCron("0 0 13 * 5");
    expect(parsed.domRestricted).toBe(true);
    expect(parsed.dowRestricted).toBe(true);
  });
});

describe("nextCronRun", () => {
  it("finds the next minute fire for every-minute schedules", () => {
    const parsed = parseCron("* * * * *");
    expect(nextCronRun(parsed, utc("2026-09-16T10:30:29.000Z"))?.toISOString()).toBe(
      "2026-09-16T10:31:00.000Z",
    );
    // Exactly on a minute boundary: strictly after, not the same minute.
    expect(nextCronRun(parsed, utc("2026-09-16T10:31:00.000Z"))?.toISOString()).toBe(
      "2026-09-16T10:32:00.000Z",
    );
  });

  it("honors hour and minute restrictions across a day boundary", () => {
    const parsed = parseCron("30 9 * * *");
    expect(nextCronRun(parsed, utc("2026-09-16T10:00:00.000Z"))?.toISOString()).toBe(
      "2026-09-17T09:30:00.000Z",
    );
    expect(nextCronRun(parsed, utc("2026-09-16T08:00:00.000Z"))?.toISOString()).toBe(
      "2026-09-16T09:30:00.000Z",
    );
  });

  it("honors month restrictions and day-of-week restrictions", () => {
    const february = parseCron("0 0 1 2 *");
    expect(nextCronRun(february, utc("2026-09-16T00:00:00.000Z"))?.toISOString()).toBe(
      "2027-02-01T00:00:00.000Z",
    );

    const fridays = parseCron("0 12 * * 5");
    // 2026-09-16 is a Wednesday; the next Friday is the 18th.
    expect(nextCronRun(fridays, utc("2026-09-16T00:00:00.000Z"))?.toISOString()).toBe(
      "2026-09-18T12:00:00.000Z",
    );
  });

  it("unions restricted day-of-month and day-of-week", () => {
    // Fires on the 13th OR on Fridays.
    const parsed = parseCron("0 0 13 * 5");
    // 2026-09-16 (Wed) -> Friday the 18th comes before Sunday the 13th (Oct).
    expect(nextCronRun(parsed, utc("2026-09-16T00:00:00.000Z"))?.toISOString()).toBe(
      "2026-09-18T00:00:00.000Z",
    );
    // 2026-09-20 (Sun) -> Monday... Friday the 25th; but the 13th of Oct is later.
    expect(nextCronRun(parsed, utc("2026-09-21T00:00:00.000Z"))?.toISOString()).toBe(
      "2026-09-25T00:00:00.000Z",
    );
  });

  it("returns null for a schedule that can never fire", () => {
    expect(nextCronRun(parseCron("0 0 30 2 *"), utc("2026-01-01T00:00:00.000Z"))).toBeNull();
  });
});
