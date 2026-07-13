import { Hono } from "hono";
import type { Database } from "better-sqlite3";
import { createProblemResponse } from "../schemas/common.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("ManagementAPI");

export function createApiMemoryRoutes(getDb: () => Database | null) {
  const app = new Hono();

  app.delete("/sessions/:chatId", (c) => {
    const db = getDb();
    if (!db) {
      return createProblemResponse(c, 503, "Service Unavailable", "Database not available");
    }

    const chatId = c.req.param("chatId");

    const result = db.prepare("DELETE FROM sessions WHERE chat_id = ?").run(chatId);

    if (result.changes === 0) {
      return createProblemResponse(c, 404, "Not Found", `No session found for chat ${chatId}`);
    }

    log.info(`Session deleted for chat ${chatId} via Management API`);
    return c.json({ deleted: result.changes, chatId });
  });

  app.post("/sessions/prune", async (c) => {
    const db = getDb();
    if (!db) {
      return createProblemResponse(c, 503, "Service Unavailable", "Database not available");
    }

    let maxAgeDays = 30;
    try {
      const body = await c.req.json<{ maxAgeDays?: number }>();
      if (body.maxAgeDays && body.maxAgeDays > 0) {
        maxAgeDays = body.maxAgeDays;
      }
    } catch {
      // Use default
    }

    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

    const result = db.prepare("DELETE FROM sessions WHERE updated_at < ?").run(cutoff);

    log.info(`Pruned ${result.changes} sessions older than ${maxAgeDays} days via Management API`);
    return c.json({ pruned: result.changes, maxAgeDays });
  });

  return app;
}
