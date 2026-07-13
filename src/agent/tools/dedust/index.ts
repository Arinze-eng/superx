import { dedustQuoteTool, dedustQuoteExecutor } from "./quote.js";
import { dedustSwapTool, dedustSwapExecutor } from "./swap.js";
import { dedustPoolsTool, dedustPoolsExecutor } from "./pools.js";
import { dedustPricesTool, dedustPricesExecutor } from "./prices.js";
import { dedustTokenInfoTool, dedustTokenInfoExecutor } from "./token-info.js";
import type { ToolEntry } from "../types.js";

export { dedustQuoteTool, dedustQuoteExecutor };
export { dedustSwapTool, dedustSwapExecutor };
export { dedustPoolsTool, dedustPoolsExecutor };
export { dedustPricesTool, dedustPricesExecutor };
export { dedustTokenInfoTool, dedustTokenInfoExecutor };

export const tools: ToolEntry[] = [
  {
    tool: dedustSwapTool,
    executor: dedustSwapExecutor,
    scope: "dm-only",
    mode: "both",
    tags: ["finance"],
  },
  { tool: dedustQuoteTool, executor: dedustQuoteExecutor, mode: "both", tags: ["finance"] },
  { tool: dedustPoolsTool, executor: dedustPoolsExecutor, mode: "both", tags: ["finance"] },
  { tool: dedustPricesTool, executor: dedustPricesExecutor, mode: "both", tags: ["finance"] },
  { tool: dedustTokenInfoTool, executor: dedustTokenInfoExecutor, mode: "both", tags: ["finance"] },
];
