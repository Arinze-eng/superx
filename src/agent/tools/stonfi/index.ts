import { stonfiSwapTool, stonfiSwapExecutor } from "./swap.js";
import { stonfiQuoteTool, stonfiQuoteExecutor } from "./quote.js";
import { stonfiSearchTool, stonfiSearchExecutor } from "./search.js";
import { stonfiTrendingTool, stonfiTrendingExecutor } from "./trending.js";
import { stonfiPoolsTool, stonfiPoolsExecutor } from "./pools.js";
import type { ToolEntry } from "../types.js";

export { stonfiSwapTool, stonfiSwapExecutor };
export { stonfiQuoteTool, stonfiQuoteExecutor };
export { stonfiSearchTool, stonfiSearchExecutor };
export { stonfiTrendingTool, stonfiTrendingExecutor };
export { stonfiPoolsTool, stonfiPoolsExecutor };

export const tools: ToolEntry[] = [
  {
    tool: stonfiSwapTool,
    executor: stonfiSwapExecutor,
    scope: "dm-only",
    mode: "both",
    tags: ["finance"],
  },
  { tool: stonfiQuoteTool, executor: stonfiQuoteExecutor, mode: "both", tags: ["finance"] },
  { tool: stonfiSearchTool, executor: stonfiSearchExecutor, mode: "both", tags: ["finance"] },
  { tool: stonfiTrendingTool, executor: stonfiTrendingExecutor, mode: "both", tags: ["finance"] },
  { tool: stonfiPoolsTool, executor: stonfiPoolsExecutor, mode: "both", tags: ["finance"] },
];
