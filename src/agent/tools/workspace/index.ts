// src/agent/tools/workspace/index.ts

import { workspaceListTool, workspaceListExecutor } from "./list.js";
import { workspaceReadTool, workspaceReadExecutor } from "./read.js";
import { workspaceWriteTool, workspaceWriteExecutor } from "./write.js";
import { workspaceDeleteTool, workspaceDeleteExecutor } from "./delete.js";
import { workspaceInfoTool, workspaceInfoExecutor } from "./info.js";
import { workspaceRenameTool, workspaceRenameExecutor } from "./rename.js";
import type { ToolEntry } from "../types.js";

export { workspaceListTool, workspaceListExecutor };
export { workspaceReadTool, workspaceReadExecutor };
export { workspaceWriteTool, workspaceWriteExecutor };
export { workspaceDeleteTool, workspaceDeleteExecutor };
export { workspaceInfoTool, workspaceInfoExecutor };
export { workspaceRenameTool, workspaceRenameExecutor };

export const tools: ToolEntry[] = [
  {
    tool: workspaceWriteTool,
    executor: workspaceWriteExecutor,
    scope: "dm-only",
    mode: "both",
    tags: ["workspace"],
  },
  {
    tool: workspaceDeleteTool,
    executor: workspaceDeleteExecutor,
    scope: "dm-only",
    mode: "both",
    tags: ["workspace"],
  },
  {
    tool: workspaceRenameTool,
    executor: workspaceRenameExecutor,
    scope: "dm-only",
    mode: "both",
    tags: ["workspace"],
  },
  { tool: workspaceListTool, executor: workspaceListExecutor, mode: "both", tags: ["workspace"] },
  { tool: workspaceReadTool, executor: workspaceReadExecutor, mode: "both", tags: ["workspace"] },
  { tool: workspaceInfoTool, executor: workspaceInfoExecutor, mode: "both", tags: ["workspace"] },
];
