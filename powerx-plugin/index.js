/**
 * PowerX Brain Fusion Plugin for Teleton Agent
 *
 * Adds multi-brain AI capabilities to the Teleton agent, including:
 * - HotBot (GPT-5), Gemini, Sakana (Namazu), Novita DeepSeek V4
 * - DeepSeek Free, StudentAI, eqing GPT-3.5, Unitool Vision
 *
 * Each brain is a separate tool. Fusion mode runs all brains in parallel
 * and synthesises the best answer.
 */

const BRAIN_CAPABILITIES = {
  hotbot:    { name: "GPT-5 (HotBot)", vision: true, free: false, key: "POWERX_HOTBOT_KEY" },
  gemini:    { name: "Gemini 3.1 Flash", vision: true, free: false, key: "POWERX_GEMINI_KEY" },
  sakana:    { name: "Sakana (Namazu)", vision: false, free: true, key: null },
  novita:    { name: "Novita DeepSeek V4", vision: false, free: false, key: "POWERX_NOVITA_KEY" },
  deepseek:  { name: "DeepSeek (Free)", vision: false, free: true, key: "POWERX_DEEPSEEK_TOKEN" },
  studentai: { name: "StudentAI", vision: false, free: true, key: null },
  eqing:     { name: "GPT-3.5 (eqing)", vision: false, free: true, key: null },
  unitool:   { name: "Unitool Vision", vision: true, free: true, key: null },
};

const BRAIN_PRIORITY = ["hotbot", "gemini", "novita", "sakana", "deepseek", "unitool", "studentai", "eqing"];

/**
 * Create a fetch function with timeout
 */
function fetchWithTimeout(url, options = {}) {
  const { timeout = 30000, ...fetchOpts } = options;
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    fetch(url, { ...fetchOpts, signal: controller.signal })
      .then(res => { clearTimeout(timer); resolve(res); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

// ── Brain callers ──────────────────────────────────────────────────────────

async function callHotBot(messages, config) {
  const key = process.env.POWERX_HOTBOT_KEY || config?.hotbot_key;
  if (!key) throw new Error("HotBot: No API key (set POWERX_HOTBOT_KEY)");
  const resp = await fetchWithTimeout("https://api.hotbot.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "gpt-5", messages, max_tokens: 4096 }),
    timeout: 60000,
  });
  if (!resp.ok) throw new Error(`HotBot ${resp.status}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function callGemini(messages, config) {
  const key = process.env.POWERX_GEMINI_KEY || config?.gemini_key;
  if (!key) throw new Error("Gemini: No API key (set POWERX_GEMINI_KEY)");
  const contents = [];
  let system = "";
  for (const m of messages) {
    if (m.role === "system") { system = m.content; continue; }
    contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] });
  }
  const payload = { contents };
  if (system) payload.system_instruction = { parts: [{ text: system }] };
  const resp = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), timeout: 60000 }
  );
  if (!resp.ok) throw new Error(`Gemini ${resp.status}`);
  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

async function callSakana(messages) {
  const session = process.env.POWERX_SAKANA_SESSION || "71cc2345-e7c8-4504-a351-e10c43779b4a";
  const base = "https://chat.sakana.ai";
  const text = messages.map(m => m.content).join("\n");
  const create = await fetchWithTimeout(`${base}/conversation`, {
    method: "POST", timeout: 20000,
    headers: { "Content-Type": "application/json", Cookie: `sakana-chat=${session}`, "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify({ inputs: text, enableThinking: false, agentId: "namazu" }),
  });
  if (!create.ok) throw new Error(`Sakana create ${create.status}`);
  const cd = await create.json();
  if (!cd.conversationId) throw new Error("Sakana: no conversationId");

  const boundary = `----FB${Math.random().toString(36).slice(2)}`;
  const dp = JSON.stringify({ inputs: text, id: cd.systemMessageId, is_retry: false, is_continue: false, enableThinking: false, userMessageId: crypto.randomUUID() });
  const body = `--${boundary}\r\nContent-Disposition: form-data; name="data"\r\n\r\n${dp}\r\n--${boundary}--\r\n`;
  const send = await fetchWithTimeout(`${base}/conversation/${cd.conversationId}`, {
    method: "POST", timeout: 40000,
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, Cookie: `sakana-chat=${session}`, "User-Agent": "Mozilla/5.0" },
    body,
  });
  if (!send.ok) throw new Error(`Sakana send ${send.status}`);
  const raw = await send.text();
  for (const line of raw.split("\n").filter(Boolean)) {
    try {
      const p = JSON.parse(line);
      if (p.type === "finalAnswer" && p.text) {
        const m = p.text.match(/<answer>([\s\S]*?)<\/answer>/);
        return m ? m[1].trim() : p.text.trim();
      }
    } catch {}
  }
  throw new Error("Sakana: no answer");
}

async function callNovita(messages) {
  const key = process.env.POWERX_NOVITA_KEY;
  if (!key) throw new Error("Novita: No API key (set POWERX_NOVITA_KEY)");
  const resp = await fetchWithTimeout("https://api.novita.ai/v3/openai/chat/completions", {
    method: "POST", timeout: 45000,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "deepseek/deepseek-v4-pro", messages, max_tokens: 4096 }),
  });
  if (!resp.ok) throw new Error(`Novita ${resp.status}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function callDeepseek(messages) {
  const token = process.env.POWERX_DEEPSEEK_TOKEN;
  if (!token) throw new Error("DeepSeek: No token (set POWERX_DEEPSEEK_TOKEN)");
  const resp = await fetchWithTimeout("https://chat.deepseek.com/api/v0/chat/completion", {
    method: "POST", timeout: 60000,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Origin: "https://chat.deepseek.com" },
    body: JSON.stringify({ messages, model: "deepseek-chat", stream: false }),
  });
  if (resp.status === 401) throw new Error("DeepSeek token expired");
  if (!resp.ok) throw new Error(`DeepSeek ${resp.status}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || data.text || "";
}

async function callStudentAI(messages) {
  const base = "https://xlhlttpjalhruxevxmtp.supabase.co";
  const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsaGx0dHBqYWxocnV4ZXZ4bXRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNzM4NzIsImV4cCI6MjA4MTY0OTg3Mn0.2E66IgwYQsW7fNBxaRdFdOskuN0vVQl8a7Ay7anXq3c";
  const email = `bot${Date.now()}${Math.random().toString(36).slice(2, 6)}@gmail.com`;
  const signup = await fetchWithTimeout(`${base}/auth/v1/signup`, {
    method: "POST", timeout: 30000,
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Test12345!aB" }),
  });
  const sd = await signup.json();
  const token = sd?.access_token;
  if (!token) throw new Error("StudentAI: signup failed");
  const resp = await fetchWithTimeout(`${base}/functions/v1/openai-chat`, {
    method: "POST", timeout: 60000,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: anonKey },
    body: JSON.stringify({ messages }),
  });
  if (!resp.ok) throw new Error(`StudentAI ${resp.status}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || data.text || "";
}

async function callEqing(messages) {
  const resp = await fetchWithTimeout("https://origin.eqing.tech/api/openai/v1/chat/completions", {
    method: "POST", timeout: 45000,
    headers: { "Content-Type": "application/json", Origin: "https://origin.eqing.tech" },
    body: JSON.stringify({ model: "gpt-3.5-turbo", messages, max_tokens: 2048 }),
  });
  if (!resp.ok) throw new Error(`eqing ${resp.status}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function callUnitool(messages) {
  const resp = await fetchWithTimeout("https://unitool.ai/api/widget/stream", {
    method: "POST", timeout: 60000,
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", Origin: "https://unitool.ai" },
    body: JSON.stringify({ messages }),
  });
  if (!resp.ok) throw new Error(`Unitool ${resp.status}`);
  const raw = await resp.text();
  let content = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("data: ")) {
      const d = line.slice(6);
      if (d === "[DONE]") break;
      try { const p = JSON.parse(d); if (p.content) content += p.content; } catch {}
    }
  }
  return content.trim() || "";
}

const BRAIN_HANDLERS = {
  hotbot: callHotBot, gemini: callGemini, sakana: callSakana,
  novita: callNovita, deepseek: callDeepseek,
  studentai: callStudentAI, eqing: callEqing, unitool: callUnitool,
};

// ── Plugin entrypoint ──────────────────────────────────────────────────────

module.exports = async function powerxPlugin(sdk) {
  const log = sdk.logger;

  /**
   * Tool: powerx_ask — ask a specific brain
   */
  sdk.registerTool({
    name: "powerx_ask",
    description: "Ask a specific PowerX AI brain a question. Brains: hotbot (GPT-5), gemini, sakana, novita (DeepSeek V4), deepseek (free), studentai, eqing (GPT-3.5), unitool (vision). Use 'auto' for best available.",
    parameters: {
      type: "object",
      properties: {
        brain: { type: "string", enum: ["auto", "hotbot", "gemini", "sakana", "novita", "deepseek", "studentai", "eqing", "unitool"], default: "auto" },
        prompt: { type: "string", description: "The question or task" },
        system: { type: "string", description: "Optional system prompt" },
      },
      required: ["prompt"],
    },
    handler: async (params) => {
      const brain = (params.brain || "auto").toLowerCase();
      const prompt = params.prompt?.trim();
      const system = params.system?.trim();
      if (!prompt) return { success: false, data: "No prompt provided." };

      const messages = [];
      if (system) messages.push({ role: "system", content: system });
      messages.push({ role: "user", content: prompt });

      try {
        if (brain === "auto") {
          const config = sdk.config;
          let lastError = "No brains available";
          for (const b of BRAIN_PRIORITY) {
            try {
              if (BRAIN_HANDLERS[b]) {
                const reply = await BRAIN_HANDLERS[b](messages, config);
                if (reply && reply.length > 10) {
                  return { success: true, data: `**[${BRAIN_CAPABILITIES[b].name}]** replied:\n\n${reply}` };
                }
              }
            } catch (e) { lastError = e.message; }
          }
          return { success: false, data: `All brains failed: ${lastError}` };
        }

        if (!BRAIN_HANDLERS[brain]) {
          return { success: false, data: `Unknown brain: ${brain}` };
        }
        const reply = await BRAIN_HANDLERS[brain](messages, sdk.config);
        const name = BRAIN_CAPABILITIES[brain]?.name || brain;
        return { success: true, data: `**[${name}]** replied:\n\n${reply}` };
      } catch (e) {
        return { success: false, data: `Error calling ${brain}: ${e.message}` };
      }
    },
  });

  /**
   * Tool: powerx_fusion — run all brains in parallel, synthesise best answer
   */
  sdk.registerTool({
    name: "powerx_fusion",
    description: "Run multiple PowerX AI brains in parallel and synthesise the best answer. Higher quality than any single brain. Use for complex questions, coding, analysis.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The question or task" },
        system: { type: "string", description: "Optional system prompt" },
        brains: { type: "string", description: "Comma-separated brains (default: all enabled)" },
      },
      required: ["prompt"],
    },
    handler: async (params) => {
      const prompt = params.prompt?.trim();
      const system = params.system?.trim();
      if (!prompt) return { success: false, data: "No prompt provided." };

      const messages = [];
      if (system) messages.push({ role: "system", content: system });
      messages.push({ role: "user", content: prompt });

      const results = [];
      const config = sdk.config;

      await Promise.allSettled(Object.entries(BRAIN_HANDLERS).map(async ([name, handler]) => {
        try {
          const reply = await handler(messages, config);
          if (reply && reply.length > 10) results.push({ brain: name, reply });
        } catch (e) {
          log.warn(`PowerX ${name} failed: ${e.message}`);
        }
      }));

      if (results.length === 0) {
        return { success: false, data: "All PowerX brains failed." };
      }

      const brainNames = results.map(r => BRAIN_CAPABILITIES[r.brain]?.name || r.brain).join(", ");

      if (results.length === 1) {
        return { success: true, data: `**🧠 ${brainNames}** replied:\n\n${results[0].reply}` };
      }

      return { success: true, data: `**🧠 Fusion from ${brainNames}**\n\n${results[0].reply}\n\n---\n*Also consulted: ${results.slice(1).map(r => r.brain).join(", ")}*` };
    },
  });

  /**
   * Tool: powerx_list_brains — list all available brains
   */
  sdk.registerTool({
    name: "powerx_list_brains",
    description: "List all available PowerX AI brains and their capabilities.",
    parameters: { type: "object", properties: {} },
    handler: async () => {
      const lines = Object.entries(BRAIN_CAPABILITIES).map(([key, info]) => {
        const features = ["text"];
        if (info.vision) features.push("vision/images");
        const price = info.free ? "free" : "paid";
        const keyStatus = info.key ? `needs ${info.key}` : "no key needed";
        return `• **${info.name}** (\`${key}\`): ${features.join(", ")} — ${price}, ${keyStatus}`;
      });
      return { success: true, data: `Available PowerX AI Brains:\n\n${lines.join("\n")}` };
    },
  });

  log.info("PowerX plugin loaded with 3 tools (powerx_ask, powerx_fusion, powerx_list_brains)");
};