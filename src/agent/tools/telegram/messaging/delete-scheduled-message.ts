import { Type } from "@sinclair/typebox";
import { Api } from "telegram";
import type { Tool, ToolExecutor, ToolResult } from "../../types.js";
import { getErrorMessage } from "../../../../utils/errors.js";
import { createLogger } from "../../../../utils/logger.js";
import { getClient } from "../../../../sdk/telegram-utils.js";

const log = createLogger("Tools");

interface DeleteScheduledMessageParams {
  chatId: string;
  messageIds: number[];
}

export const telegramDeleteScheduledMessageTool: Tool = {
  name: "telegram_delete_scheduled_message",
  description:
    "Cancel one or more scheduled messages by their IDs. Use telegram_get_scheduled_messages first to find message IDs.",
  parameters: Type.Object({
    chatId: Type.String({
      description: "The chat ID where the scheduled messages are",
    }),
    messageIds: Type.Array(Type.Number(), {
      description: "Array of scheduled message IDs to cancel",
      minItems: 1,
      maxItems: 30,
    }),
  }),
};

export const telegramDeleteScheduledMessageExecutor: ToolExecutor<
  DeleteScheduledMessageParams
> = async (params, context): Promise<ToolResult> => {
  try {
    const { chatId, messageIds } = params;
    const gramJsClient = getClient(context.bridge);
    const entity = await gramJsClient.getEntity(chatId);

    await gramJsClient.invoke(
      new Api.messages.DeleteScheduledMessages({
        peer: entity,
        id: messageIds,
      })
    );

    log.info(`delete_scheduled: ${messageIds.length} messages cancelled in ${chatId}`);

    return {
      success: true,
      data: {
        chatId,
        deletedIds: messageIds,
        deletedCount: messageIds.length,
      },
    };
  } catch (error: unknown) {
    const errMsg = getErrorMessage(error);
    if (errMsg.includes("MESSAGE_ID_INVALID")) {
      return {
        success: false,
        error: "One or more message IDs are invalid or not scheduled messages.",
      };
    }
    log.error({ err: error }, "Error deleting scheduled messages");
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
};
