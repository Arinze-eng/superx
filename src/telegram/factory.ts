/* eslint-disable @typescript-eslint/no-non-null-assertion */

import type { Config } from "../config/schema.js";
import type { ITelegramBridge } from "./bridge-interface.js";
import { GramJSUserBridge } from "./bridges/user.js";
import { GrammyBotBridge } from "./bridges/bot.js";
import { TELETON_ROOT } from "../workspace/paths.js";
import { join } from "path";
import {
  TELEGRAM_CONNECTION_RETRIES,
  TELEGRAM_FLOOD_SLEEP_THRESHOLD,
} from "../constants/limits.js";

export function createBridge(config: Config): ITelegramBridge {
  if (config.telegram.mode === "bot") {
    return new GrammyBotBridge({
      bot_token: config.telegram.bot_token!,
    });
  }

  return new GramJSUserBridge({
    apiId: config.telegram.api_id!,
    apiHash: config.telegram.api_hash!,
    phone: config.telegram.phone!,
    sessionPath: join(TELETON_ROOT, "telegram_session.txt"),
    connectionRetries: TELEGRAM_CONNECTION_RETRIES,
    autoReconnect: true,
    floodSleepThreshold: TELEGRAM_FLOOD_SLEEP_THRESHOLD,
  });
}
