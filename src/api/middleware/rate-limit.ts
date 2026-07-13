import { rateLimiter } from "hono-rate-limiter";
import type { MiddlewareHandler, Context } from "hono";
import { createProblemResponse } from "../schemas/common.js";

function keyGenerator(c: Context): string {
  return (c.get("keyPrefix") as string) || "anonymous";
}

function createLimiter(windowMs: number, limit: number): MiddlewareHandler {
  return rateLimiter({
    windowMs,
    limit,
    keyGenerator,
    handler: (c) => {
      const retryAfter = Math.ceil(windowMs / 1000);
      return createProblemResponse(
        c,
        429,
        "Too Many Requests",
        `Rate limit exceeded. Try again in ${retryAfter}s`,
        { "Retry-After": String(retryAfter) }
      );
    },
  });
}

/** Global rate limit: 60 requests/minute */
export const globalRateLimit: MiddlewareHandler = createLimiter(60_000, 60);

/** Mutating rate limit: 10 requests/minute for POST/PUT/DELETE */
export const mutatingRateLimit: MiddlewareHandler = async (c, next) => {
  const method = c.req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return next();
  }
  return createLimiter(60_000, 10)(c, next);
};

/** Read rate limit: 300 requests/minute for GET */
export const readRateLimit: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== "GET") {
    return next();
  }
  return createLimiter(60_000, 300)(c, next);
};
