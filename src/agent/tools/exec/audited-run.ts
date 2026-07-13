import type Database from "better-sqlite3";
import type { ExecConfig } from "../../../config/schema.js";
import type { ExecAuditEntry, ExecResult } from "./types.js";
import { runCommand } from "./runner.js";
import { insertAuditEntry, updateAuditEntry } from "./audit.js";

export type ExecAuditStatus = Exclude<ExecAuditEntry["status"], "running">;

/**
 * Map a finished command to an audit status. Timeout wins over a signal kill (a
 * timeout kills via SIGTERM/SIGKILL); a bare signal means the process was killed
 * externally — previously mislabelled 'failed' although types.ts declared 'killed'.
 */
export function mapExecStatus(result: ExecResult): ExecAuditStatus {
  if (result.timedOut) return "timeout";
  if (result.signal) return "killed";
  return result.exitCode === 0 ? "success" : "failed";
}

/**
 * Run a command with the shared audit lifecycle: insert a 'running' audit row
 * (when enabled), run the command, map the status, then update the row. Returns
 * the raw result and the mapped status so each tool builds its own data payload.
 */
export async function runAudited(
  db: Database.Database,
  execConfig: ExecConfig,
  args: { tool: ExecAuditEntry["tool"]; command: string; senderId: number }
): Promise<{ result: ExecResult; status: ExecAuditStatus }> {
  const { timeout, max_output } = execConfig.limits;

  let auditId: number | undefined;
  if (execConfig.audit.log_commands) {
    auditId = insertAuditEntry(db, {
      userId: args.senderId,
      username: undefined,
      tool: args.tool,
      command: args.command,
      status: "running",
      truncated: false,
    });
  }

  const result = await runCommand(args.command, {
    timeout: timeout * 1000,
    maxOutput: max_output,
  });

  const status = mapExecStatus(result);

  if (auditId !== undefined) {
    updateAuditEntry(db, auditId, {
      status,
      exitCode: result.exitCode ?? undefined,
      signal: result.signal ?? undefined,
      duration: result.duration,
      stdout: result.stdout,
      stderr: result.stderr,
      truncated: result.truncated,
    });
  }

  return { result, status };
}
