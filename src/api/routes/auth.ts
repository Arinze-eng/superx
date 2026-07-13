import { Hono } from "hono";

export function createAuthRoutes() {
  const app = new Hono();

  app.post("/validate", (c) => {
    // If we reach this handler, auth middleware already validated the key
    const keyPrefix = c.req.header("authorization")?.slice(7, 17) ?? "unknown";
    return c.json({ valid: true, keyPrefix });
  });

  return app;
}
