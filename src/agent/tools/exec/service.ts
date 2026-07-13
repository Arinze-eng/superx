import { Type } from "@sinclair/typebox";
import type { Tool, ToolExecutor, ToolResult } from "../types.js";
import type { ExecConfig } from "../../../config/schema.js";
import { runAudited } from "./audited-run.js";
import type Database from "better-sqlite3";

interface ExecServiceParams {
  action: "start" | "stop" | "restart" | "status" | "enable" | "disable";
  name: string;
}

export const execServiceTool: Tool = {
  name: "exec_service",
  description:
    "Manage systemd services. Supports start, stop, restart, status, enable, and disable actions.",
  parameters: Type.Object({
    action: Type.Union(
      [
        Type.Literal("start"),
        Type.Literal("stop"),
        Type.Literal("restart"),
        Type.Literal("status"),
        Type.Literal("enable"),
        Type.Literal("disable"),
      ],
      { description: "Systemd action to perform" }
    ),
    name: Type.String({
      description: "Service name (e.g. 'nginx', 'docker', 'postgresql')",
    }),
  }),
};

export function createExecServiceExecutor(
  db: Database.Database,
  execConfig: ExecConfig
): ToolExecutor<ExecServiceParams> {
  return async (params, context): Promise<ToolResult> => {
    const { action, name } = params;
    const command = `systemctl ${action} ${name}`;
    const { result } = await runAudited(db, execConfig, {
      tool: "exec_service",
      command,
      senderId: context.senderId,
    });
    const { timeout } = execConfig.limits;

    return {
      success: result.exitCode === 0 && !result.timedOut,
      data: {
        service: name,
        action,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        duration: result.duration,
      },
      ...(result.timedOut
        ? { error: `Service command timed out after ${timeout}s` }
        : result.exitCode !== 0
          ? { error: `systemctl ${action} ${name} failed (exit code ${result.exitCode})` }
          : {}),
    };
  };
}
