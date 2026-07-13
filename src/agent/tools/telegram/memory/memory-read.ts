import { Type } from "@sinclair/typebox";
import type { Tool, ToolExecutor, ToolResult } from "../../types.js";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { WORKSPACE_PATHS } from "../../../../workspace/index.js";
import { getErrorMessage } from "../../../../utils/errors.js";
import { createLogger } from "../../../../utils/logger.js";
import { loadCoreMemory, BLOCK_NAMES, type BlockName } from "../../../../memory/core-blocks.js";

const log = createLogger("Tools");

const MEMORY_DIR = WORKSPACE_PATHS.MEMORY_DIR;
const MEMORY_FILE = WORKSPACE_PATHS.MEMORY;

/**
 * Parameters for memory_read tool
 */
interface MemoryReadParams {
  target: "persistent" | "daily" | "recent" | "list" | "core";
  date?: string; // YYYY-MM-DD for specific daily log
  block_name?: string; // For target="core", read a specific block
}

/**
 * Tool definition for reading agent memory
 */
export const memoryReadTool: Tool = {
  name: "memory_read",
  description:
    "Read the agent's long-term or daily memory files. Use target='core' for structured facts (identity, contacts, goals, lessons). Use 'recent' to check today's session notes. NOT for searching past Telegram chats — use session_search. NOT for business trade history — use journal_query.",
  category: "data-bearing",
  parameters: Type.Object({
    target: Type.String({
      description:
        "'core' (structured blocks), 'persistent' (MEMORY.md), 'daily' (today's log), 'recent' (today+yesterday), 'list' (show all files)",
      enum: ["persistent", "daily", "recent", "list", "core"],
    }),
    date: Type.Optional(
      Type.String({
        description:
          "Specific date for daily log (YYYY-MM-DD format). Only used with target='daily'",
      })
    ),
    block_name: Type.Optional(
      Type.String({
        description: `Read a specific core block. One of: ${BLOCK_NAMES.join(", ")}. Only used with target='core'`,
      })
    ),
  }),
};

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Executor for memory_read tool
 */
export const memoryReadExecutor: ToolExecutor<MemoryReadParams> = async (
  params,
  _context
): Promise<ToolResult> => {
  try {
    const { target, date, block_name } = params;

    if (target === "core") {
      try {
        const blocks = loadCoreMemory();
        if (block_name) {
          if (!BLOCK_NAMES.includes(block_name as BlockName)) {
            return {
              success: false,
              error: `Unknown block: ${block_name}. Valid: ${BLOCK_NAMES.join(", ")}`,
            };
          }
          return {
            success: true,
            data: {
              target: "core",
              block: block_name,
              content: blocks[block_name as keyof typeof blocks] || "",
              size: (blocks[block_name as keyof typeof blocks] || "").length,
            },
          };
        }
        return {
          success: true,
          data: {
            target: "core",
            blocks,
          },
        };
      } catch (err) {
        return { success: false, error: getErrorMessage(err) };
      }
    }

    if (target === "list") {
      // List all memory files
      const files: string[] = [];

      if (existsSync(MEMORY_FILE)) {
        files.push("MEMORY.md (persistent)");
      }

      if (existsSync(MEMORY_DIR)) {
        const dailyLogs = readdirSync(MEMORY_DIR)
          .filter((f) => f.endsWith(".md"))
          .sort()
          .reverse();
        files.push(...dailyLogs.map((f) => `memory/${f}`));
      }

      return {
        success: true,
        data: {
          files,
          count: files.length,
        },
      };
    }

    if (target === "persistent") {
      // Read MEMORY.md
      if (!existsSync(MEMORY_FILE)) {
        return {
          success: true,
          data: {
            content: null,
            message: "No persistent memory file exists yet. Use memory_write to create one.",
          },
        };
      }

      const content = readFileSync(MEMORY_FILE, "utf-8");
      return {
        success: true,
        data: {
          target: "persistent",
          file: "MEMORY.md",
          content,
          size: content.length,
        },
      };
    }

    if (target === "daily") {
      // Read specific daily log
      if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return { success: false, error: "Invalid date format. Use YYYY-MM-DD." };
      }
      const targetDate = date || formatDate(new Date());
      const logPath = join(MEMORY_DIR, `${targetDate}.md`);

      if (!existsSync(logPath)) {
        return {
          success: true,
          data: {
            content: null,
            date: targetDate,
            message: `No daily log exists for ${targetDate}.`,
          },
        };
      }

      const content = readFileSync(logPath, "utf-8");
      return {
        success: true,
        data: {
          target: "daily",
          date: targetDate,
          file: `memory/${targetDate}.md`,
          content,
          size: content.length,
        },
      };
    }

    if (target === "recent") {
      // Read today + yesterday
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const todayStr = formatDate(today);
      const yesterdayStr = formatDate(yesterday);

      const result: Record<string, string | null> = {};

      // Yesterday
      const yesterdayPath = join(MEMORY_DIR, `${yesterdayStr}.md`);
      if (existsSync(yesterdayPath)) {
        result[yesterdayStr] = readFileSync(yesterdayPath, "utf-8");
      } else {
        result[yesterdayStr] = null;
      }

      // Today
      const todayPath = join(MEMORY_DIR, `${todayStr}.md`);
      if (existsSync(todayPath)) {
        result[todayStr] = readFileSync(todayPath, "utf-8");
      } else {
        result[todayStr] = null;
      }

      return {
        success: true,
        data: {
          target: "recent",
          logs: result,
        },
      };
    }

    return {
      success: false,
      error: `Unknown target: ${target}`,
    };
  } catch (error) {
    log.error({ err: error }, "Error reading memory");
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
};
