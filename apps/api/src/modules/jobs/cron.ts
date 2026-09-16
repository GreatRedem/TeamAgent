/**
 * Minimal 5-field cron parser for `job_schedules` (docs/23-job-queue.md):
 * `minute hour day-of-month month day-of-week`, with `*`, lists, ranges, and
 * `step` values. Deliberately small: no named months or weekdays, no seconds,
 * no year field — schedule rows are written by this codebase, not by hand.
 *
 * All matching happens in UTC, so a schedule's fire times are deterministic
 * regardless of host timezone or DST transitions.
 */

export class CronParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CronParseError";
  }
}

export interface ParsedCron {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  /**
   * False when a day field is effectively `*`. Vixie cron semantics: when
   * both day fields are restricted the day matches EITHER (a fire time on
   * the 13th or on a Friday for `0 0 13 * 5`); when only one is restricted,
   * it alone decides.
   */
  domRestricted: boolean;
  dowRestricted: boolean;
}

interface FieldSpec {
  readonly name: string;
  readonly min: number;
  readonly max: number;
}

function isUnrestricted(values: Set<number>, min: number, max: number): boolean {
  for (let v = min; v <= max; v += 1) {
    if (!values.has(v)) return false;
  }
  return true;
}

function parseField(expr: string, spec: FieldSpec, normalize?: (v: number) => number): Set<number> {
  const values = new Set<number>();
  for (const term of expr.split(",")) {
    const parsed = /^([^/]+)(?:\/(\d+))?$/.exec(term);
    if (parsed === null) {
      throw new CronParseError(`invalid term '${term}' in the ${spec.name} field`);
    }
    const range = parsed[1] ?? "";
    const step = parsed[2] === undefined ? 1 : Number(parsed[2]);
    if (!Number.isInteger(step) || step < 1) {
      throw new CronParseError(`the step in the ${spec.name} field must be >= 1`);
    }
    let start: number;
    let end: number;
    if (range === "*") {
      start = spec.min;
      end = spec.max;
    } else {
      const bounds = /^(\d+)-(\d+)$/.exec(range);
      if (bounds !== null) {
        start = Number(bounds[1]);
        end = Number(bounds[2]);
      } else if (/^\d+$/.test(range)) {
        if (step !== 1) {
          throw new CronParseError(
            `a step on a single value is not supported in the ${spec.name} field`,
          );
        }
        start = Number(range);
        end = start;
      } else {
        throw new CronParseError(`invalid value '${range}' in the ${spec.name} field`);
      }
    }
    if (start < spec.min || end > spec.max) {
      throw new CronParseError(
        `${spec.name} values must be in ${spec.min}-${spec.max}, got '${range}'`,
      );
    }
    if (start > end) {
      throw new CronParseError(`backwards range '${range}' in the ${spec.name} field`);
    }
    for (let v = start; v <= end; v += step) {
      values.add(normalize === undefined ? v : normalize(v));
    }
  }
  return values;
}

const MINUTE: FieldSpec = { name: "minute", min: 0, max: 59 };
const HOUR: FieldSpec = { name: "hour", min: 0, max: 23 };
const DAY_OF_MONTH: FieldSpec = { name: "day of month", min: 1, max: 31 };
const MONTH: FieldSpec = { name: "month", min: 1, max: 12 };
// 0 and 7 are both Sunday; 7 is normalized to 0.
const DAY_OF_WEEK: FieldSpec = { name: "day of week", min: 0, max: 7 };

export function parseCron(expr: string): ParsedCron {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new CronParseError(
      `a cron expression needs 5 fields (minute hour day-of-month month day-of-week), got ${parts.length}`,
    );
  }
  const [minute = "", hour = "", dayOfMonth = "", month = "", dayOfWeek = ""] = parts;
  const minutes = parseField(minute, MINUTE);
  const hours = parseField(hour, HOUR);
  const daysOfMonth = parseField(dayOfMonth, DAY_OF_MONTH);
  const months = parseField(month, MONTH);
  const daysOfWeek = parseField(dayOfWeek, DAY_OF_WEEK, (v) => (v === 7 ? 0 : v));
  return {
    minutes,
    hours,
    daysOfMonth,
    months,
    daysOfWeek,
    domRestricted: !isUnrestricted(daysOfMonth, 1, 31),
    dowRestricted: !isUnrestricted(daysOfWeek, 0, 6),
  };
}

function dayMatches(parsed: ParsedCron, date: Date): boolean {
  if (!parsed.domRestricted && !parsed.dowRestricted) return true;
  if (parsed.domRestricted && parsed.dowRestricted) {
    return parsed.daysOfMonth.has(date.getUTCDate()) || parsed.daysOfWeek.has(date.getUTCDay());
  }
  return parsed.domRestricted
    ? parsed.daysOfMonth.has(date.getUTCDate())
    : parsed.daysOfWeek.has(date.getUTCDay());
}

/**
 * The next fire time strictly after `after`, or null when no occurrence
 * exists within a one-year scan (e.g. February 30th — a cron that can never
 * fire). Strictly-after is what the scheduler wants: the next occurrence
 * computed from the one that just fired, never a refire of the same minute.
 */
export function nextCronRun(parsed: ParsedCron, after: Date): Date | null {
  const candidate = new Date(Math.floor(after.getTime() / 60_000) * 60_000 + 60_000);
  // A leap year of minutes bounds the scan: every branch below advances the
  // candidate by at least one minute, so this terminates.
  const limit = candidate.getTime() + 366 * 24 * 60 * 60_000;
  while (candidate.getTime() < limit) {
    if (!parsed.months.has(candidate.getUTCMonth() + 1)) {
      candidate.setUTCMonth(candidate.getUTCMonth() + 1, 1);
      candidate.setUTCHours(0, 0, 0, 0);
      continue;
    }
    if (!dayMatches(parsed, candidate)) {
      candidate.setUTCDate(candidate.getUTCDate() + 1);
      candidate.setUTCHours(0, 0, 0, 0);
      continue;
    }
    if (!parsed.hours.has(candidate.getUTCHours())) {
      candidate.setUTCHours(candidate.getUTCHours() + 1, 0, 0, 0);
      continue;
    }
    if (!parsed.minutes.has(candidate.getUTCMinutes())) {
      candidate.setUTCMinutes(candidate.getUTCMinutes() + 1, 0, 0);
      continue;
    }
    return new Date(candidate.getTime());
  }
  return null;
}
