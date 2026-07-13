import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { createProblemResponse } from "../schemas/common.js";
import { hashApiKey } from "../../utils/crypto-tokens.js";

interface FailedAttempt {
  count: number;
  blockedUntil: number;
}

const MAX_FAILED = 10;
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const BLOCK_MS = 15 * 60 * 1000; // 15 minutes

function normalizeIp(ip: string): string {
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

export function createAuthMiddleware(config: {
  keyHash: string;
  allowedIps: string[];
}): MiddlewareHandler {
  const failedAttempts = new Map<string, FailedAttempt>();

  // Periodic cleanup every 5 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, attempt] of failedAttempts) {
      if (attempt.blockedUntil < now && now - attempt.blockedUntil > WINDOW_MS) {
        failedAttempts.delete(ip);
      }
    }
  }, WINDOW_MS);
  cleanupInterval.unref();

  return async (c, next) => {
    // Get source IP from the underlying socket
    const rawIp =
      (c.env as Record<string, string | undefined>)?.ip ?? c.req.header("x-real-ip") ?? "unknown";
    const sourceIp = normalizeIp(rawIp);

    // Check IP whitelist
    if (config.allowedIps.length > 0 && !config.allowedIps.includes(sourceIp)) {
      throw new HTTPException(403, {
        res: createProblemResponse(c, 403, "Forbidden", "IP address not in whitelist"),
      });
    }

    // Check rate limit block
    const attempt = failedAttempts.get(sourceIp);
    if (attempt && attempt.blockedUntil > Date.now()) {
      const retryAfter = Math.ceil((attempt.blockedUntil - Date.now()) / 1000);
      throw new HTTPException(429, {
        res: createProblemResponse(
          c,
          429,
          "Too Many Requests",
          `IP blocked due to too many failed auth attempts. Retry after ${retryAfter}s`,
          { "Retry-After": String(retryAfter) }
        ),
      });
    }

    // Extract Bearer token
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      throw new HTTPException(401, {
        res: createProblemResponse(
          c,
          401,
          "Unauthorized",
          "Missing Authorization header. Use: Authorization: Bearer tltn_..."
        ),
      });
    }

    const match = authHeader.match(/^Bearer\s+(tltn_.+)$/);
    if (!match) {
      throw new HTTPException(401, {
        res: createProblemResponse(
          c,
          401,
          "Unauthorized",
          "Invalid Authorization format. Expected: Bearer tltn_..."
        ),
      });
    }

    const apiKey = match[1];
    const keyHash = hashApiKey(apiKey);

    // Timing-safe comparison of hashes
    const storedBuf = Buffer.from(config.keyHash, "hex");
    const providedBuf = Buffer.from(keyHash, "hex");

    if (storedBuf.length !== providedBuf.length || !timingSafeEqual(storedBuf, providedBuf)) {
      // Record failed attempt
      const existing = failedAttempts.get(sourceIp);
      const count = (existing?.count ?? 0) + 1;
      if (count >= MAX_FAILED) {
        failedAttempts.set(sourceIp, {
          count,
          blockedUntil: Date.now() + BLOCK_MS,
        });
      } else {
        failedAttempts.set(sourceIp, {
          count,
          blockedUntil: 0,
        });
      }

      throw new HTTPException(401, {
        res: createProblemResponse(c, 401, "Unauthorized", "Invalid API key"),
      });
    }

    // Auth successful — reset failed attempts
    failedAttempts.delete(sourceIp);

    // Store key prefix for audit/rate-limit keying
    c.set("keyPrefix", apiKey.slice(0, 10));

    await next();
  };
}
