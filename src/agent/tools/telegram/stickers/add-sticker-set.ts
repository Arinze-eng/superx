import { Type } from "@sinclair/typebox";
import { Api } from "telegram";
import type { Tool, ToolExecutor, ToolResult } from "../../types.js";
import { getErrorMessage } from "../../../../utils/errors.js";
import { createLogger } from "../../../../utils/logger.js";
import { getClient } from "../../../../sdk/telegram-utils.js";

const log = createLogger("Tools");

/**
 * Parameters for telegram_add_sticker_set tool
 */
interface AddStickerSetParams {
  shortName: string;
}

/**
 * Tool definition for adding sticker packs
 */
export const telegramAddStickerSetTool: Tool = {
  name: "telegram_add_sticker_set",
  description: "Install a sticker pack to your account by its short name.",
  parameters: Type.Object({
    shortName: Type.String({
      description:
        "Short name of the sticker pack (e.g., 'Animals' from t.me/addstickers/Animals). Obtainable from telegram_search_stickers results.",
    }),
  }),
};

/**
 * Executor for telegram_add_sticker_set tool
 */
export const telegramAddStickerSetExecutor: ToolExecutor<AddStickerSetParams> = async (
  params,
  context
): Promise<ToolResult> => {
  try {
    const { shortName } = params;

    // Get underlying GramJS client
    const gramJsClient = getClient(context.bridge);

    // Get the sticker set info first
    const stickerSet = await gramJsClient.invoke(
      new Api.messages.GetStickerSet({
        stickerset: new Api.InputStickerSetShortName({
          shortName,
        }),
        hash: 0,
      })
    );

    // Install the sticker set
    await gramJsClient.invoke(
      new Api.messages.InstallStickerSet({
        stickerset: new Api.InputStickerSetShortName({
          shortName,
        }),
        archived: false,
      })
    );

    return {
      success: true,
      data: {
        shortName,
        title:
          stickerSet.className === "messages.StickerSet"
            ? stickerSet.set?.title || shortName
            : shortName,
        count: stickerSet.className === "messages.StickerSet" ? stickerSet.set?.count || 0 : 0,
      },
    };
  } catch (error) {
    log.error({ err: error }, "Error adding sticker set");
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
};
