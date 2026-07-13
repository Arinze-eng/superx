import type { AgentRuntime } from "./agent/runtime.js";
import type { ITelegramBridge } from "./telegram/bridge-interface.js";
import type { Config } from "./config/schema.js";
import { createLogger } from "./utils/logger.js";

const log = createLogger("HeartbeatRunner");

export class HeartbeatRunner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private agent: AgentRuntime,
    private bridge: ITelegramBridge,
    private config: Config
  ) {}

  start(adminChatId: number, intervalMs: number): void {
    this.timer = setInterval(() => {
      void this.tick(adminChatId);
    }, intervalMs);
    this.timer.unref();
    log.info(
      `Heartbeat enabled: every ${Math.round(intervalMs / 60000)}min → admin ${adminChatId}`
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(adminChatId: number): Promise<void> {
    if (this.running) {
      log.debug("Heartbeat tick skipped (previous still running)");
      return;
    }
    const cfg = this.config.heartbeat;
    if (!cfg?.enabled) return;

    if (!adminChatId) return;

    this.running = true;
    try {
      const { getDatabase } = await import("./memory/index.js");
      const sessionChatId = `telegram:direct:${adminChatId}`;
      const toolContext = {
        bridge: this.bridge,
        db: getDatabase().getDb(),
        chatId: sessionChatId,
        isGroup: false,
        senderId: adminChatId,
        config: this.config,
      };

      // Let the agent decide what to do — it has telegram_send_message available
      await this.agent.processMessage({
        chatId: sessionChatId,
        userMessage: cfg.prompt,
        userName: "heartbeat",
        timestamp: Date.now(),
        isGroup: false,
        toolContext,
        isHeartbeat: true,
      });
      log.debug("Heartbeat: tick processed");
    } catch (error: unknown) {
      log.error({ err: error }, "Heartbeat error");
    } finally {
      this.running = false;
    }
  }
}
