/**
 * Mask a secret for display: keep `prefix` leading and `suffix` trailing chars
 * with "..." between, or "***" when the value is too short to mask meaningfully.
 * Single source for the CLI key-masking formula.
 */
export function maskSecret(value: string, prefix = 6, suffix = 4): string {
  return value.length > prefix + suffix
    ? value.slice(0, prefix) + "..." + value.slice(-suffix)
    : "***";
}
