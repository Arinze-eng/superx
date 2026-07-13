import { tavily } from "@tavily/core";
import type { ToolContext, ToolResult } from "../types.js";

type TavilyClient = ReturnType<typeof tavily>;

/**
 * Resolve a Tavily client from the configured API key, or a failed ToolResult
 * carrying the standard "key not configured" message. Shared by web_fetch and
 * web_search so the check + client init lives in one place.
 */
export function resolveTavily(
  context: ToolContext
): { ok: true; client: TavilyClient } | { ok: false; error: ToolResult } {
  const apiKey = context.config?.tavily_api_key;
  if (!apiKey) {
    return {
      ok: false,
      error: {
        success: false,
        error:
          "Tavily API key not configured. Set tavily_api_key in config.yaml (free at https://tavily.com)",
      },
    };
  }
  return { ok: true, client: tavily({ apiKey }) };
}
