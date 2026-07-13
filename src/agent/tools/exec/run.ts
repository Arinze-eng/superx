import { Type } from "@sinclair/typebox";
import type { Tool, ToolExecutor, ToolResult } from "../types.js";
import type { ExecConfig } from "../../../config/schema.js";
import { runAudited } from "./audited-run.js";
import type Database from "better-sqlite3";

interface ExecRunParams {
  command: string;
}

export const execRunTool: Tool = {
  name: "exec_run",
  description:
    "Execute an arbitrary bash command on the host system. Last resort for tasks not covered by exec_install (package installation), exec_service (systemd management), or exec_status (system health). Returns stdout, stderr, exit code. Supports pipes, &&, redirects.",
  parameters: Type.Object({
    command: Type.String({
      description: "The bash command to execute (supports pipes, &&, redirects, etc.)",
    }),
  }),
};

export function createExecRunExecutor(
  db: Database.Database,
  execConfig: ExecConfig
): ToolExecutor<ExecRunParams> {
  return async (params, context): Promise<ToolResult> => {
    const { command } = params;
    const { result } = await runAudited(db, execConfig, {
      tool: "exec_run",
      command,
      senderId: context.senderId,
    });
    const { timeout } = execConfig.limits;

    return {
      success: result.exitCode === 0 && !result.timedOut,
      data: {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        duration: result.duration,
        truncated: result.truncated,
        timedOut: result.timedOut,
      },
      ...(result.timedOut
        ? { error: `Command timed out after ${timeout}s` }
        : result.exitCode !== 0
          ? { error: `Command exited with code ${result.exitCode}` }
          : {}),
    };
  };
}
