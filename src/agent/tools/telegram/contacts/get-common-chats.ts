/* eslint-disable @typescript-eslint/no-explicit-any */
import { Type } from "@sinclair/typebox";
import type { Tool, ToolExecutor, ToolResult } from "../../types.js";
import { Api } from "telegram";
import { toLong } from "../../../../utils/gramjs-bigint.js";
import { getErrorMessage } from "../../../../utils/errors.js";
import { createLogger } from "../../../../utils/logger.js";
import { getClient } from "../../../../sdk/telegram-utils.js";

const log = createLogger("Tools");

/**
 * Parameters for telegram_get_common_chats tool
 */
interface GetCommonChatsParams {
  userId: string;
  limit?: number;
}

/**
 * Tool definition for getting common chats
 */
export const telegramGetCommonChatsTool: Tool = {
  name: "telegram_get_common_chats",
  description:
    "Find groups and channels you share with another user. Example: 'what groups do we share with @durov?'.",
  category: "data-bearing",
  parameters: Type.Object({
    userId: Type.String({
      description:
        "The user ID or username to find common chats with (e.g., '123456789' or '@username')",
    }),
    limit: Type.Optional(
      Type.Number({
        description: "Maximum number of common chats to return (default: 50, max: 100)",
        minimum: 1,
        maximum: 100,
      })
    ),
  }),
};

/**
 * Executor for telegram_get_common_chats tool
 */
export const telegramGetCommonChatsExecutor: ToolExecutor<GetCommonChatsParams> = async (
  params,
  context
): Promise<ToolResult> => {
  try {
    const { userId, limit = 50 } = params;

    // Get underlying GramJS client
    const gramJsClient = getClient(context.bridge);

    // Get user entity
    const userEntity = await gramJsClient.getInputEntity(userId);

    // Get common chats using GramJS
    const result = await gramJsClient.invoke(
      new Api.messages.GetCommonChats({
        userId: userEntity,
        maxId: toLong(0),
        limit,
      })
    );

    // Parse common chats
    const commonChats = result.chats.map((chat: any) => {
      const isChannel = chat.className === "Channel";
      const chan = isChannel ? (chat as Api.Channel) : undefined;
      return {
        chatId: chat.id?.toString(),
        title: "title" in chat ? chat.title : null,
        username: chan?.username || null,
        isChannel: chan?.broadcast || false,
        isMegagroup: chan?.megagroup || false,
        membersCount: chan?.participantsCount || null,
      };
    });

    return {
      success: true,
      data: {
        userId,
        count: commonChats.length,
        chats: commonChats,
      },
    };
  } catch (error) {
    log.error({ err: error }, "Error getting common Telegram chats");
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
};
