import { Type } from "@sinclair/typebox";
import type { Tool, ToolExecutor, ToolResult } from "../../types.js";
import { getErrorMessage } from "../../../../utils/errors.js";
import { createLogger } from "../../../../utils/logger.js";

const log = createLogger("Tools");

/**
 * Parameters for telegram_get_chat_info tool
 */
interface GetChatInfoParams {
  chatId: string;
}

/**
 * Tool definition for getting detailed chat information
 */
export const telegramGetChatInfoTool: Tool = {
  name: "telegram_get_chat_info",
  description:
    "Get detailed info about a chat, group, channel, or user. Returns title, description, member count, and metadata.",
  category: "data-bearing",
  parameters: Type.Object({
    chatId: Type.String({
      description:
        "The chat ID or username to get info about. Examples: '-1001234567890', '@channelname', '123456789'",
    }),
  }),
};

/**
 * Executor for telegram_get_chat_info tool
 */
export const telegramGetChatInfoExecutor: ToolExecutor<GetChatInfoParams> = async (
  params,
  context
): Promise<ToolResult> => {
  try {
    const { chatId } = params;

    const info = await context.bridge.getChatInfo(chatId);

    return {
      success: true,
      data: info,
    };
  } catch (error) {
    log.error({ err: error }, "Error getting chat info");
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
};
