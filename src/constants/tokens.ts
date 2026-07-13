export const HEARTBEAT_OK_TOKEN = "NO_ACTION";
export const SILENT_REPLY_TOKEN = "__SILENT__";

export function isHeartbeatOk(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed === HEARTBEAT_OK_TOKEN) return true;
  // Token at start with short suffix
  if (trimmed.startsWith(HEARTBEAT_OK_TOKEN)) {
    const remainder = trimmed.slice(HEARTBEAT_OK_TOKEN.length).trim();
    if (remainder.length <= 100) return true;
  }
  // Token at end — LLM often reasons then concludes with NO_ACTION
  if (trimmed.endsWith(HEARTBEAT_OK_TOKEN)) return true;
  // Token anywhere in the text (last line)
  const lastLine = trimmed.split("\n").pop()?.trim();
  if (lastLine === HEARTBEAT_OK_TOKEN) return true;
  return false;
}

export function isSilentReply(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed === SILENT_REPLY_TOKEN) return true;
  // LLM often reasons then concludes with __SILENT__
  if (trimmed.endsWith(SILENT_REPLY_TOKEN)) return true;
  const lastLine = trimmed.split("\n").pop()?.trim();
  if (lastLine === SILENT_REPLY_TOKEN) return true;
  return false;
}
