import { createHash } from "node:crypto";

/**
 * Hash an API key with SHA-256, returning a hex digest.
 *
 * Shared by the Management API server (key generation) and its auth middleware
 * (incoming key verification) so the hashing stays byte-identical in both
 * places. The timing-safe comparisons are intentionally NOT mutualized here:
 * the WebUI compares raw UTF-8 tokens while the API compares hex digests —
 * semantically distinct operations kept separate on purpose.
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
