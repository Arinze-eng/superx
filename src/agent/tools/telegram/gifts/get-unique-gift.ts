/* eslint-disable @typescript-eslint/no-explicit-any */
import { Type } from "@sinclair/typebox";
import { Api } from "telegram";
import type { Tool, ToolExecutor, ToolResult } from "../../types.js";
import { getErrorMessage } from "../../../../utils/errors.js";
import { createLogger } from "../../../../utils/logger.js";
import { getClient } from "../../../../sdk/telegram-utils.js";

const log = createLogger("Tools");

interface GetUniqueGiftParams {
  slug: string;
}

export const telegramGetUniqueGiftTool: Tool = {
  name: "telegram_get_unique_gift",
  description:
    "Look up a unique collectible NFT gift by its slug (from t.me/nft/<slug>). Returns full NFT details including owner, attributes, price, and availability.",
  category: "data-bearing",
  parameters: Type.Object({
    slug: Type.String({
      description: "NFT slug from the t.me/nft/<slug> URL",
    }),
  }),
};

export const telegramGetUniqueGiftExecutor: ToolExecutor<GetUniqueGiftParams> = async (
  params,
  context
): Promise<ToolResult> => {
  try {
    const { slug } = params;
    const gramJsClient = getClient(context.bridge);

    const result = await gramJsClient.invoke(new Api.payments.GetUniqueStarGift({ slug }));

    const gift = result.gift;

    const users = result.users || [];
    const ownerUserId =
      gift.className === "StarGiftUnique" && gift.ownerId && "userId" in gift.ownerId
        ? gift.ownerId.userId?.toString()
        : undefined;
    const ownerUser = users.find(
      (u: any) => u.className === "User" && u.id?.toString() === ownerUserId
    );

    if (gift.className !== "StarGiftUnique") {
      return { success: false, error: "Gift is not a unique collectible" };
    }

    log.info(`get_unique_gift: slug=${slug} title=${gift.title}`);

    return {
      success: true,
      data: {
        id: gift.id?.toString(),
        giftId: gift.giftId?.toString(),
        slug: gift.slug,
        title: gift.title,
        num: gift.num,
        owner: {
          id: ownerUserId,
          name: gift.ownerName || undefined,
          address: gift.ownerAddress || undefined,
          username:
            ownerUser && ownerUser.className === "User"
              ? ownerUser.username || undefined
              : undefined,
          firstName:
            ownerUser && ownerUser.className === "User"
              ? ownerUser.firstName || undefined
              : undefined,
          lastName:
            ownerUser && ownerUser.className === "User"
              ? ownerUser.lastName || undefined
              : undefined,
        },
        giftAddress: gift.giftAddress || undefined,
        attributes: (gift.attributes || []).map((attr: any) => ({
          type: attr.className?.replace("StarGiftAttribute", "").toLowerCase(),
          name: "name" in attr ? attr.name : undefined,
          rarityPercent:
            "rarity" in attr && "permille" in attr.rarity
              ? Number((attr.rarity as Api.StarGiftAttributeRarity).permille) / 10
              : undefined,
        })),
        resellPrices: (gift.resellAmount || []).map((a: any) => ({
          amount: a.amount?.toString(),
          isTon: "ton" in a,
        })),
        availability: gift.availabilityIssued
          ? {
              total: gift.availabilityTotal,
              remaining: gift.availabilityTotal - gift.availabilityIssued,
            }
          : undefined,
        nftLink: `t.me/nft/${gift.slug}`,
      },
    };
  } catch (error: unknown) {
    const errMsg = getErrorMessage(error);
    if (errMsg.includes("STARGIFT_SLUG_INVALID")) {
      return {
        success: false,
        error: `Invalid NFT slug "${params.slug}". Check the slug from t.me/nft/<slug>.`,
      };
    }
    log.error({ err: error }, "Error getting unique gift");
    return { success: false, error: errMsg };
  }
};
