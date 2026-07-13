import type { MiddlewareHandler } from "hono";
import { createLogger } from "../../utils/logger.js";

const auditLog = createLogger("Audit");

export const auditMiddleware: MiddlewareHandler = async (c, next) => {
  const method = c.req.method;

  // Only audit mutating operations
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return next();
  }

  const start = Date.now();
  await next();
  const durationMs = Date.now() - start;

  auditLog.warn({
    audit: true,
    requestId: c.get("requestId") as string,
    event: "api_mutation",
    method,
    path: c.req.path,
    statusCode: c.res.status,
    durationMs,
    sourceIp: (c.env as Record<string, string | undefined>)?.ip ?? "unknown",
    keyPrefix: (c.get("keyPrefix") as string) ?? "unknown",
  });
};
