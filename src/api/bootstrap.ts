import { ensureWorkspace } from "../workspace/manager.js";
import { AgentLifecycle } from "../agent/lifecycle.js";
import { getDefaultConfigPath, configExists } from "../config/loader.js";
import { createLogger } from "../utils/logger.js";
import { SHUTDOWN_TIMEOUT_MS } from "../constants/timeouts.js";
import type { ApiServerDeps } from "./deps.js";
import type { ApiConfig } from "../config/schema.js";

const log = createLogger("Bootstrap");

export async function startApiOnly(options: { config?: string; apiPort?: string }): Promise<void> {
  // 1. Ensure workspace directory exists
  await ensureWorkspace({ ensureTemplates: false, silent: false });

  const configPath = options.config ?? getDefaultConfigPath();
  const lifecycle = new AgentLifecycle();

  // 2. Build minimal deps — agent subsystems are null until POST /v1/agent/start
  const deps: ApiServerDeps = {
    agent: null,
    bridge: null,
    memory: null,
    toolRegistry: null,
    plugins: null,
    mcpServers: null,
    config: {
      enabled: false,
      port: 7777,
      host: "127.0.0.1",
      cors_origins: [],
      log_requests: false,
    },
    configPath,
    lifecycle,
    marketplace: null,
    userHookEvaluator: null,
  };

  // 3. Create and start API server
  const { ApiServer } = await import("./server.js");
  const apiConfig: ApiConfig = {
    enabled: true,
    port: parseInt(options.apiPort || process.env.TELETON_API_PORT || "7778"),
    key_hash: "",
    allowed_ips: [],
  };
  const server = new ApiServer(deps, apiConfig);

  // 4. Register lifecycle callbacks for deferred agent start/stop
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- dynamic import type
  let appInstance: InstanceType<typeof import("../index.js").TeletonApp> | null = null;

  lifecycle.registerCallbacks(
    // startFn — called when POST /v1/agent/start fires
    async () => {
      if (!configExists(configPath)) {
        throw new Error("Configuration not found. Complete setup via /v1/setup endpoints first.");
      }

      const { TeletonApp } = await import("../index.js");
      appInstance = new TeletonApp(configPath);

      // Start agent subsystems without WebUI/API servers (we already have our own)
      await appInstance.startAgentSubsystems();

      // Update API server deps with real objects
      server.updateDeps({
        agent: appInstance.getAgent(),
        bridge: appInstance.getBridge(),
        memory: appInstance.getMemory(),
        toolRegistry: appInstance.getToolRegistry(),
        plugins: appInstance.getPlugins(),
        config: appInstance.getWebuiConfig(),
      });
    },
    // stopFn — called when POST /v1/agent/stop fires
    async () => {
      if (appInstance) {
        await appInstance.stopAgentSubsystems();
        appInstance = null;

        // Reset deps to null so routes return 503
        server.updateDeps({
          agent: null,
          bridge: null,
          memory: null,
          toolRegistry: null,
          plugins: null,
        });
      }
    }
  );

  await server.start();

  // 5. Output credentials if requested via --json-credentials flag
  if (process.env.TELETON_JSON_CREDENTIALS === "true") {
    const creds = server.getCredentials();
    process.stdout.write(JSON.stringify(creds) + "\n");
  }

  log.info("API-only mode: complete setup via /v1/setup endpoints, then POST /v1/agent/start");

  // 6. Signal handlers for graceful shutdown
  let shutdownInProgress = false;
  const gracefulShutdown = async () => {
    if (shutdownInProgress) return;
    shutdownInProgress = true;

    const forceExit = setTimeout(() => {
      log.error("Shutdown timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      if (lifecycle.getState() === "running") {
        await lifecycle.stop();
      }
      await server.stop();
    } finally {
      clearTimeout(forceExit);
      process.exit(0);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- signal handler is fire-and-forget
  process.on("SIGINT", gracefulShutdown);
  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- signal handler is fire-and-forget
  process.on("SIGTERM", gracefulShutdown);
  process.on("unhandledRejection", (reason) => {
    log.error({ err: reason }, "Unhandled rejection");
  });
  process.on("uncaughtException", (error) => {
    log.error({ err: error }, "Uncaught exception");
    process.exit(1);
  });

  // 7. Keep process alive
  await new Promise(() => {});
}
