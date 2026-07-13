import { describe, it, expect } from "vitest";
import { completionToSse } from "../sse-proxy.js";

// Parse the `data: {...}` SSE lines back into objects for assertions.
function parseEvents(events: string[]): any[] {
  return events.map((e) => JSON.parse(e.replace(/^data: /, "").trim()));
}

describe("completionToSse", () => {
  it("frames a chat completion into a delta chunk plus a usage chunk", () => {
    const completion = JSON.stringify({
      id: "c1",
      created: 1,
      model: "m",
      choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
    });
    const evs = parseEvents(completionToSse(completion));
    expect(evs).toHaveLength(2);
    expect(evs[0].choices[0].delta).toEqual({ role: "assistant", content: "hi" });
    expect(evs[0].choices[0].finish_reason).toBe("stop");
    expect(evs[1].choices).toEqual([]);
    expect(evs[1].usage.total_tokens).toBe(4);
  });

  it("emits only a delta chunk when usage is absent", () => {
    const evs = parseEvents(
      completionToSse(
        JSON.stringify({ id: "c2", choices: [{ index: 0, message: { content: "x" } }] })
      )
    );
    expect(evs).toHaveLength(1);
    expect(evs[0].choices[0].delta.content).toBe("x");
  });

  it("surfaces a runner error envelope as an SSE error event, not an empty stream", () => {
    // Regression: a 200 {error} envelope used to be framed into an empty,
    // zero-token success stream, silently hiding the runner failure.
    const evs = parseEvents(
      completionToSse(JSON.stringify({ error: { message: "no workers available" } }))
    );
    expect(evs).toHaveLength(1);
    expect(evs[0].error.message).toBe("no workers available");
    expect(evs[0].choices).toBeUndefined();
  });

  it("turns a non-JSON upstream body into an error event carrying a snippet", () => {
    const evs = parseEvents(completionToSse("upstream 502 bad gateway <html>"));
    expect(evs).toHaveLength(1);
    expect(evs[0].error.message).toContain("non-JSON upstream body");
    expect(evs[0].error.message).toContain("upstream 502");
  });
});
