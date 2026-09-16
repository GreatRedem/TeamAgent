interface Window {
  count: number;
  resetAt: number;
}

/**
 * In-process sliding-window counters. Per-instance, not global — set the
 * per-instance number accordingly (docs/23-job-queue.md). Requires
 * trustProxy so buckets key on the real client IP.
 */
export class RateLimiter {
  private readonly windows = new Map<string, Window>();
  private lastSweep = Date.now();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, now: number = Date.now()): boolean {
    if (now - this.lastSweep > this.windowMs) {
      this.lastSweep = now;
      for (const [k, w] of this.windows) {
        if (w.resetAt <= now) this.windows.delete(k);
      }
    }
    const existing = this.windows.get(key);
    if (existing === undefined || existing.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (existing.count >= this.limit) return false;
    existing.count += 1;
    return true;
  }
}
