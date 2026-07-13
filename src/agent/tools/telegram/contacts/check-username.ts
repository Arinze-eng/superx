/* eslint-disable @typescript-eslint/no-explicit-any */
import { Type } from "@sinclair/typebox";
import { Api } from "telegram";
import type { Tool, ToolExecutor, ToolResult } from "../../types.js";
import { getErrorMessage } from "../../../../utils/errors.js";
import { createLogger } from "../../../../utils/logger.js";
import { getClient } from "../../../../sdk/telegram-utils.js";

const log = createLogger("Tools");

/**
 * Parameters for checking username
 */
interface CheckUsernameParams {
  username: string;
}

/**
 * Tool definition for checking username availability
 */
export const telegramCheckUsernameTool: Tool = {
  name: "telegram_check_username",
  description:
    "Resolve an @username to its entity (user, bot, channel, or group) with type and ID. Also reveals whether an unclaimed username is available.",
  category: "data-bearing",
  parameters: Type.Object({
    username: Type.String({
      description: "Username to check (with or without @)",
    }),
  }),
};

/**
 * Executor for telegram_check_username tool
 */
export const telegramCheckUsernameExecutor: ToolExecutor<CheckUsernameParams> = async (
  params,
  context
): Promise<ToolResult> => {
  try {
    const { username } = params;
    const cleanUsername = username.replace("@", "").toLowerCase();

    if (!cleanUsername) {
      return {
        success: false,
        error: "Username cannot be empty",
      };
    }

    const gramJsClient = getClient(context.bridge);

    try {
      // Try to resolve the username
      const result = await gramJsClient.invoke(
        new Api.contacts.ResolveUsername({
          username: cleanUsername,
        })
      );

      // Determine entity type and extract info
      let entityType: string | null = null;

      let entityInfo: Record<string, any> = {};

      if (result.users && result.users.length > 0) {
        const user = result.users[0] as Api.User;
        entityType = user.bot ? "bot" : "user";
        entityInfo = {
          id: user.id.toString(),
          username: user.username,
          firstName: user.firstName || null,
          lastName: user.lastName || null,
          isBot: user.bot || false,
          isPremium: user.premium || false,
          isVerified: user.verified || false,
        };
      } else if (result.chats && result.chats.length > 0) {
        const chat = result.chats[0];
        if (chat.className === "Channel") {
          const channel = chat as Api.Channel;
          entityType = channel.megagroup ? "group" : "channel";
          entityInfo = {
            id: channel.id.toString(),
            username: channel.username,
            title: channel.title,
            isVerified: channel.verified || false,
            participantsCount: channel.participantsCount || null,
            isMegagroup: channel.megagroup || false,
            isBroadcast: channel.broadcast || false,
          };
        } else if (chat.className === "Chat") {
          const group = chat as Api.Chat;
          entityType = "group";
          entityInfo = {
            id: group.id.toString(),
            title: group.title,
            participantsCount: group.participantsCount || null,
          };
        }
      }

      log.info(`check_username: @${cleanUsername} → ${entityType}`);

      return {
        success: true,
        data: {
          username: cleanUsername,
          exists: true,
          type: entityType,
          entity: entityInfo,
        },
      };
    } catch (innerError: unknown) {
      // Username not found
      const innerMsg = getErrorMessage(innerError);
      if (innerMsg.includes("USERNAME_NOT_OCCUPIED") || innerMsg.includes("No user has")) {
        log.info(`check_username: @${cleanUsername} → not found (available)`);
        return {
          success: true,
          data: {
            username: cleanUsername,
            exists: false,
            type: null,
            available: true,
          },
        };
      }

      // Invalid username format
      if (innerMsg.includes("USERNAME_INVALID")) {
        return {
          success: false,
          error: `Invalid username format: @${cleanUsername}`,
        };
      }

      throw innerError;
    }
  } catch (error: unknown) {
    log.error({ err: error }, "Error checking username");
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
};
