import type { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

/** Shared body-size limit for all HTTP servers (2 MB). */
const BODY_LIMIT_BYTES = 2 * 1024 * 1024;

/**
 * Register security response headers on every route. The base headers
 * (X-Content-Type-Options, X-Frame-Options) are always applied; HSTS and
 * Referrer-Policy are opt-in so each server keeps its own divergent policy
 * (HSTS for the HTTPS-only API, Referrer-Policy for the WebUI/Setup servers).
 */
export function applySecurityMiddleware(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Hono generic varies per server
  app: Hono<any>,
  options: { hsts?: boolean; referrerPolicy?: string } = {}
): void {
  app.use("*", async (c, next) => {
    await next();
    c.res.headers.set("X-Content-Type-Options", "nosniff");
    c.res.headers.set("X-Frame-Options", "DENY");
    if (options.hsts) {
      c.res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    if (options.referrerPolicy) {
      c.res.headers.set("Referrer-Policy", options.referrerPolicy);
    }
  });
}

/**
 * Body-limit middleware shared by all HTTP servers. The over-limit error
 * envelope differs per server (problem+json for the API, `{success:false}` for
 * WebUI/Setup), so the `onError` handler is passed in by the caller.
 */
export function sharedBodyLimit(onError: (c: Context) => Response): MiddlewareHandler {
  return bodyLimit({ maxSize: BODY_LIMIT_BYTES, onError });
}
