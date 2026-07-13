/**
 * Minimal JWT helpers — no signature verification, only claim extraction.
 */

/**
 * Extract the expiry of a JWT from its `exp` claim.
 * Returns the expiry as a Unix timestamp in milliseconds, or 0 when the token
 * is malformed or carries no `exp` claim.
 */
export function extractJwtExpiry(token: string): number {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return 0;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return (payload.exp ?? 0) * 1000; // Convert seconds → ms
  } catch {
    return 0;
  }
}
