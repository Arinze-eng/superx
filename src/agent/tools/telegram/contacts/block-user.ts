import { Type } from "@sinclair/typebox";
import type { Tool, ToolExecutor, ToolResult } from "../../types.js";
import { Api } from "telegram";
import { getErrorMessage } from "../../../../utils/errors.js";
import { createLogger } from "../../../../utils/logger.js";
import { getClient } from "../../../../sdk/telegram-utils.js";

const log = createLogger("Tools");

/**
 * Parameters for telegram_block_user tool
 */
interface BlockUserParams {
  userId: string;
}

/**
 * Tool definition for blocking Telegram users
 */
export const telegramBlockUserTool: Tool = {
  name: "telegram_block_user",
  description:
    "Block a user. They won't be able to message you or add you to groups. Not notified. Example: 'block @spammer'. For unblocking use telegram_unban_user.",
  parameters: Type.Object({
    userId: Type.String({
      description: "The user ID or username to block (e.g., '123456789' or '@username')",
    }),
  }),
};

/**
 * Executor for telegram_block_user tool
 */
export const telegramBlockUserExecutor: ToolExecutor<BlockUserParams> = async (
  params,
  context
): Promise<ToolResult> => {
  try {
    const { userId } = params;

    // Get underlying GramJS client
    const gramJsClient = getClient(context.bridge);

    // Get user entity
    const userEntity = await gramJsClient.getInputEntity(userId);

    // Block user using GramJS
    await gramJsClient.invoke(
      new Api.contacts.Block({
        id: userEntity,
      })
    );

    return {
      success: true,
      data: {
        userId,
        blocked: true,
      },
    };
  } catch (error) {
    log.error({ err: error }, "Error blocking Telegram user");
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
};
