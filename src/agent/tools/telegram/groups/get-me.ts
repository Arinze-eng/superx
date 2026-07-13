import { Type } from "@sinclair/typebox";
import type { Tool, ToolExecutor, ToolResult } from "../../types.js";
import { getErrorMessage } from "../../../../utils/errors.js";
import { createLogger } from "../../../../utils/logger.js";

const log = createLogger("Tools");

/**
 * Tool definition for getting own user information
 */
export const telegramGetMeTool: Tool = {
  name: "telegram_get_me",
  description:
    "Get the agent's own Telegram profile: account user ID, @username, name, phone number, and premium status. No parameters needed. To look up another user's profile, use telegram_get_user_info.",
  category: "data-bearing",
  parameters: Type.Object({}), // No parameters needed
};

/**
 * Executor for telegram_get_me tool
 */
export const telegramGetMeExecutor: ToolExecutor<{}> = async (
  _params,
  context
): Promise<ToolResult> => {
  try {
    const me = await context.bridge.getMe();

    if (!me) {
      return { success: false, error: "Could not retrieve account info" };
    }

    return {
      success: true,
      data: {
        id: me.id.toString(),
        username: me.username || null,
        firstName: me.firstName,
        isBot: me.isBot,
      },
    };
  } catch (error) {
    log.error({ err: error }, "Error getting own Telegram user info");
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
};
