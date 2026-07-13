import { Type } from "@sinclair/typebox";
import { Api } from "telegram";
import type { Tool, ToolExecutor, ToolResult } from "../../types.js";
import { getErrorMessage } from "../../../../utils/errors.js";
import { createLogger } from "../../../../utils/logger.js";
import { getClient, validateChannelUsername } from "../../../../sdk/telegram-utils.js";

const log = createLogger("Tools");

interface CreateChannelParams {
  title: string;
  about?: string;
  megagroup?: boolean;
  username?: string;
}

/**
 * Tool definition for creating channels
 */
export const telegramCreateChannelTool: Tool = {
  name: "telegram_create_channel",
  description:
    "Create a new channel (broadcast) or megagroup (chat). Set megagroup=true for group mode. Optionally assign a public username on creation.",
  parameters: Type.Object({
    title: Type.String({
      description: "Name of the channel/megagroup (max 128 characters)",
      maxLength: 128,
    }),
    about: Type.Optional(
      Type.String({
        description: "Description of the channel/megagroup (max 255 characters). Visible in info.",
        maxLength: 255,
      })
    ),
    megagroup: Type.Optional(
      Type.Boolean({
        description:
          "Create as megagroup (large group with chat) instead of broadcast channel. Default: false (creates broadcast channel).",
      })
    ),
    username: Type.Optional(
      Type.String({
        description:
          "Public username for the channel (5-32 chars, letters/numbers/underscores, no @). Makes the channel publicly discoverable at t.me/<username>. If the username is unavailable, the channel is still created without it.",
        maxLength: 32,
      })
    ),
  }),
};

/**
 * Executor for telegram_create_channel tool
 */
export const telegramCreateChannelExecutor: ToolExecutor<CreateChannelParams> = async (
  params,
  context
): Promise<ToolResult> => {
  try {
    const { title, about = "", megagroup = false, username } = params;

    // Get underlying GramJS client
    const gramJsClient = getClient(context.bridge);

    // Create channel
    const result = await gramJsClient.invoke(
      new Api.channels.CreateChannel({
        title,
        about,
        megagroup,
        broadcast: !megagroup,
      })
    );

    // Extract channel info from updates
    const chats = "chats" in result ? result.chats : [];
    const channel = chats[0];

    const data: Record<string, unknown> = {
      channelId: channel?.id?.toString() || "unknown",
      title,
      type: megagroup ? "megagroup" : "channel",
      accessHash:
        channel && channel.className === "Channel" ? channel.accessHash?.toString() : undefined,
    };

    // Set username if provided (best-effort — creation still succeeds on failure)
    if (username && channel) {
      const validation = validateChannelUsername(username);

      if (!validation.ok) {
        data.usernameError = validation.error;
      } else {
        const clean = validation.clean;
        try {
          await gramJsClient.invoke(
            new Api.channels.UpdateUsername({
              channel: channel as Api.Channel,
              username: clean,
            })
          );
          data.username = clean;
          data.link = `https://t.me/${clean}`;
        } catch (usernameError: unknown) {
          const msg = getErrorMessage(usernameError);
          if (msg.includes("USERNAME_OCCUPIED")) {
            data.usernameError = `Username @${clean} is already taken.`;
          } else if (msg.includes("CHANNELS_ADMIN_PUBLIC_TOO_MUCH")) {
            data.usernameError = "Too many public channels. Make some private first.";
          } else if (msg.includes("USERNAME_PURCHASE_AVAILABLE")) {
            data.usernameError = `Username @${clean} is available for purchase on fragment.com.`;
          } else {
            data.usernameError = msg;
          }
          log.warn({ err: usernameError }, "Failed to set username on new channel");
        }
      }
    }

    return {
      success: true,
      data,
    };
  } catch (error: unknown) {
    log.error({ err: error }, "Error creating channel");
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
};
