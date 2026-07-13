import { Type } from "@sinclair/typebox";
import type { Tool, ToolExecutor, ToolResult } from "../../types.js";
import { appendFileSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { WORKSPACE_PATHS } from "../../../../workspace/index.js";
import { getErrorMessage } from "../../../../utils/errors.js";
import { createLogger } from "../../../../utils/logger.js";
import { scanMemoryContent } from "../../../../utils/memory-guard.js";
import { getKnowledgeIndexer } from "../../../../memory/agent/knowledge.js";
import {
  updateBlock,
  appendToBlock,
  deleteFromBlock,
  BLOCK_NAMES,
} from "../../../../memory/core-blocks.js";

const log = createLogger("Tools");

const MEMORY_DIR = WORKSPACE_PATHS.MEMORY_DIR;
const MEMORY_FILE = WORKSPACE_PATHS.MEMORY;

/** Soft warning threshold for MEMORY.md line count */
const MEMORY_SOFT_LIMIT = 80;

/**
 * Count lines in MEMORY.md (returns 0 if file doesn't exist)
 */
function getMemoryLineCount(): number {
  if (!existsSync(MEMORY_FILE)) return 0;
  return readFileSync(MEMORY_FILE, "utf-8").split("\n").length;
}

/**
 * Parameters for memory_write tool
 */
interface MemoryWriteParams {
  content: string;
  target: "persistent" | "daily" | "core";
  section?: string;
  block_name?: string;
  mode?: "update" | "append" | "delete";
}

/**
 * Tool definition for writing to agent memory
 */
export const memoryWriteTool: Tool = {
  name: "memory_write",
  description:
    "Persist facts to agent memory. Use target='core' + block_name for structured long-term storage (identity, contacts, goals, lessons, preferences). Use 'daily' for session notes. Use 'persistent' for free-form markdown additions. Group chats blocked for security. Not visible in current session context — takes effect next session.",
  parameters: Type.Object({
    content: Type.String({
      description:
        "The content to write. For core+delete mode, this is the substring to match and remove.",
    }),
    target: Type.String({
      description: "'core' (structured blocks), 'persistent' (MEMORY.md), 'daily' (today's log)",
      enum: ["persistent", "daily", "core"],
    }),
    block_name: Type.Optional(
      Type.String({
        description: `Block name for target='core'. One of: ${BLOCK_NAMES.join(", ")}`,
      })
    ),
    mode: Type.Optional(
      Type.String({
        description:
          "For target='core': 'update' (replace block), 'append' (add to block), 'delete' (remove line matching content). Default: 'update'",
        enum: ["update", "append", "delete"],
      })
    ),
    section: Type.Optional(
      Type.String({
        description:
          "Optional section header for persistent/daily targets (e.g., 'Lessons Learned', 'Contacts')",
      })
    ),
  }),
};

/**
 * Ensure memory directory exists
 */
function ensureMemoryDir(): void {
  if (!existsSync(MEMORY_DIR)) {
    mkdirSync(MEMORY_DIR, { recursive: true });
  }
}

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
 * Get today's daily log path
 */
function getDailyLogPath(): string {
  return join(MEMORY_DIR, `${formatDate(new Date())}.md`);
}

/**
 * Executor for memory_write tool
 */
export const memoryWriteExecutor: ToolExecutor<MemoryWriteParams> = async (
  params,
  context
): Promise<ToolResult> => {
  try {
    const { content, target, section, block_name, mode } = params;

    // SECURITY: Block memory writes in group chats to prevent memory poisoning
    if (context.isGroup) {
      return {
        success: false,
        error: "Memory writes are disabled in group chats for security reasons.",
      };
    }

    // SECURITY: Content length limit to prevent memory flooding
    if (content.length > 2000) {
      return {
        success: false,
        error: "Memory entry too long. Maximum 2000 characters.",
      };
    }

    // SECURITY: Scan for prompt injection, exfiltration, and other threats
    const scan = scanMemoryContent(content);
    if (!scan.safe) {
      log.warn(`Memory write blocked — threats detected: ${scan.threats.join(", ")}`);
      return {
        success: false,
        error: `Memory write blocked: suspicious content detected (${scan.threats.join(", ")}).`,
      };
    }

    ensureMemoryDir();

    const now = new Date();
    const timestamp = now.toLocaleTimeString("en-US", { hour12: false });

    if (target === "core") {
      if (!block_name) {
        return {
          success: false,
          error: `block_name is required for target='core'. Valid blocks: ${BLOCK_NAMES.join(", ")}`,
        };
      }
      try {
        const op = mode || "update";
        if (op === "delete") {
          deleteFromBlock(block_name, content);
        } else if (op === "append") {
          appendToBlock(block_name, content);
        } else {
          updateBlock(block_name, content);
        }

        log.info(`Core memory block '${block_name}' ${op}d`);
        return {
          success: true,
          data: {
            target: "core",
            block: block_name,
            mode: op,
            timestamp: now.toISOString(),
          },
        };
      } catch (err) {
        return { success: false, error: getErrorMessage(err) };
      }
    }

    if (target === "persistent") {
      // Write to MEMORY.md
      let entry = "\n";
      if (section) {
        entry += `### ${section}\n\n`;
      }
      entry += `${content}\n`;
      entry += `\n_Added: ${now.toISOString()}_\n`;

      // Append to MEMORY.md
      if (!existsSync(MEMORY_FILE)) {
        writeFileSync(MEMORY_FILE, "# MEMORY.md - Persistent Memory\n\n", {
          encoding: "utf-8",
          mode: 0o600,
        });
      }
      appendFileSync(MEMORY_FILE, entry, "utf-8");
      getKnowledgeIndexer()
        ?.indexFile(MEMORY_FILE)
        .catch(() => {});

      log.info(`Memory written to MEMORY.md${section ? ` (section: ${section})` : ""}`);

      // Check memory size and warn if approaching limit
      const lineCount = getMemoryLineCount();
      const sizeWarning =
        lineCount > MEMORY_SOFT_LIMIT
          ? ` ⚠️ MEMORY.md is now ${lineCount} lines (recommended max: ~100). Consider consolidating old entries, removing outdated info, or archiving less relevant content to keep your memory efficient and fast to load.`
          : undefined;

      return {
        success: true,
        data: {
          target: "persistent",
          file: MEMORY_FILE,
          section: section || null,
          timestamp: now.toISOString(),
          lineCount,
          ...(sizeWarning && { warning: sizeWarning }),
        },
      };
    } else {
      // Write to daily log
      const logPath = getDailyLogPath();

      // Create header if file doesn't exist
      if (!existsSync(logPath)) {
        const header = `# Daily Log - ${formatDate(now)}\n\n`;
        writeFileSync(logPath, header, { encoding: "utf-8", mode: 0o600 });
      }

      let entry = `## ${timestamp}`;
      if (section) {
        entry += ` - ${section}`;
      }
      entry += `\n\n${content}\n\n---\n\n`;

      appendFileSync(logPath, entry, "utf-8");
      getKnowledgeIndexer()
        ?.indexFile(logPath)
        .catch(() => {});

      log.info(`Memory written to daily log${section ? ` (${section})` : ""}`);

      return {
        success: true,
        data: {
          target: "daily",
          file: logPath,
          section: section || null,
          timestamp: now.toISOString(),
        },
      };
    }
  } catch (error) {
    log.error({ err: error }, "Error writing to memory");
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
};
