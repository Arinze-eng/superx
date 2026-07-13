import { Type } from "@sinclair/typebox";
import type { Tool, ToolExecutor, ToolResult } from "../types.js";
import { fetchWithTimeout } from "../../../utils/fetch.js";
import { STONFI_API_BASE_URL } from "../../../constants/api-endpoints.js";
import { getErrorMessage } from "../../../utils/errors.js";
import { createLogger } from "../../../utils/logger.js";

const log = createLogger("Tools");

interface StonfiPool {
  address: string;
  token0_address: string;
  token1_address: string;
  volume_24h_usd?: string;
  lp_total_supply_usd?: string;
  apy_7d?: string;
  lp_fee?: number;
  deprecated?: boolean;
}

interface FormattedPool {
  rank: number;
  pair: string;
  poolAddress: string;
  token0: { address: string; symbol: string };
  token1: { address: string; symbol: string };
  volume24h: string;
  tvl: string;
  apy7d: string;
  lpFee: number;
}

interface JettonPoolsParams {
  jetton_address?: string;
  limit?: number;
}
export const stonfiPoolsTool: Tool = {
  name: "stonfi_pools",
  description:
    "List STON.fi DEX liquidity pools sorted by 24h volume. Filter by jetton address or get top pools. Returns TVL, APY, and fees. NOT DeDust pools — for those use dedust_pools.",
  category: "data-bearing",
  parameters: Type.Object({
    jetton_address: Type.Optional(
      Type.String({
        description:
          "Jetton address to filter pools (optional - if not provided, returns top pools)",
      })
    ),
    limit: Type.Optional(
      Type.Number({
        description: "Number of pools to return (default: 10, max: 50)",
        minimum: 1,
        maximum: 50,
      })
    ),
  }),
};
export const stonfiPoolsExecutor: ToolExecutor<JettonPoolsParams> = async (
  params,
  _context
): Promise<ToolResult> => {
  try {
    const { jetton_address, limit = 10 } = params;

    // Fetch pools from STON.fi
    const response = await fetchWithTimeout(`${STONFI_API_BASE_URL}/pools`, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `STON.fi API error: ${response.status}`,
      };
    }

    const data = await response.json();
    let pools = data.pool_list || [];

    // Filter by jetton if provided
    if (jetton_address) {
      const targetAddress = jetton_address.toLowerCase();
      pools = pools.filter((p: StonfiPool) => {
        const token0 = (p.token0_address || "").toLowerCase();
        const token1 = (p.token1_address || "").toLowerCase();
        return (
          token0.includes(targetAddress) ||
          token1.includes(targetAddress) ||
          targetAddress.includes(token0) ||
          targetAddress.includes(token1)
        );
      });
    }

    // Sort by volume and limit
    pools = pools
      .filter((p: StonfiPool) => !p.deprecated)
      .sort(
        (a: StonfiPool, b: StonfiPool) =>
          parseFloat(b.volume_24h_usd || "0") - parseFloat(a.volume_24h_usd || "0")
      )
      .slice(0, limit);

    // Fetch asset names for better display
    const assetMap: { [key: string]: string } = {};
    try {
      const assetsResponse = await fetchWithTimeout(`${STONFI_API_BASE_URL}/assets`);
      if (assetsResponse.ok) {
        const assetsData = await assetsResponse.json();
        for (const asset of assetsData.asset_list || []) {
          assetMap[asset.contract_address] = asset.symbol || "???";
        }
      }
    } catch {
      // Ignore
    }

    // Format pools
    const formattedPools: FormattedPool[] = pools.map((p: StonfiPool, index: number) => {
      const token0Symbol = assetMap[p.token0_address] || "???";
      const token1Symbol = assetMap[p.token1_address] || "???";
      const pair = `${token0Symbol}/${token1Symbol}`;
      const volume24h = parseFloat(p.volume_24h_usd || "0");
      const tvl = parseFloat(p.lp_total_supply_usd || "0");
      const apy = parseFloat(p.apy_7d || "0") * 100;

      return {
        rank: index + 1,
        pair,
        poolAddress: p.address,
        token0: { address: p.token0_address, symbol: token0Symbol },
        token1: { address: p.token1_address, symbol: token1Symbol },
        volume24h: volume24h.toFixed(2),
        tvl: tvl.toFixed(2),
        apy7d: apy.toFixed(2),
        lpFee: p.lp_fee || 0,
      };
    });

    let message = jetton_address
      ? `Pools for ${jetton_address}:\n\n`
      : `🏊 Top ${formattedPools.length} Pools by Volume:\n\n`;

    formattedPools.forEach((p) => {
      message += `#${p.rank} ${p.pair}\n`;
      message += `   Volume 24h: $${Number(p.volume24h).toLocaleString()}\n`;
      message += `   TVL: $${Number(p.tvl).toLocaleString()}\n`;
      message += `   APY 7d: ${p.apy7d}%\n`;
      message += `   Fee: ${p.lpFee / 100}%\n`;
    });

    if (formattedPools.length === 0) {
      message = jetton_address ? `No pools found for ${jetton_address}` : "No pools found";
    }

    return {
      success: true,
      data: {
        count: formattedPools.length,
        pools: formattedPools,
        message,
      },
    };
  } catch (error) {
    log.error({ err: error }, "Error in stonfi_pools");
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
};
