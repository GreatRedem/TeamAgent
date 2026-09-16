export interface DestinationCheck {
  /** Identifier chosen by the model from the pre-registered set. */
  proposed: string;
  allowedDestinations: string[];
  canInitiate: boolean;
  /** The conversation origin (C4 reply-to-origin default). */
  origin?: string | null;
}

/**
 * Destinations come from configuration, never from model output (docs/17
 * C3). Strict string equality only: no normalization rescue, no trimming,
 * no fuzzy matching — the failure mode is a well-meaning leniency commit,
 * and these tests pin strictness.
 */
export function resolveDestination(
  check: DestinationCheck,
): { allowed: true } | { allowed: false; reason: string } {
  if (check.origin !== undefined && check.origin !== null && check.proposed === check.origin) {
    return { allowed: true };
  }
  if (!check.canInitiate) {
    return { allowed: false, reason: "initiation-not-granted" };
  }
  if (check.allowedDestinations.includes(check.proposed)) {
    return { allowed: true };
  }
  return { allowed: false, reason: "destination-not-allowlisted" };
}
