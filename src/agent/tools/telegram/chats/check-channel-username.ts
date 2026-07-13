import { Type } from "@sinclair/typebox";
import { Api } from "telegram";
import type { Tool, ToolExecutor, ToolResult } from "../../types.js";
import { getErrorMessage } from "../../../../utils/errors.js";
import { createLogger } from "../../../../utils/logger.js";
import {
  getClient,
  validateChannelUsername,
  resolveChannel,
  cleanUsername,
  mapTelegramError,
} from "../../../../sdk/telegram-utils.js";

const log = createLogger("Tools");

interface CheckChannelUsernameParams {
  channelId: string;
  username: string;
}

export const telegramCheckChannelUsernameTool: Tool = {
  name: "telegram_check_channel_username",
  description:
    "Verify whether a username is available for a specific channel/group you admin. Returns availability status; use telegram_set_channel_username to apply.",
  parameters: Type.Object({
    channelId: Type.String({
      description: "Channel or group ID to check availability for",
    }),
    username: Type.String({
      description:
        "Username to check (5-32 chars, letters/numbers/underscores, no @ symbol). Example: 'my_channel'",
    }),
  }),
};

export const telegramCheckChannelUsernameExecutor: ToolExecutor<
  CheckChannelUsernameParams
> = async (params, context): Promise<ToolResult> => {
  try {
    const { channelId, username } = params;
    const validation = validateChannelUsername(username);
    if (!validation.ok) {
      return { success: false, error: validation.error };
    }
    const clean = validation.clean;

    const gramJsClient = getClient(context.bridge);
    const channel = await resolveChannel(context.bridge, channelId);
    const available = await gramJsClient.invoke(
      new Api.channels.CheckUsername({
        channel,
        username: clean,
      })
    );

    return {
      success: true,
      data: {
        channelId: channel.id.toString(),
        username: clean,
        available: !!available,
      },
    };
  } catch (error: unknown) {
    log.error({ err: error }, "Error checking channel username");

    // USERNAME_PURCHASE_AVAILABLE is reported as an available-for-purchase result, not an error
    if (getErrorMessage(error).includes("USERNAME_PURCHASE_AVAILABLE")) {
      return {
        success: true,
        data: {
          channelId: params.channelId,
          username: cleanUsername(params.username),
          available: false,
          purchaseAvailable: true,
          message: "This username is available for purchase on fragment.com",
        },
      };
    }

    return mapTelegramError(error, {
      USERNAME_INVALID: `Invalid username format: "${params.username}"`,
    });
  }
};
