import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { logInterceptor } from "../../webui/log-interceptor.js";

export function createApiLogsRoutes() {
  const app = new Hono();

  app.get("/recent", (c) => {
    const linesParam = c.req.query("lines");
    const lines = Math.min(Math.max(parseInt(linesParam || "100", 10) || 100, 1), 1000);

    // Collect log entries via a temporary listener
    const entries: Array<{ level: string; message: string; timestamp: number }> = [];

    // Note: we can only capture new entries going forward.
    // For recent logs, we return what accumulates from the listener buffer.
    // The logInterceptor doesn't maintain a ring buffer, so we return an empty array
    // and document that GET /recent requires a follow-up with SSE /stream for live logs.
    // In a future iteration, a ring buffer can be added.

    return c.json({
      lines: entries.slice(-lines),
      count: entries.length,
      note: "Use GET /v1/logs/stream (SSE) for live log streaming",
    });
  });

  app.get("/stream", (c) => {
    return streamSSE(c, async (stream) => {
      let aborted = false;

      stream.onAbort(() => {
        aborted = true;
        if (cleanup) cleanup();
      });

      const cleanup = logInterceptor.addListener((entry) => {
        if (!aborted) {
          void stream.writeSSE({
            data: JSON.stringify(entry),
            event: "log",
          });
        }
      });

      await stream.writeSSE({
        data: JSON.stringify({
          level: "log",
          message: "Management API log stream connected",
          timestamp: Date.now(),
        }),
        event: "log",
      });

      await new Promise<void>((resolve) => {
        if (aborted) return resolve();
        stream.onAbort(() => resolve());
      });

      if (cleanup) cleanup();
    });
  });

  return app;
}
