import { getAddress } from "viem";

/**
 * Formatting rules from docs/24-ui-standards.md:
 *
 * - Dates, numbers, currency through Intl, never hand-formatted; Persian
 *   calendar conventions differ enough that manual formatting is wrong.
 * - Addresses and identifiers are LTR always, in both locales, and isolated
 *   so surrounding RTL text cannot reorder a hex string into a different
 *   address. The .identifier CSS class carries the bidi isolation; this
 *   module guarantees the value itself is well-formed.
 * - Timestamps are absolute and in the user's timezone; relative time is a
 *   secondary decoration, never the only display.
 */

export function formatTimestamp(value: string | Date, locale: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** EIP-55 checksummed for display; storage and comparison stay lowercase. */
export function formatAddress(address: string): string {
  try {
    return getAddress(address);
  } catch {
    // Not a 20-byte address (defensive; server validates on ingest).
    return address;
  }
}

/** 0x4a2…1f9 -- the truncated form the header shows (docs/25-ui-information.md). */
export function truncateAddress(address: string): string {
  const checksummed = formatAddress(address);
  return `${checksummed.slice(0, 5)}…${checksummed.slice(-4)}`;
}

/**
 * Truncate a UUID or long identifier for dense rows: head and tail, so
 * collation and comparison stay possible. Copyable forms always use the full
 * value via the copy button, never this.
 */
export function truncateId(id: string): string {
  return id.length <= 10 ? id : `${id.slice(0, 7)}…${id.slice(-4)}`;
}
