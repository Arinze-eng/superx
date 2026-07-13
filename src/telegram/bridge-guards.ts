import type { ITelegramBridge } from "./bridge-interface.js";
import type { GrammyBotBridge } from "./bridges/bot.js";
import type { GramJSUserBridge } from "./bridges/user.js";

export function isBotBridge(bridge: ITelegramBridge): bridge is GrammyBotBridge {
  return bridge.getMode() === "bot";
}

export function isUserBridge(bridge: ITelegramBridge): bridge is GramJSUserBridge {
  return bridge.getMode() === "user";
}
