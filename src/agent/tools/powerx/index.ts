/**
 * PowerX Brain Fusion — Multi-brain AI tools for Teleton Agent
 *
 * These tools let the Teleton agent call any of the PowerX brains
 * (HotBot GPT-5, Gemini, Sakana, Novita DeepSeek, DeepSeek Free,
 * StudentAI, eqing, Unitool) from Telegram conversations.
 *
 * The agent can ask a specific brain, use fusion mode for best results,
 * or list available brains.
 */

import { Type } from "@sinclair/typebox";
import type { ToolEntry } from "../types.js";
import { createLogger } from "../../../utils/logger.js";
import { fetchWithTimeout } from "../../../utils/fetch.js";

const log = createLogger("PowerX");

// ── Brain capability matrix ────────────────────────────────────────────────
const BRAIN_INFO: Record<string, { name: string; supportsVision: boolean; isFree: boolean }> = {
  hotbot:    { name: "GPT-5 (HotBot)", supportsVision: true, isFree: false },
  gemini:    { name: "Gemini 3.1 Flash", supportsVision: true, isFree: false },
  sakana:    { name: "Sakana (Namazu)", supportsVision: false, isFree: true },
  novita:    { name: "Novita DeepSeek V4", supportsVision: false, isFree: false },
  deepseek:  { name: "DeepSeek (Free)", supportsVision: false, isFree: true },
  studentai: { name: "StudentAI", supportsVision: false, isFree: true },
  eqing:     { name: "GPT-3.5 (eqing)", supportsVision: false, isFree: true },
  unitool:   { name: "Unitool Vision", supportsVision: true, isFree: true },
};

// ── Brain callers ──────────────────────────────────────────────────────────

/** HotBot (GPT-5) — requires POWERX_HOTBOT_KEY */
async function callHotBot(messages: Array<{role: string; content: string}>): Promise<string> {
  const key = process.env.POWERX_HOTBOT_KEY;
  if (!key) throw new Error("HotBot: No API key (set POWERX_HOTBOT_KEY)");

  const resp = await fetchWithTimeout("https://api.hotbot.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "gpt-5", messages, max_tokens: 4096 }),
    timeoutMs: 60000,
  });
  if (!resp.ok) throw new Error(`HotBot ${resp.status}`);
  const data = await resp.json() as any;
  return data.choices?.[0]?.message?.content?.trim() || "";
}

/** Gemini — requires POWERX_GEMINI_KEY */
async function callGemini(messages: Array<{role: string; content: string}>): Promise<string> {
  const key = process.env.POWERX_GEMINI_KEY;
  if (!key) throw new Error("Gemini: No API key (set POWERX_GEMINI_KEY)");

  const contents: Array<{role: string; parts: Array<{text: string}>}> = [];
  let system = "";
  for (const m of messages) {
    if (m.role === "system") { system = m.content; continue; }
    contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] });
  }
  const payload: any = { contents };
  if (system) payload.system_instruction = { parts: [{ text: system }] };

  const resp = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), timeoutMs: 60000 }
  );
  if (!resp.ok) throw new Error(`Gemini ${resp.status}`);
  const data = await resp.json() as any;
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

/** Sakana (Namazu) — free, uses session cookie */
async function callSakana(messages: Array<{role: string; content: string}>): Promise<string> {
  const session = process.env.POWERX_SAKANA_SESSION || "71cc2345-e7c8-4504-a351-e10c43779b4a";
  const base = process.env.POWERX_SAKANA_BASE || "https://chat.sakana.ai";
  const text = messages.map(m => m.content).join("\n");

  const createResp = await fetchWithTimeout(`${base}/conversation`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `sakana-chat=${session}`, "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify({ inputs: text, enableThinking: false, agentId: "namazu" }),
    timeoutMs: 20000,
  });
  if (!createResp.ok) throw new Error(`Sakana create ${createResp.status}`);
  const createData = await createResp.json() as any;
  if (!createData.conversationId) throw new Error("Sakana: no conversationId");

  // We need form-data for the send. Use a simple approach.
  const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`;
  const dataPart = JSON.stringify({
    inputs: text, id: createData.systemMessageId, is_retry: false,
    is_continue: false, enableThinking: false, toneMode: "default",
    webSearchEnabled: false, userMessageId: crypto.randomUUID(),
  });
  const body = `--${boundary}\r\nContent-Disposition: form-data; name="data"\r\n\r\n${dataPart}\r\n--${boundary}--\r\n`;

  const sendResp = await fetchWithTimeout(`${base}/conversation/${createData.conversationId}`, {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, Cookie: `sakana-chat=${session}`, "User-Agent": "Mozilla/5.0" },
    body, timeoutMs: 40000,
  });
  if (!sendResp.ok) throw new Error(`Sakana send ${sendResp.status}`);

  const raw = await sendResp.text();
  for (const line of raw.split("\n").filter(Boolean)) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === "finalAnswer" && parsed.text) {
        const m = parsed.text.match(/<answer>([\s\S]*?)<\/answer>/);
        if (m) return m[1].trim();
        return parsed.text.trim();
      }
    } catch { /* skip */ }
  }
  throw new Error("Sakana: no answer");
}

/** Novita DeepSeek V4 — requires POWERX_NOVITA_KEY */
async function callNovita(messages: Array<{role: string; content: string}>): Promise<string> {
  const key = process.env.POWERX_NOVITA_KEY;
  if (!key) throw new Error("Novita: No API key (set POWERX_NOVITA_KEY)");

  const resp = await fetchWithTimeout("https://api.novita.ai/v3/openai/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "deepseek/deepseek-v4-pro", messages, max_tokens: 4096 }),
    timeoutMs: 45000,
  });
  if (!resp.ok) throw new Error(`Novita ${resp.status}`);
  const data = await resp.json() as any;
  return data.choices?.[0]?.message?.content?.trim() || "";
}

/** DeepSeek Free — requires POWERX_DEEPSEEK_TOKEN */
async function callDeepseek(messages: Array<{role: string; content: string}>): Promise<string> {
  const token = process.env.POWERX_DEEPSEEK_TOKEN;
  if (!token) throw new Error("DeepSeek: No token (set POWERX_DEEPSEEK_TOKEN)");

  const resp = await fetchWithTimeout("https://chat.deepseek.com/api/v0/chat/completion", {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Authorization: `Bearer ${token}`,
      Origin: "https://chat.deepseek.com", Referer: "https://chat.deepseek.com/",
    },
    body: JSON.stringify({ messages, model: "deepseek-chat", stream: false }),
    timeoutMs: 60000,
  });
  if (resp.status === 401) throw new Error("DeepSeek token expired — update POWERX_DEEPSEEK_TOKEN");
  if (!resp.ok) throw new Error(`DeepSeek ${resp.status}`);
  const data = await resp.json() as any;
  return data.choices?.[0]?.message?.content?.trim() || data.text || "";
}

/** StudentAI — free, auto-signup */
async function callStudentAI(messages: Array<{role: string; content: string}>): Promise<string> {
  const base = process.env.POWERX_STUDENTAI_BASE || "https://xlhlttpjalhruxevxmtp.supabase.co";
  const anonKey = process.env.POWERX_STUDENTAI_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsaGx0dHBqYWxocnV4ZXZ4bXRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNzM4NzIsImV4cCI6MjA4MTY0OTg3Mn0.2E66IgwYQsW7fNBxaRdFdOskuN0vVQl8a7Ay7anXq3c";

  const email = `bot${Date.now()}${Math.floor(Math.random() * 1000)}@gmail.com`;
  const signup = await fetchWithTimeout(`${base}/auth/v1/signup`, {
    method: "POST", headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Test12345!aB" }), timeoutMs: 30000,
  });
  const signupData = await signup.json() as any;
  const token = signupData?.access_token;
  if (!token) throw new Error("StudentAI: signup failed");

  const resp = await fetchWithTimeout(`${base}/functions/v1/openai-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: anonKey },
    body: JSON.stringify({ messages }), timeoutMs: 60000,
  });
  if (!resp.ok) throw new Error(`StudentAI ${resp.status}`);
  const data = await resp.json() as any;
  return data.choices?.[0]?.message?.content?.trim() || data.text || "";
}

/** eqing.tech — GPT-3.5-Turbo, keyless, free */
async function callEqing(messages: Array<{role: string; content: string}>): Promise<string> {
  const base = process.env.POWERX_EQING_BASE || "https://origin.eqing.tech";
  const resp = await fetchWithTimeout(`${base}/api/openai/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base, Referer: `${base}/` },
    body: JSON.stringify({ model: "gpt-3.5-turbo", messages, max_tokens: 2048 }),
    timeoutMs: 45000,
  });
  if (!resp.ok) throw new Error(`eqing ${resp.status}`);
  const data = await resp.json() as any;
  return data.choices?.[0]?.message?.content?.trim() || "";
}

/** Unitool.ai — keyless, supports text + vision */
async function callUnitool(messages: Array<{role: string; content: string}>): Promise<string> {
  const endpoint = process.env.POWERX_UNITOOL_ENDPOINT || "https://unitool.ai/api/widget/stream";
  const resp = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", Origin: "https://unitool.ai" },
    body: JSON.stringify({ messages }), timeoutMs: 60000,
  });
  if (!resp.ok) throw new Error(`Unitool ${resp.status}`);

  const raw = await resp.text();
  let content = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("data: ")) {
      const d = line.slice(6);
      if (d === "[DONE]") break;
      try { const p = JSON.parse(d); if (p.content) content += p.content; } catch { /* skip */ }
    }
  }
  return content.trim() || "";
}

// ── Brain router ───────────────────────────────────────────────────────────

const BRAIN_HANDLERS: Record<string, (messages: Array<{role: string; content: string}>) => Promise<string>> = {
  hotbot: callHotBot,
  gemini: callGemini,
  sakana: callSakana,
  novita: callNovita,
  deepseek: callDeepseek,
  studentai: callStudentAI,
  eqing: callEqing,
  unitool: callUnitool,
};

const BRAIN_PRIORITY = ["hotbot", "gemini", "novita", "sakana", "deepseek", "unitool", "studentai", "eqing"];

function isBrainEnabled(brain: string): boolean {
  const flag = process.env[`POWERX_${brain.toUpperCase()}_ENABLED`];
  if (flag === "false") return false;
  // Key-required brains need the key to be enabled
  const keyNeeded = ["hotbot", "gemini", "novita", "deepseek"];
  if (keyNeeded.includes(brain)) {
    const keyMap: Record<string, string> = {
      hotbot: "POWERX_HOTBOT_KEY",
      gemini: "POWERX_GEMINI_KEY",
      novita: "POWERX_NOVITA_KEY",
      deepseek: "POWERX_DEEPSEEK_TOKEN",
    };
    return !!process.env[keyMap[brain]];
  }
  return true;
}

async function askBrains(messages: Array<{role: string; content: string}>, filter?: string[]): Promise<Array<{brain: string; reply: string}>> {
  const results: Array<{brain: string; reply: string}> = [];
  const targets = filter || BRAIN_PRIORITY.filter(b => isBrainEnabled(b));
  const hasVision = messages.some(m => typeof m.content === "object" && Array.isArray(m.content));
  const textMsgs = messages.map(m => ({ role: m.role, content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }));

  await Promise.allSettled(targets.map(async (brain) => {
    if (hasVision && !BRAIN_INFO[brain]?.supportsVision) return;
    if (!BRAIN_HANDLERS[brain]) return;
    try {
      const reply = await BRAIN_HANDLERS[brain](textMsgs);
      if (reply && reply.trim().length > 10) results.push({ brain, reply });
    } catch (e: any) {
      log.warn({ err: e.message }, `${brain} failed`);
    }
  }));

  return results;
}

// ── Tool: powerx_ask ────────────────────────────────────────────────────────

export const tools: ToolEntry[] = [
  {
    tool: {
      name: "powerx_ask",
      description: "Ask a specific PowerX AI brain a question. Brains available: hotbot (GPT-5), gemini, sakana, novita (DeepSeek V4), deepseek (free), studentai, eqing (GPT-3.5), unitool (vision). Use 'auto' for best available.",
      parameters: Type.Object({
        brain: Type.Optional(Type.String({ description: "Which brain: hotbot, gemini, sakana, novita, deepseek, studentai, eqing, unitool, or auto (default)" })),
        prompt: Type.String({ description: "The question or task to send to the AI brain" }),
        system: Type.Optional(Type.String({ description: "Optional system prompt to set behavior" })),
      }),
      category: "data-bearing",
    },
    executor: async (params: { brain?: string; prompt: string; system?: string }, _context) => {
      const brain = (params.brain || "auto").toLowerCase();
      const prompt = params.prompt?.trim();
      const system = params.system?.trim();

      if (!prompt) {
        return { success: true, data: "Error: No prompt provided." };
      }

      const messages: Array<{role: string; content: string}> = [];
      if (system) messages.push({ role: "system", content: system });
      messages.push({ role: "user", content: prompt });

      try {
        if (brain === "auto") {
          const results = await askBrains(messages);
          if (results.length === 0) return { success: true, data: "No PowerX brains available right now. Check your API keys." };

          // Return best by priority
          for (const b of BRAIN_PRIORITY) {
            const found = results.find(r => r.brain === b);
            if (found) return { success: true, data: `**[${BRAIN_INFO[found.brain]?.name || found.brain}]** replied:\n\n${found.reply}` };
          }
          return { success: true, data: `**[${results[0].brain}]** replied:\n\n${results[0].reply}` };
        }

        if (!BRAIN_HANDLERS[brain]) {
          return { success: true, data: `Unknown brain: "${brain}". Available: auto, hotbot, gemini, sakana, novita, deepseek, studentai, eqing, unitool` };
        }

        const reply = await BRAIN_HANDLERS[brain](messages);
        const name = BRAIN_INFO[brain]?.name || brain;
        return { success: true, data: `**[${name}]** replied:\n\n${reply}` };
      } catch (e: any) {
        log.error({ err: e }, "PowerX brain call failed");
        return { success: true, data: `Error calling ${brain}: ${e.message}` };
      }
    },
    scope: "open",
    mode: "both",
    tags: ["ai", "powerx"],
  },
  {
    tool: {
      name: "powerx_fusion",
      description: "Run multiple PowerX AI brains in parallel and synthesise the best answer from all of them. Higher quality than any single brain. Use for complex questions, coding, analysis.",
      parameters: Type.Object({
        prompt: Type.String({ description: "The question or task to send to all AI brains" }),
        system: Type.Optional(Type.String({ description: "Optional system prompt to guide all brains" })),
        brains: Type.Optional(Type.String({ description: "Comma-separated list of brains (default: all enabled). E.g. 'hotbot,gemini,novita'" })),
      }),
      category: "data-bearing",
    },
    executor: async (params: { prompt: string; system?: string; brains?: string }, _context) => {
      const prompt = params.prompt?.trim();
      const system = params.system?.trim();
      const brainFilter = params.brains?.split(",").map(b => b.trim().toLowerCase()).filter(Boolean);

      if (!prompt) {
        return { success: true, data: "Error: No prompt provided." };
      }

      const messages: Array<{role: string; content: string}> = [];
      if (system) messages.push({ role: "system", content: system });
      messages.push({ role: "user", content: prompt });

      try {
        const results = await askBrains(messages, brainFilter);
        if (results.length === 0) {
          return { success: true, data: "No PowerX brains could answer right now. Check your API keys." };
        }

        const brainNames = results.map(r => BRAIN_INFO[r.brain]?.name || r.brain).join(", ");

        // If only one brain replied, return it directly
        if (results.length === 1) {
          return { success: true, data: `**🧠 ${BRAIN_INFO[results[0].brain]?.name || results[0].brain}** replied:\n\n${results[0].reply}` };
        }

        // Multiple brains — synthesise with HotBot or Gemini
        const candidates = results.map((r, i) =>
          `--- CANDIDATE ${i + 1} (${r.brain}) ---\n${r.reply.slice(0, 3000)}`
        ).join("\n\n");

        const synthMessages = [
          { role: "system" as const, content: "You are a synthesis expert. Read all candidate answers, keep the BEST parts of each, discard mistakes, and write ONE superior answer. Be thorough and accurate. Output ONLY the final answer." },
          { role: "user" as const, content: `CANDIDATES:\n\n${candidates}\n\nWrite the single best combined answer:` },
        ];

        let synthReply = "";
        if (process.env.POWERX_HOTBOT_KEY) {
          try { synthReply = await callHotBot(synthMessages); } catch { /* fall back */ }
        }
        if (!synthReply && process.env.POWERX_GEMINI_KEY) {
          try { synthReply = await callGemini(synthMessages); } catch { /* fall back */ }
        }
        if (!synthReply) {
          // Return the best individual answer
          const best = results[0];
          return { success: true, data: `**🧠 Best from ${brainNames}**\n\n${best.reply}` };
        }

        return { success: true, data: `**🧠 Fusion Answer** (synthesised from: ${brainNames})\n\n${synthReply}` };
      } catch (e: any) {
        log.error({ err: e }, "PowerX fusion failed");
        return { success: true, data: `Error in PowerX fusion: ${e.message}` };
      }
    },
    scope: "open",
    mode: "both",
    tags: ["ai", "powerx"],
  },
  {
    tool: {
      name: "powerx_list_brains",
      description: "List all available PowerX AI brains and their capabilities (which ones support text, images, etc.)",
      parameters: Type.Object({}),
      category: "data-bearing",
    },
    executor: async () => {
      const lines = Object.entries(BRAIN_INFO).map(([key, info]) => {
        const features: string[] = ["text"];
        if (info.supportsVision) features.push("vision/images");
        const price = info.isFree ? "free" : "paid";
        const enabled = isBrainEnabled(key) ? "✅ enabled" : "❌ disabled";
        return `• **${info.name}** (\`${key}\`): ${features.join(", ")} — ${price}, ${enabled}`;
      });
      return { success: true, data: `Available PowerX AI Brains:\n\n${lines.join("\n")}\n\nUse \`powerx_ask\` to ask a specific brain, or \`powerx_fusion\` for the best answer from all brains.` };
    },
    scope: "open",
    mode: "both",
    tags: ["ai", "powerx"],
  },
];