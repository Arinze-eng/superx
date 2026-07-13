import { Type } from "@sinclair/typebox";
import type { Tool, ToolEntry } from "../../types.js";

const tool: Tool = {
  name: "telegram_get_user_gifts",
  description:
    "Get gifts publicly displayed on a user's Telegram profile via Bot API (requires bot_token). Only returns gifts the user has chosen to show. For the full received-gifts inventory including private ones, use telegram_get_my_gifts.",
  category: "data-bearing",
  parameters: Type.Object({
    user_id: Type.Number({ description: "Telegram user ID to look up" }),
  }),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tool executor signature
const executor = async (params: any, context: any) => {
  const token = context.config?.telegram?.bot_token;
  if (!token) {
    return { success: false, error: "Bot token not configured" };
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/getUserGifts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: params.user_id }),
  });

  const data = (await res.json()) as {
    ok: boolean;
    description?: string;
    result?: {
      total_count: number;
      gifts: Array<{
        type: string;
        gift?: { id?: string; star_count?: number };
        sender_user?: { id: number; first_name?: string; username?: string };
        send_date?: number;
        text?: string;
        is_private?: boolean;
        convert_star_count?: number;
      }>;
    };
  };

  if (!data.ok) {
    return { success: false, error: data.description || "API error" };
  }

  const result = data.result ?? { total_count: 0, gifts: [] };
  return {
    success: true,
    data: {
      total: result.total_count,
      gifts: result.gifts.map((g) => ({
        type: g.type,
        gift_id: g.gift?.id,
        star_count: g.gift?.star_count,
        sender: g.sender_user
          ? {
              id: g.sender_user.id,
              name: g.sender_user.first_name,
              username: g.sender_user.username,
            }
          : null,
        date: g.send_date,
        text: g.text || null,
        private: g.is_private || false,
        convert_stars: g.convert_star_count,
      })),
    },
  };
};

export const getUserGiftsEntry: ToolEntry = {
  tool,
  executor,
  mode: "bot",
  tags: ["finance"],
};
