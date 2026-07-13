/**
 * PowerX Brain Tool — Teleton tool definition for calling the PowerX brains
 *
 * This tool is registered with the Teleton agent so it can call any of the
 * PowerX brains (HotBot, Gemini, Sakana, Novita, DeepSeek, StudentAI, eqing,
 * Unitool) directly from Telegram conversations.
 *
 * The agent can ask a specific brain or use fusion mode to get the best answer
 * from multiple brains simultaneously.
 */

import { ToolBase, type ToolContext } from "../../agent/tools/types.js";
import { z } from "zod";
import { getBestAnswer, fusedAnswer, askBrains, BRAIN_CAPABILITIES } from "./index.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("PowerXTool");

// Parse PowerX config from environment variables
function getPowerXConfig() {
  return {
    hotbot: process.env.POWERX_HOTBOT_KEY ? {
      apiKey: process.env.POWERX_HOTBOT_KEY,
      enabled: process.env.POWERX_HOTBOT_ENABLED !== "false",
    } : undefined,
    gemini: process.env.POWERX_GEMINI_KEY ? {
      apiKey: process.env.POWERX_GEMINI_KEY,
      enabled: process.env.POWERX_GEMINI_ENABLED !== "false",
    } : undefined,
    sakana: {
      session: process.env.POWERX_SAKANA_SESSION,
      enabled: process.env.POWERX_SAKANA_ENABLED !== "false",
    },
    novita: process.env.POWERX_NOVITA_KEY ? {
      apiKey: process.env.POWERX_NOVITA_KEY,
      enabled: process.env.POWERX_NOVITA_ENABLED !== "false",
    } : undefined,
    deepseek: process.env.POWERX_DEEPSEEK_TOKEN ? {
      token: process.env.POWERX_DEEPSEEK_TOKEN,
      enabled: process.env.POWERX_DEEPSEEK_ENABLED !== "false",
    } : undefined,
    studentai: {
      enabled: process.env.POWERX_STUDENTAI_ENABLED !== "false",
    },
    eqing: {
      enabled: process.env.POWERX_EQING_ENABLED !== "false",
    },
    unitool: {
      enabled: process.env.POWERX_UNITOOL_ENABLED !== "false",
    },
  };
}

/**
 * List available PowerX brains and their capabilities
 */
export const powerxListBrainsTool: ToolBase = {
  name: "powerx_list_brains",
  description: "List all available PowerX AI brains and their capabilities (which ones support text, images, code, etc.)",
  parameters: z.object({}),
  execute: async (_args: Record<string, unknown>, _context: ToolContext) => {
    const info = Object.entries(BRAIN_CAPABILITIES).map(([key, cap]) => {
      const features: string[] = [];
      if (cap.supportsText) features.push("text");
      if (cap.supportsVision) features.push("vision/images");
      if (cap.supportsFiles) features.push("files");
      if (cap.supportsCode) features.push("code");
      const price = cap.isFree ? "free" : "paid";
      const keyStatus = cap.requiresKey ? "needs API key" : "no key needed";
      return `• **${cap.name}** (${key}): ${features.join(", ")} — ${price}, ${keyStatus}`;
    }).join("\n");

    return `Available PowerX AI Brains:\n\n${info}\n\nUse \`powerx_ask\` to ask a specific brain, or \`powerx_fusion\` to use all brains together.`;
  },
};

/**
 * Ask a specific PowerX brain a question
 */
export const powerxAskTool: ToolBase = {
  name: "powerx_ask",
  description: "Ask a specific PowerX AI brain a question. Supports HotBot (GPT-5), Gemini, Sakana, Novita DeepSeek, DeepSeek Free, StudentAI, eqing, and Unitool. Use 'auto' for best available.",
  parameters: z.object({
    brain: z.string().describe("Which brain to use: 'hotbot', 'gemini', 'sakana', 'novita', 'deepseek', 'studentai', 'eqing', 'unitool', or 'auto' (best available)"),
    prompt: z.string().describe("The question or task to send to the AI brain"),
    system: z.string().optional().describe("Optional system prompt to set the brain's behavior"),
  }),
  execute: async (args: Record<string, unknown>, _context: ToolContext) => {
    const brain = String(args.brain || "auto").toLowerCase();
    const prompt = String(args.prompt || "").trim();
    const system = args.system ? String(args.system).trim() : undefined;

    if (!prompt) {
      return "Error: No prompt provided. Please provide a question or task.";
    }

    const messages: Array<{role: string; content: string}> = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    const config = getPowerXConfig();

    try {
      if (brain === "auto") {
        const result = await getBestAnswer(messages, config);
        return `**[${result.brain}]** replied:\n\n${result.reply}`;
      }

      // Call specific brain directly
      const { default: powerx } = await import("./index.js");
      const results = await askBrains(messages, {
        ...config,
        hotbot: brain === "hotbot" ? config.hotbot : { enabled: false },
        gemini: brain === "gemini" ? config.gemini : { enabled: false },
        sakana: brain === "sakana" ? config.sakana : { enabled: false },
        novita: brain === "novita" ? config.novita : { enabled: false },
        deepseek: brain === "deepseek" ? config.deepseek : { enabled: false },
        studentai: brain === "studentai" ? config.studentai : { enabled: false },
        eqing: brain === "eqing" ? config.eqing : { enabled: false },
        unitool: brain === "unitool" ? config.unitool : { enabled: false },
      });

      const result = results.find(r => r.reply);
      if (result) {
        return `**[${result.brain}]** replied:\n\n${result.reply}`;
      }

      const errors = results.filter(r => r.error).map(r => `${r.brain}: ${r.error}`).join("\n");
      return `All brains failed:\n\n${errors}`;
    } catch (e: any) {
      log.error({ err: e }, "PowerX brain call failed");
      return `Error calling PowerX brain: ${e.message}`;
    }
  },
};

/**
 * Fusion mode — ask multiple brains in parallel, synthesise the best answer
 */
export const powerxFusionTool: ToolBase = {
  name: "powerx_fusion",
  description: "Run multiple PowerX AI brains in parallel and synthesise the best answer from all of them. This gives higher quality than any single brain.",
  parameters: z.object({
    prompt: z.string().describe("The question or task to send to all AI brains"),
    system: z.string().optional().describe("Optional system prompt to guide all brains"),
    brains: z.string().optional().describe("Comma-separated list of brains to use (default: all enabled). E.g. 'hotbot,gemini,novita'"),
  }),
  execute: async (args: Record<string, unknown>, _context: ToolContext) => {
    const prompt = String(args.prompt || "").trim();
    const system = args.system ? String(args.system).trim() : undefined;
    const brainList = args.brains ? String(args.brains).split(",").map(b => b.trim().toLowerCase()) : undefined;

    if (!prompt) {
      return "Error: No prompt provided. Please provide a question or task.";
    }

    const messages: Array<{role: string; content: string}> = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    let config = getPowerXConfig();

    // If specific brains requested, filter
    if (brainList && brainList.length > 0) {
      const allBrains = ["hotbot", "gemini", "sakana", "novita", "deepseek", "studentai", "eqing", "unitool"];
      const disabled = allBrains.filter(b => !brainList.includes(b));
      for (const b of disabled) {
        config = {
          ...config,
          [b]: { enabled: false },
        };
      }
    }

    try {
      const result = await fusedAnswer(messages, config);
      const brainStr = result.brains.join(", ");
      return `**🧠 Fusion Answer** (synthesised from: ${brainStr})\n\n${result.reply}`;
    } catch (e: any) {
      log.error({ err: e }, "PowerX fusion failed");
      return `Error in PowerX fusion: ${e.message}`;
    }
  },
};