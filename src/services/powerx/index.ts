/**
 * PowerX Brain Fusion — Multi-brain AI service for Teleton Agent
 *
 * Wraps the PowerX AI brains (HotBot/GPT-5, Gemini, Sakana, Novita, DeepSeek,
 * StudentAI, eqing, Unitool) into a unified service that the Teleton agent
 * can call as tools.
 *
 * Each brain is independent with its own auth/endpoint. The fusion layer
 * runs multiple brains in parallel and synthesises the best answer.
 */

import { createLogger } from "../../utils/logger.js";
import { fetchWithTimeout } from "../../utils/fetch.js";

const log = createLogger("PowerX");

// ── Configuration ──────────────────────────────────────────────────────────
export interface PowerXConfig {
  hotbot?: { apiKey?: string; enabled?: boolean };
  gemini?: { apiKey?: string; enabled?: boolean };
  sakana?: { session?: string; enabled?: boolean };
  novita?: { apiKey?: string; enabled?: boolean };
  deepseek?: { token?: string; enabled?: boolean };
  studentai?: { enabled?: boolean };
  eqing?: { enabled?: boolean };
  unitool?: { enabled?: boolean };
}

// ── Brain capability matrix ────────────────────────────────────────────────
export interface BrainCapability {
  name: string;
  supportsText: boolean;
  supportsVision: boolean;
  supportsFiles: boolean;
  supportsCode: boolean;
  isFree: boolean;
  requiresKey: boolean;
}

export const BRAIN_CAPABILITIES: Record<string, BrainCapability> = {
  hotbot:    { name: "GPT-5 (HotBot)", supportsText: true, supportsVision: true, supportsFiles: false, supportsCode: true, isFree: false, requiresKey: true },
  gemini:    { name: "Gemini 3.1 Flash", supportsText: true, supportsVision: true, supportsFiles: false, supportsCode: true, isFree: false, requiresKey: true },
  sakana:    { name: "Sakana (Namazu)", supportsText: true, supportsVision: false, supportsFiles: true, supportsCode: true, isFree: true, requiresKey: false },
  novita:    { name: "Novita DeepSeek V4", supportsText: true, supportsVision: false, supportsFiles: false, supportsCode: true, isFree: false, requiresKey: true },
  deepseek:  { name: "DeepSeek (Free)", supportsText: true, supportsVision: false, supportsFiles: false, supportsCode: true, isFree: true, requiresKey: true },
  studentai: { name: "StudentAI", supportsText: true, supportsVision: false, supportsFiles: false, supportsCode: true, isFree: true, requiresKey: false },
  eqing:     { name: "GPT-3.5 (eqing)", supportsText: true, supportsVision: false, supportsFiles: false, supportsCode: true, isFree: true, requiresKey: false },
  unitool:   { name: "Unitool Vision", supportsText: true, supportsVision: true, supportsFiles: false, supportsCode: true, isFree: true, requiresKey: false },
};

// ── Brain implementations ──────────────────────────────────────────────────

// HotBot (GPT-5) — requires API key from hotbot.com or similar
async function callHotBot(messages: Array<{role: string; content: string}>, apiKey?: string): Promise<string> {
  const key = apiKey || process.env.POWERX_HOTBOT_KEY;
  if (!key) throw new Error("HotBot: No API key configured (set POWERX_HOTBOT_KEY)");

  const resp = await fetchWithTimeout("https://api.hotbot.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "gpt-5",
      messages: messages,
      max_tokens: 4096,
    }),
    timeoutMs: 60000,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`HotBot API error (${resp.status}): ${text.slice(0, 200)}`);
  }
  const data = await resp.json() as any;
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// Gemini — uses Google AI Studio API key
async function callGemini(messages: Array<{role: string; content: string}>, apiKey?: string): Promise<string> {
  const key = apiKey || process.env.POWERX_GEMINI_KEY;
  if (!key) throw new Error("Gemini: No API key configured (set POWERX_GEMINI_KEY)");

  // Convert messages to Gemini format
  const contents: Array<{role: string; parts: Array<{text: string}>}> = [];
  let systemInstruction = "";

  for (const m of messages) {
    if (m.role === "system") {
      systemInstruction = m.content;
      continue;
    }
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }

  const payload: any = { contents };
  if (systemInstruction) {
    payload.system_instruction = { parts: [{ text: systemInstruction }] };
  }

  const resp = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      timeoutMs: 60000,
    }
  );

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Gemini API error (${resp.status}): ${text.slice(0, 200)}`);
  }
  const data = await resp.json() as any;
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

// Sakana (Namazu) — uses session cookie, free tier
async function callSakana(messages: Array<{role: string; content: string}>, session?: string): Promise<string> {
  const sessionId = session || process.env.POWERX_SAKANA_SESSION || "71cc2345-e7c8-4504-a351-e10c43779b4a";
  const base = process.env.POWERX_SAKANA_BASE || "https://chat.sakana.ai";

  // Step 1: Create conversation
  const createResp = await fetchWithTimeout(`${base}/conversation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": `sakana-chat=${sessionId}`,
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36",
    },
    body: JSON.stringify({
      inputs: messages.map(m => m.content).join("\n"),
      enableThinking: false,
      toneMode: "default",
      webSearchEnabled: false,
      agentId: "namazu",
    }),
    timeoutMs: 20000,
  });

  if (!createResp.ok) {
    const text = await createResp.text().catch(() => "");
    throw new Error(`Sakana create error (${createResp.status}): ${text.slice(0, 200)}`);
  }
  const createData = await createResp.json() as any;
  const conversationId = createData.conversationId;
  if (!conversationId) throw new Error("Sakana: No conversationId returned");

  // Step 2: Send message
  const sendResp = await fetchWithTimeout(`${base}/conversation/${conversationId}`, {
    method: "POST",
    headers: {
      "Cookie": `sakana-chat=${sessionId}`,
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36",
    },
    body: (() => {
      const formData = new (require("form-data") as any)();
      formData.append("data", JSON.stringify({
        inputs: messages.map(m => m.content).join("\n"),
        id: createData.systemMessageId,
        is_retry: false,
        is_continue: false,
        enableThinking: false,
        toneMode: "default",
        webSearchEnabled: false,
        userMessageId: crypto.randomUUID(),
      }));
      return formData;
    })(),
    timeoutMs: 40000,
  });

  if (!sendResp.ok) {
    const text = await sendResp.text().catch(() => "");
    throw new Error(`Sakana send error (${sendResp.status}): ${text.slice(0, 200)}`);
  }

  const text = await sendResp.text();
  // Parse NDJSON stream for final answer
  const lines = text.split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === "finalAnswer" && parsed.text) {
        const answerMatch = parsed.text.match(/<answer>([\s\S]*?)<\/answer>/);
        if (answerMatch) return answerMatch[1].trim();
        return parsed.text.trim();
      }
    } catch { /* skip non-JSON lines */ }
  }
  throw new Error("Sakana: No answer in response");
}

// Novita DeepSeek V4 — requires API key
async function callNovitaDeepseek(messages: Array<{role: string; content: string}>, apiKey?: string): Promise<string> {
  const key = apiKey || process.env.POWERX_NOVITA_KEY;
  if (!key) throw new Error("Novita: No API key configured (set POWERX_NOVITA_KEY)");

  const resp = await fetchWithTimeout("https://api.novita.ai/v3/openai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "deepseek/deepseek-v4-pro",
      messages: messages.map(m => ({ role: m.role === "model" ? "assistant" : m.role, content: m.content })),
      max_tokens: 4096,
    }),
    timeoutMs: 45000,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Novita DeepSeek error (${resp.status}): ${text.slice(0, 200)}`);
  }
  const data = await resp.json() as any;
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// DeepSeek Free (chat.deepseek.com web token)
async function callDeepseekFree(messages: Array<{role: string; content: string}>, token?: string): Promise<string> {
  const t = token || process.env.POWERX_DEEPSEEK_TOKEN;
  if (!t) throw new Error("DeepSeek Free: No token configured (set POWERX_DEEPSEEK_TOKEN)");

  const resp = await fetchWithTimeout("https://chat.deepseek.com/api/v0/chat/completion", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${t}`,
      "Accept": "application/json",
      "Origin": "https://chat.deepseek.com",
      "Referer": "https://chat.deepseek.com/",
    },
    body: JSON.stringify({
      messages: messages.map(m => ({ role: m.role === "model" ? "assistant" : m.role, content: m.content })),
      model: "deepseek-chat",
      stream: false,
    }),
    timeoutMs: 60000,
  });

  if (resp.status === 401) throw new Error("DeepSeek token expired — update POWERX_DEEPSEEK_TOKEN");
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`DeepSeek error (${resp.status}): ${text.slice(0, 200)}`);
  }
  const data = await resp.json() as any;
  return data.choices?.[0]?.message?.content?.trim() || data.text || "";
}

// StudentAI — Supabase Edge Function (free, auto-signup)
async function callStudentAI(messages: Array<{role: string; content: string}>): Promise<string> {
  const base = process.env.POWERX_STUDENTAI_BASE || "https://xlhlttpjalhruxevxmtp.supabase.co";
  const anonKey = process.env.POWERX_STUDENTAI_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsaGx0dHBqYWxocnV4ZXZ4bXRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNzM4NzIsImV4cCI6MjA4MTY0OTg3Mn0.2E66IgwYQsW7fNBxaRdFdOskuN0vVQl8a7Ay7anXq3c";

  // Get a session token (auto-signup)
  const email = `bot${Date.now()}${Math.floor(Math.random() * 1000)}@gmail.com`;
  const signupResp = await fetchWithTimeout(`${base}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Test12345!aB" }),
    timeoutMs: 30000,
  });
  const signupData = await signupResp.json() as any;
  const token = signupData?.access_token;
  if (!token) throw new Error("StudentAI: signup failed");

  // Call the edge function
  const resp = await fetchWithTimeout(`${base}/functions/v1/openai-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "apikey": anonKey,
    },
    body: JSON.stringify({
      messages: messages.map(m => ({
        role: m.role === "model" ? "assistant" : m.role,
        content: m.content,
      })),
    }),
    timeoutMs: 60000,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`StudentAI error (${resp.status}): ${text.slice(0, 200)}`);
  }
  const data = await resp.json() as any;
  return data.choices?.[0]?.message?.content?.trim() || data.text || "";
}

// eqing.tech (GPT-3.5-Turbo, keyless, captcha-free)
async function callEqing(messages: Array<{role: string; content: string}>): Promise<string> {
  const base = process.env.POWERX_EQING_BASE || "https://origin.eqing.tech";

  const resp = await fetchWithTimeout(`${base}/api/openai/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Origin": base,
      "Referer": `${base}/`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: messages.map(m => ({ role: m.role === "model" ? "assistant" : m.role, content: m.content })),
      max_tokens: 2048,
    }),
    timeoutMs: 45000,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`eqing error (${resp.status}): ${text.slice(0, 200)}`);
  }
  const data = await resp.json() as any;
  return data.choices?.[0]?.message?.content?.trim() || "";
}

// Unitool.ai (keyless, free, supports text + vision)
async function callUnitool(messages: Array<{role: string; content: string}>): Promise<string> {
  const endpoint = process.env.POWERX_UNITOOL_ENDPOINT || "https://unitool.ai/api/widget/stream";

  const resp = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "text/event-stream",
      "Origin": "https://unitool.ai",
      "Referer": "https://unitool.ai/en/chatgpt",
    },
    body: JSON.stringify({
      messages: messages.map(m => ({ role: m.role === "model" ? "assistant" : m.role, content: m.content })),
    }),
    timeoutMs: 60000,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Unitool error (${resp.status}): ${text.slice(0, 200)}`);
  }

  const rawText = await resp.text();
  const lines = rawText.split("\n").filter(Boolean);
  let content = "";
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const data = line.slice(6);
      if (data === "[DONE]") break;
      try {
        const parsed = JSON.parse(data);
        if (parsed.content) content += parsed.content;
      } catch { /* skip non-JSON */ }
    }
  }
  return content.trim() || "";
}

// ── Fusion: run multiple brains in parallel, synthesise the best ──────────

export interface BrainResult {
  brain: string;
  reply: string;
  error?: string;
}

/**
 * Run all enabled brains in parallel and return results.
 * Supports both text-only and vision requests.
 */
export async function askBrains(
  messages: Array<{role: string; content: string}>,
  config?: PowerXConfig,
): Promise<BrainResult[]> {
  const results: BrainResult[] = [];
  const tasks: Array<Promise<void>> = [];

  const hasVision = messages.some(m =>
    typeof m.content === "object" &&
    Array.isArray(m.content) &&
    m.content.some((p: any) => p.type === "image_url")
  );

  const textMessages = messages.filter(m => m.role !== "system").map(m => ({
    role: m.role,
    content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
  }));

  // HotBot (GPT-5) — supports text + vision
  if (config?.hotbot?.enabled !== false) {
    tasks.push((async () => {
      try {
        const reply = await callHotBot(textMessages, config?.hotbot?.apiKey);
        if (reply) results.push({ brain: "hotbot", reply });
      } catch (e: any) {
        log.warn({ err: e.message }, "HotBot failed");
        results.push({ brain: "hotbot", reply: "", error: e.message });
      }
    })());
  }

  // Gemini — supports text + vision
  if (config?.gemini?.enabled !== false) {
    tasks.push((async () => {
      try {
        const reply = await callGemini(textMessages, config?.gemini?.apiKey);
        if (reply) results.push({ brain: "gemini", reply });
      } catch (e: any) {
        log.warn({ err: e.message }, "Gemini failed");
        results.push({ brain: "gemini", reply: "", error: e.message });
      }
    })());
  }

  // Sakana — text + documents (free)
  if (config?.sakana?.enabled !== false && !hasVision) {
    tasks.push((async () => {
      try {
        const reply = await callSakana(textMessages, config?.sakana?.session);
        if (reply) results.push({ brain: "sakana", reply });
      } catch (e: any) {
        log.warn({ err: e.message }, "Sakana failed");
        results.push({ brain: "sakana", reply: "", error: e.message });
      }
    })());
  }

  // Novita DeepSeek V4 — text only (key-backed)
  if (config?.novita?.enabled !== false && !hasVision) {
    tasks.push((async () => {
      try {
        const reply = await callNovitaDeepseek(textMessages, config?.novita?.apiKey);
        if (reply) results.push({ brain: "novita", reply });
      } catch (e: any) {
        log.warn({ err: e.message }, "Novita failed");
        results.push({ brain: "novita", reply: "", error: e.message });
      }
    })());
  }

  // DeepSeek Free — text only
  if (config?.deepseek?.enabled !== false && !hasVision) {
    tasks.push((async () => {
      try {
        const reply = await callDeepseekFree(textMessages, config?.deepseek?.token);
        if (reply) results.push({ brain: "deepseek", reply });
      } catch (e: any) {
        log.warn({ err: e.message }, "DeepSeek Free failed");
        results.push({ brain: "deepseek", reply: "", error: e.message });
      }
    })());
  }

  // StudentAI — text only (free)
  if (config?.studentai?.enabled !== false && !hasVision) {
    tasks.push((async () => {
      try {
        const reply = await callStudentAI(textMessages);
        if (reply) results.push({ brain: "studentai", reply });
      } catch (e: any) {
        log.warn({ err: e.message }, "StudentAI failed");
        results.push({ brain: "studentai", reply: "", error: e.message });
      }
    })());
  }

  // eqing — text only (free, keyless)
  if (config?.eqing?.enabled !== false && !hasVision) {
    tasks.push((async () => {
      try {
        const reply = await callEqing(textMessages);
        if (reply) results.push({ brain: "eqing", reply });
      } catch (e: any) {
        log.warn({ err: e.message }, "eqing failed");
        results.push({ brain: "eqing", reply: "", error: e.message });
      }
    })());
  }

  // Unitool — text + vision (free, keyless)
  if (config?.unitool?.enabled !== false) {
    tasks.push((async () => {
      try {
        const reply = await callUnitool(textMessages);
        if (reply) results.push({ brain: "unitool", reply });
      } catch (e: any) {
        log.warn({ err: e.message }, "Unitool failed");
        results.push({ brain: "unitool", reply: "", error: e.message });
      }
    })());
  }

  await Promise.allSettled(tasks);
  return results;
}

/**
 * Get the best answer from all brains.
 * Filters non-empty replies, returns the highest quality one.
 * Priority order: HotBot > Gemini > Novita > Sakana > DeepSeek > Unitool > StudentAI > eqing
 */
export async function getBestAnswer(
  messages: Array<{role: string; content: string}>,
  config?: PowerXConfig,
): Promise<{ reply: string; brain: string }> {
  const results = await askBrains(messages, config);
  const valid = results.filter(r => r.reply && r.reply.trim().length > 10);

  if (valid.length === 0) {
    const fallback = results.find(r => r.reply?.trim());
    if (fallback) return { reply: fallback.reply, brain: fallback.brain };
    throw new Error("All PowerX brains failed");
  }

  // Priority order (strongest first)
  const priority = ["hotbot", "gemini", "novita", "sakana", "deepseek", "unitool", "studentai", "eqing"];
  for (const brain of priority) {
    const found = valid.find(r => r.brain === brain);
    if (found) return { reply: found.reply, brain: found.brain };
  }

  return { reply: valid[0].reply, brain: valid[0].brain };
}

/**
 * Fusion: ask multiple brains, then synthesise the best answer.
 * This is the Mixture-of-Agents approach — multiple proposers + one aggregator.
 */
export async function fusedAnswer(
  messages: Array<{role: string; content: string}>,
  config?: PowerXConfig,
): Promise<{ reply: string; brain: string; brains: string[] }> {
  const results = await askBrains(messages, config);
  const valid = results.filter(r => r.reply && r.reply.trim().length > 10);

  if (valid.length === 0) {
    throw new Error("All PowerX brains failed");
  }

  // If only one brain replied, return it directly
  if (valid.length === 1) {
    return { reply: valid[0].reply, brain: valid[0].brain, brains: [valid[0].brain] };
  }

  // Build synthesis prompt
  const candidates = valid.map((r, i) =>
    `--- CANDIDATE ${i + 1} (from ${r.brain}) ---\n${r.reply.slice(0, 3000)}`
  ).join("\n\n");

  const synthMessages = [
    {
      role: "system" as const,
      content: `You are a synthesis expert. Multiple AI models have independently answered the SAME question. Your job: read all candidates, keep the BEST parts of each, discard mistakes, and write ONE superior answer. Be thorough, accurate, and complete. Output ONLY the final answer, no meta-commentary.`,
    },
    {
      role: "user" as const,
      content: `CANDIDATE ANSWERS:\n\n${candidates}\n\nNow write the single best combined answer:`,
    },
  ];

  // Use HotBot or Gemini as the synthesizer
  const brainNames = valid.map(r => r.brain);
  let synthReply = "";
  try {
    if (config?.hotbot?.enabled !== false) {
      synthReply = await callHotBot(synthMessages, config?.hotbot?.apiKey);
    } else {
      synthReply = await callGemini(synthMessages, config?.gemini?.apiKey);
    }
  } catch {
    // Fallback: return the best individual answer
    const best = valid[0];
    return { reply: best.reply, brain: best.brain, brains: brainNames };
  }

  if (synthReply) {
    return { reply: synthReply, brain: `fusion[${valid[0].brain}]`, brains: brainNames };
  }

  return { reply: valid[0].reply, brain: valid[0].brain, brains: brainNames };
}

export default {
  askBrains,
  getBestAnswer,
  fusedAnswer,
  BRAIN_CAPABILITIES,
};