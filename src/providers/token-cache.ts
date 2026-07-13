/**
 * In-memory access-token cache shared by the credential readers.
 *
 * Encapsulates the `cachedToken` / `cachedExpiresAt` pair and the
 * "valid while now < expiresAt" rule that every provider reimplemented
 * identically. Refresh-token handling and disk/Keychain/OAuth readers stay
 * provider-specific.
 */
export interface TokenCache {
  /** The cached token, or null when unset/reset. */
  get(): string | null;
  /** Store a token and its expiry (Unix ms). */
  set(token: string, expiresAt: number): void;
  /** True when a token is cached and not yet expired. */
  isValid(): boolean;
  /** Clear the cache. */
  reset(): void;
}

export function createTokenCache(): TokenCache {
  let cachedToken: string | null = null;
  let cachedExpiresAt = 0;

  return {
    get() {
      return cachedToken;
    },
    set(token, expiresAt) {
      cachedToken = token;
      cachedExpiresAt = expiresAt;
    },
    isValid() {
      return cachedToken !== null && Date.now() < cachedExpiresAt;
    },
    reset() {
      cachedToken = null;
      cachedExpiresAt = 0;
    },
  };
}
