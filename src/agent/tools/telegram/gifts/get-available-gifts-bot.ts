import { Type } from "@sinclair/typebox";
import type { Tool, ToolEntry } from "../../types.js";

const tool: Tool = {
  name: "telegram_get_available_gifts_bot",
  description:
    "List sendable Star Gifts via the Bot API (requires bot_token). Returns gift ID, Stars cost, upgrade cost, and remaining stock. For the userbot catalog (with resale/collectible info), use telegram_get_available_gifts instead.",
  category: "data-bearing",
  parameters: Type.Object({}),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tool executor signature
const executor = async (_params: any, context: any) => {
  const token = context.config?.telegram?.bot_token;
  if (!token) {
    return { success: false, error: "Bot token not configured" };
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/getAvailableGifts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  const data = (await res.json()) as {
    ok: boolean;
    description?: string;
    result?: {
      gifts: Array<{
        id: string;
        sticker?: { file_id?: string; emoji?: string };
        star_count: number;
        upgrade_star_count?: number;
        total_count?: number;
        remaining_count?: number;
        is_premium?: boolean;
      }>;
    };
  };

  if (!data.ok) {
    return { success: false, error: data.description || "API error" };
  }

  const gifts = data.result?.gifts ?? [];
  return {
    success: true,
    data: {
      total: gifts.length,
      gifts: gifts.map((g) => ({
        id: g.id,
        star_count: g.star_count,
        upgrade_star_count: g.upgrade_star_count ?? null,
        total_count: g.total_count ?? null,
        remaining_count: g.remaining_count ?? null,
        premium_only: g.is_premium || false,
        emoji: g.sticker?.emoji ?? null,
      })),
    },
  };
};

export const getAvailableGiftsBotEntry: ToolEntry = {
  tool,
  executor,
  mode: "bot",
  tags: ["finance"],
};
