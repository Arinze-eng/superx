import { Hono } from "hono";
import { timeout } from "hono/timeout";
import type { serve, ServerType } from "@hono/node-server";
import type { HttpBindings } from "@hono/node-server";
import { createServer as createHttpsServer } from "node:https";
import { randomBytes } from "node:crypto";

import { HTTPException } from "hono/http-exception";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../utils/logger.js";
import { hashApiKey } from "../utils/crypto-tokens.js";
import { TELETON_ROOT } from "../workspace/paths.js";
import { ensureTlsCert, type TlsCert } from "./tls.js";
import type { ApiServerDeps } from "./deps.js";
import { createDepsAdapter } from "./deps.js";
import type { ApiConfig } from "../config/schema.js";
import { createLifecycleSSE } from "../webui/lifecycle-sse.js";
import { applySecurityMiddleware, sharedBodyLimit } from "../webui/http-common.js";
import { startHonoServer, stopHonoServer } from "../utils/http-server.js";
import { createProblem } from "./schemas/common.js";

// Middleware
import { requestId } from "./middleware/request-id.js";
import { createAuthMiddleware } from "./middleware/auth.js";
import { globalRateLimit, mutatingRateLimit, readRateLimit } from "./middleware/rate-limit.js";
import { auditMiddleware } from "./middleware/audit.js";

// Existing WebUI route factories
import { SHARED_ROUTE_FACTORIES } from "../webui/routes/shared.js";
import { createSetupRoutes } from "../webui/routes/setup.js";

// New API routes
import { createAgentRoutes } from "./routes/agent.js";
import { createSystemRoutes } from "./routes/system.js";
import { createAuthRoutes } from "./routes/auth.js";
import { createApiLogsRoutes } from "./routes/logs.js";
import { createApiMemoryRoutes } from "./routes/memory.js";

const log = createLogger("ManagementAPI");

/** API key prefix */
const KEY_PREFIX = "tltn_";

/** Generate a new API key with tltn_ prefix */
function generateApiKey(): string {
  return KEY_PREFIX + randomBytes(32).toString("base64url");
}

/** Check setup completeness by probing key files */
function getSetupStatus(): Record<string, boolean> {
  return {
    workspace: existsSync(join(TELETON_ROOT, "workspace")),
    config: existsSync(join(TELETON_ROOT, "config.yaml")),
    wallet: existsSync(join(TELETON_ROOT, "wallet.json")),
    telegram_session: existsSync(join(TELETON_ROOT, "telegram_session.txt")),
    embeddings_cached: (() => {
      try {
        return (
          statSync(join(TELETON_ROOT, "models", "Xenova", "all-MiniLM-L6-v2", "onnx", "model.onnx"))
            .size > 1_000_000
        );
      } catch {
        return false;
      }
    })(),
  };
}

/** SSE path patterns that must be excluded from timeout middleware */
const SSE_PATHS = ["/v1/agent/events", "/v1/logs/stream"];

export interface ApiCredentials {
  apiKey: string;
  fingerprint: string;
  port: number;
}

export class ApiServer {
  private app: Hono<{ Bindings: HttpBindings }>;
  private server: ServerType | null = null;
  private deps: ApiServerDeps;
  private config: ApiConfig;
  private tls: TlsCert | null = null;
  private apiKey: string | null = null;
  private keyHash: string;

  constructor(deps: ApiServerDeps, config: ApiConfig) {
    this.deps = deps;
    this.config = config;
    this.app = new Hono<{ Bindings: HttpBindings }>();

    // Determine key hash: use configured or generate new
    if (config.key_hash) {
      this.keyHash = config.key_hash;
    } else {
      this.apiKey = generateApiKey();
      this.keyHash = hashApiKey(this.apiKey);
    }
  }

  /** Get current API key hash (for persisting in config) */
  getKeyHash(): string {
    return this.keyHash;
  }

  /** Update live deps (e.g., when agent starts/stops) */
  updateDeps(partial: Partial<ApiServerDeps>): void {
    Object.assign(this.deps, partial);
  }

  private setupMiddleware(): void {
    // 0. Extract source IP from Node.js socket and expose via c.env.ip
    this.app.use("*", async (c, next) => {
      const incoming = c.env?.incoming;
      if (incoming?.socket?.remoteAddress) {
        // Expose IP in env for auth middleware
        (c.env as Record<string, unknown>).ip = incoming.socket.remoteAddress;
      }
      await next();
    });

    // 1. Request ID
    this.app.use("*", requestId);

    // 2. Body limit (2MB)
    this.app.use(
      "*",
      sharedBodyLimit((c) =>
        c.json(createProblem(413, "Payload Too Large", "Request body exceeds 2MB limit"), 413, {
          "Content-Type": "application/problem+json",
        })
      )
    );

    // 3. Timeout (30s) — exclude SSE endpoints
    this.app.use("*", async (c, next) => {
      if (SSE_PATHS.some((p) => c.req.path === p)) {
        return next();
      }
      return timeout(30_000)(c, next);
    });

    // 4. Security headers (HSTS — HTTPS-only API)
    applySecurityMiddleware(this.app, { hsts: true });
  }

  private setupRoutes(): void {
    // Health probes at root (no auth)
    this.app.get("/healthz", (c) => c.json({ status: "ok" }));

    this.app.get("/readyz", (c) => {
      const lifecycle = this.deps.lifecycle;
      if (!lifecycle) {
        return c.json({ status: "not_ready", reason: "lifecycle not initialized" }, 503);
      }
      const state = lifecycle.getState();
      if (state === "running") {
        return c.json({ status: "ready", state });
      }

      // Include setup completeness when agent is not running
      const setup = getSetupStatus();
      return c.json({ status: "not_ready", state, setup }, 503);
    });

    // Auth middleware for /v1/* routes
    const authMw = createAuthMiddleware({
      keyHash: this.keyHash,
      allowedIps: this.config.allowed_ips,
    });
    this.app.use("/v1/*", authMw);

    // Rate limiting after auth
    this.app.use("/v1/*", globalRateLimit);
    this.app.use("/v1/*", mutatingRateLimit);
    this.app.use("/v1/*", readRateLimit);

    // Audit logging
    this.app.use("/v1/*", auditMiddleware);

    // OpenAPI spec endpoint
    this.app.get("/v1/openapi.json", (c) => {
      return c.json({
        openapi: "3.1.0",
        info: {
          title: "Teleton Management API",
          version: "1.0.0",
          description: "HTTPS management API for remote teleton agent administration",
        },
        servers: [{ url: `https://localhost:${this.config.port}` }],
      });
    });

    // Adapt deps for existing WebUI route factories
    const adaptedDeps = createDepsAdapter(this.deps);

    // Mount existing WebUI route factories under /v1/
    for (const [seg, make] of SHARED_ROUTE_FACTORIES) {
      this.app.route(`/v1/${seg}`, make(adaptedDeps));
    }

    // Setup routes (no agent deps needed, keyHash for config persistence)
    this.app.route("/v1/setup", createSetupRoutes({ keyHash: this.keyHash }));

    // Agent lifecycle SSE stream (start/stop/status/restart live in createAgentRoutes)
    this.app.get("/v1/agent/events", (c) => {
      const lifecycle = this.deps.lifecycle;
      if (!lifecycle) {
        return c.json(
          createProblem(503, "Service Unavailable", "Agent lifecycle not available"),
          503,
          {
            "Content-Type": "application/problem+json",
          }
        );
      }

      return createLifecycleSSE(c, lifecycle);
    });

    // New API-only routes under /v1/
    this.app.route("/v1/agent", createAgentRoutes(this.deps.lifecycle));
    this.app.route("/v1/system", createSystemRoutes());
    this.app.route("/v1/auth", createAuthRoutes());
    this.app.route("/v1/api-logs", createApiLogsRoutes());
    this.app.route(
      "/v1/api-memory",
      createApiMemoryRoutes(() => this.deps.memory?.db ?? null)
    );

    // Global error handler — RFC 9457
    this.app.onError((err, c) => {
      log.error({ err }, "Management API error");

      // HTTPException from Hono middleware
      if (err instanceof HTTPException) {
        if (err.res) return err.res;
        return c.json(createProblem(err.status, err.message || "Error"), err.status as 400, {
          "Content-Type": "application/problem+json",
        });
      }

      return c.json(
        createProblem(500, "Internal Server Error", err.message || "An unexpected error occurred"),
        500,
        { "Content-Type": "application/problem+json" }
      );
    });
  }

  async start(): Promise<void> {
    // Generate TLS cert
    const tls = await ensureTlsCert(TELETON_ROOT);
    this.tls = tls;

    // Setup app
    this.setupMiddleware();
    this.setupRoutes();

    try {
      this.server = await startHonoServer({
        fetch: this.app.fetch as Parameters<typeof serve>[0]["fetch"],
        port: this.config.port,
        createServer: createHttpsServer,
        serverOptions: { cert: tls.cert, key: tls.key },
        maxConnections: 20,
        onListen: (info) => {
          log.info(`Management API server running on https://localhost:${info.port}`);
          if (this.apiKey) {
            log.info(
              `API key: ${KEY_PREFIX}${this.apiKey.slice(KEY_PREFIX.length, KEY_PREFIX.length + 4)}...`
            );
          }
          log.info(`TLS fingerprint: ${tls.fingerprint.slice(0, 16)}...`);
        },
      });
    } catch (err) {
      log.error({ err }, "Management API server error");
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.server) {
      await stopHonoServer(this.server);
      log.info("Management API server stopped");
    }
  }

  getCredentials(): ApiCredentials | null {
    if (!this.tls) return null;
    return {
      apiKey: this.apiKey ?? "",
      fingerprint: this.tls.fingerprint,
      port: this.config.port,
    };
  }
}
