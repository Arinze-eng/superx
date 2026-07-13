import http from "node:http";
import { createLogger } from "../utils/logger.js";

const log = createLogger("gocoon-sse");

export interface GocoonSseProxyOptions {
  runnerPort: number;
  host?: string;
}

// GocoonSseProxy sits in front of the gocoon runner. pi-ai always sends
// stream:true and only parses Server-Sent Events, but the runner returns a
// single JSON document. This proxy forwards requests to the runner and, when
// the client asked for streaming, frames the runner's JSON reply as SSE so
// pi-ai parses it. The gocoon runner itself stays untouched.
export class GocoonSseProxy {
  private server: http.Server | null = null;
  private readonly runnerPort: number;
  private readonly host: string;
  port = 0;

  constructor(opts: GocoonSseProxyOptions) {
    this.runnerPort = opts.runnerPort;
    this.host = opts.host ?? "127.0.0.1";
  }

  async start(): Promise<void> {
    const server = http.createServer((req, res) => {
      void this.handle(req, res);
    });
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, this.host, () => {
        const addr = server.address();
        this.port = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    });
    log.info(`SSE proxy on ${this.host}:${this.port} -> runner ${this.runnerPort}`);
  }

  stop(): void {
    this.server?.close();
    this.server = null;
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    const wantsStream =
      req.method === "POST" &&
      /\/v1\/chat\/completions$/.test(req.url ?? "") &&
      requestWantsStream(body);

    let upstream: Response;
    try {
      upstream = await fetch(`http://127.0.0.1:${this.runnerPort}${req.url ?? ""}`, {
        method: req.method,
        headers: { "content-type": req.headers["content-type"] ?? "application/json" },
        body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
      });
    } catch (err) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `gocoon sse-proxy: ${String(err)}` } }));
      return;
    }

    const ctype = upstream.headers.get("content-type") ?? "";
    // Frame a single JSON completion as SSE only when the client wanted streaming.
    if (wantsStream && ctype.includes("application/json")) {
      const text = await upstream.text();
      // A runner error (non-2xx) must surface as a real error, not be reframed
      // into an empty 200 SSE stream — which the OpenAI SDK parses as a
      // successful zero-token reply, hiding "no workers / channel out of balance
      // / model not served" and letting the agent retry silently.
      if (!upstream.ok) {
        res.writeHead(upstream.status, { "content-type": "application/json" });
        res.end(
          text ||
            JSON.stringify({ error: { message: `gocoon runner returned HTTP ${upstream.status}` } })
        );
        return;
      }
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      for (const ev of completionToSse(text)) res.write(ev);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }
    // Pass everything else through unchanged (GET /v1/models, already-SSE, non-stream).
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, { "content-type": ctype || "application/json" });
    res.end(buf);
  }
}

function requestWantsStream(body: Buffer): boolean {
  try {
    return (JSON.parse(body.toString("utf8")) as { stream?: boolean }).stream === true;
  } catch {
    return false;
  }
}

// completionToSse converts an OpenAI chat.completion document into the SSE
// "data:" events of a stream: one chunk carrying the message as a delta, then
// a final chunk carrying usage with no choices.
export function completionToSse(completion: string): string[] {
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(completion) as Record<string, unknown>;
  } catch {
    // Non-JSON upstream body labelled application/json: emit a structured error
    // so the SDK throws a clean APIError instead of an opaque SyntaxError.
    const snippet = completion.slice(0, 200).replace(/\s+/g, " ").trim();
    return [
      `data: ${JSON.stringify({ error: { message: `gocoon sse-proxy: non-JSON upstream body: ${snippet}` } })}\n\n`,
    ];
  }
  // A 200 error envelope must surface as a thrown error, not an empty stream.
  if (doc.error) {
    return [`data: ${JSON.stringify({ error: doc.error })}\n\n`];
  }
  const choices = Array.isArray(doc.choices) ? (doc.choices as Record<string, unknown>[]) : [];
  const base = () => ({
    id: doc.id,
    object: "chat.completion.chunk",
    created: doc.created,
    model: doc.model,
  });

  const deltaChoices = choices.map((choice, i) => {
    const msg = (choice.message ?? {}) as Record<string, unknown>;
    const delta: Record<string, unknown> = {};
    if (msg.role !== undefined) delta.role = msg.role;
    if (msg.content !== undefined) delta.content = msg.content;
    if (Array.isArray(msg.tool_calls)) {
      delta.tool_calls = (msg.tool_calls as Record<string, unknown>[]).map((tc, idx) => ({
        index: idx,
        ...tc,
      }));
    }
    const out: Record<string, unknown> = { index: i, delta };
    if (choice.finish_reason !== undefined) out.finish_reason = choice.finish_reason;
    return out;
  });

  const events = [`data: ${JSON.stringify({ ...base(), choices: deltaChoices })}\n\n`];
  if (doc.usage) {
    events.push(`data: ${JSON.stringify({ ...base(), choices: [], usage: doc.usage })}\n\n`);
  }
  return events;
}
