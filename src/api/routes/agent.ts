import { Hono } from "hono";
import type { Context } from "hono";
import type { AgentLifecycle } from "../../agent/lifecycle.js";
import { createProblemResponse } from "../schemas/common.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("AgentRoutes");

/**
 * Per-server error mapper. The API emits RFC 9457 problem+json while the WebUI
 * emits `{ error }`, so each server injects its own envelope formatter; the
 * shared lifecycle logic (guard rules, fire-and-forget transitions) lives here.
 */
export type AgentRouteErrorMapper = (
  c: Context,
  status: number,
  title: string,
  detail: string
) => Response;

/** Default mapper used by the Management API (RFC 9457 problem+json). */
export const problemErrorMapper: AgentRouteErrorMapper = (c, status, title, detail) =>
  createProblemResponse(c, status, title, detail);

/**
 * Agent lifecycle routes: start, stop, status and restart.
 *
 * Shared by the WebUI (`/api/agent/*`) and Management API (`/v1/agent/*`)
 * servers. The unavailable (503) and transient-conflict (409) responses use the
 * injected `errorResponse` mapper so each server keeps its own error envelope;
 * the `{ state }` conflicts (running/stopped) and success payloads are identical
 * across servers and emitted directly.
 */
export function createAgentRoutes(
  lifecycle: AgentLifecycle | null | undefined,
  options: { errorResponse?: AgentRouteErrorMapper } = {}
) {
  const errorResponse = options.errorResponse ?? problemErrorMapper;
  const app = new Hono();

  const unavailable = (c: Context) =>
    errorResponse(c, 503, "Service Unavailable", "Agent lifecycle not available");

  app.post("/start", async (c) => {
    if (!lifecycle) return unavailable(c);

    const state = lifecycle.getState();
    if (state === "running") {
      return c.json({ state: "running" }, 409);
    }
    if (state === "stopping") {
      return errorResponse(c, 409, "Conflict", "Agent is currently stopping, please wait");
    }

    // Fire-and-forget: start is async, we return immediately
    lifecycle.start().catch((err: Error) => {
      log.error({ err }, "Agent start failed");
    });
    return c.json({ state: "starting" });
  });

  app.post("/stop", async (c) => {
    if (!lifecycle) return unavailable(c);

    const state = lifecycle.getState();
    if (state === "stopped") {
      return c.json({ state: "stopped" }, 409);
    }
    if (state === "starting") {
      return errorResponse(c, 409, "Conflict", "Agent is currently starting, please wait");
    }

    // Fire-and-forget: stop is async, we return immediately
    lifecycle.stop().catch((err: Error) => {
      log.error({ err }, "Agent stop failed");
    });
    return c.json({ state: "stopping" });
  });

  app.get("/status", (c) => {
    if (!lifecycle) return unavailable(c);
    return c.json({
      state: lifecycle.getState(),
      uptime: lifecycle.getUptime(),
      error: lifecycle.getError() ?? null,
    });
  });

  app.post("/restart", async (c) => {
    if (!lifecycle) return unavailable(c);

    const state = lifecycle.getState();
    if (state === "starting" || state === "stopping") {
      return errorResponse(c, 409, "Conflict", `Agent is currently ${state}, please wait`);
    }

    // Fire-and-forget restart: stop then start
    (async () => {
      try {
        if (lifecycle.getState() === "running") {
          await lifecycle.stop();
        }
        await lifecycle.start();
        log.info("Agent restarted");
      } catch (error) {
        log.error({ err: error }, "Agent restart failed");
      }
    })().catch(() => {});

    return c.json({ state: "restarting" });
  });

  return app;
}
