/**
 * OpenAI Codex CLI credential reader.
 *
 * Reads JWT tokens from the local Codex CLI installation:
 *   ~/.codex/auth.json
 *
 * Tokens are cached in memory and re-read only on expiration or forced refresh.
 * Unlike Claude Code, Codex uses long-lived JWTs (~2 months) so there is no
 * OAuth refresh flow — if the token expires, the user must re-authenticate
 * via `codex` CLI.
 */

import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { createLogger } from "../utils/logger.js";
import { extractJwtExpiry } from "../utils/jwt.js";
import { createTokenCache } from "./token-cache.js";

const log = createLogger("CodexCreds");

// ── Types ──────────────────────────────────────────────────────────────

interface CodexAuthFile {
  auth_mode?: string;
  OPENAI_API_KEY?: string | null;
  tokens?: {
    access_token?: string;
    refresh_token?: string;
    account_id?: string;
    id_token?: string;
  };
  last_refresh?: string;
}

// ── Module-level cache ─────────────────────────────────────────────────

const tokenCache = createTokenCache();

// ── Internal helpers ───────────────────────────────────────────────────

function getCodexHome(): string {
  return process.env.CODEX_HOME || join(homedir(), ".codex");
}

function getAuthFilePath(): string {
  return join(getCodexHome(), "auth.json");
}

/** Read and parse ~/.codex/auth.json */
function readAuthFile(): CodexAuthFile | null {
  const filePath = getAuthFilePath();
  if (!existsSync(filePath)) return null;

  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as CodexAuthFile;
  } catch (error) {
    log.warn({ err: error, path: filePath }, "Failed to parse Codex auth file");
    return null;
  }
}

/** Extract the access token and its expiry from the auth file */
function extractToken(auth: CodexAuthFile): { token: string; expiresAt: number } | null {
  // Prefer OAuth token from tokens object
  const accessToken = auth.tokens?.access_token;
  if (accessToken) {
    const expiresAt = extractJwtExpiry(accessToken) || Date.now() + 3_600_000; // fallback: assume 1h if exp missing
    return { token: accessToken, expiresAt };
  }

  // Fallback to static API key
  if (auth.OPENAI_API_KEY) {
    return { token: auth.OPENAI_API_KEY, expiresAt: Number.MAX_SAFE_INTEGER };
  }

  log.warn("Codex auth file found but missing access_token and OPENAI_API_KEY");
  return null;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Get the Codex API key with intelligent caching.
 *
 * Resolution order:
 * 1. Return cached token if still valid (Date.now() < expiresAt)
 * 2. Read from ~/.codex/auth.json and cache
 * 3. Fall back to `fallbackKey` if provided
 * 4. Throw if nothing works
 */
export function getCodexApiKey(fallbackKey?: string): string {
  // Fast path: cached and valid
  if (tokenCache.isValid()) {
    return tokenCache.get() as string;
  }

  // Read from disk
  const auth = readAuthFile();
  if (auth) {
    const extracted = extractToken(auth);
    if (extracted) {
      tokenCache.set(extracted.token, extracted.expiresAt);
      log.debug("Codex credentials loaded successfully");
      return extracted.token;
    }
  }

  // Fallback to manual key
  if (fallbackKey && fallbackKey.length > 0) {
    log.warn("Codex credentials not found, using fallback api_key from config");
    return fallbackKey;
  }

  throw new Error(
    "No Codex credentials found. Run 'codex' to authenticate or set api_key in config."
  );
}

/**
 * Force credential re-read from disk (called on 401).
 * Codex CLI manages its own token refresh — we just re-read from disk
 * in case the CLI has already refreshed the token.
 */
export async function refreshCodexApiKey(): Promise<string | null> {
  tokenCache.reset();

  const auth = readAuthFile();
  if (auth) {
    const extracted = extractToken(auth);
    if (extracted) {
      tokenCache.set(extracted.token, extracted.expiresAt);
      log.info("Codex credentials refreshed from disk");
      return extracted.token;
    }
  }

  log.warn("Failed to refresh Codex credentials");
  return null;
}

/** Check if the currently cached token is still valid */
export function isCodexTokenValid(): boolean {
  return tokenCache.isValid();
}
