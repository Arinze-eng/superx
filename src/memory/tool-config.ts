import type Database from "better-sqlite3";
import { levelToScope, type ToolAccessLevel } from "../agent/tools/scope.js";

export interface ToolConfig {
  toolName: string;
  level: ToolAccessLevel;
  updatedAt: number;
  updatedBy: number | null;
}

interface ToolConfigRow {
  tool_name: string;
  scope_level: ToolAccessLevel;
  updated_at: number;
  updated_by: number | null;
}

function rowToConfig(row: ToolConfigRow): ToolConfig {
  return {
    toolName: row.tool_name,
    level: row.scope_level,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/**
 * Load tool configuration from database
 */
export function loadToolConfig(db: Database.Database, toolName: string): ToolConfig | null {
  const row = db
    .prepare(
      `SELECT tool_name, scope_level, updated_at, updated_by
       FROM tool_config
       WHERE tool_name = ?`
    )
    .get(toolName) as ToolConfigRow | undefined;

  return row ? rowToConfig(row) : null;
}

/**
 * Load all tool configurations from database
 */
export function loadAllToolConfigs(db: Database.Database): Map<string, ToolConfig> {
  const rows = db
    .prepare(
      `SELECT tool_name, scope_level, updated_at, updated_by
       FROM tool_config`
    )
    .all() as ToolConfigRow[];

  const configs = new Map<string, ToolConfig>();
  for (const row of rows) {
    configs.set(row.tool_name, rowToConfig(row));
  }
  return configs;
}

/**
 * Save or update a tool's access level. The legacy enabled/scope columns are
 * kept in sync (derived) so a downgrade to pre-1.19 code still sees coherent
 * values.
 */
export function saveToolConfig(
  db: Database.Database,
  toolName: string,
  level: ToolAccessLevel,
  updatedBy?: number
): void {
  const legacyScope = levelToScope(level);
  const legacyEnabled = level === "off" ? 0 : 1;
  db.prepare(
    `INSERT INTO tool_config (tool_name, enabled, scope, scope_level, updated_at, updated_by)
     VALUES (?, ?, ?, ?, unixepoch(), ?)
     ON CONFLICT(tool_name) DO UPDATE SET
       enabled = excluded.enabled,
       scope = excluded.scope,
       scope_level = excluded.scope_level,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`
  ).run(toolName, legacyEnabled, legacyScope, level, updatedBy ?? null);
}

/**
 * Initialize tool config for a tool if not exists (seed from defaults)
 */
export function initializeToolConfig(
  db: Database.Database,
  toolName: string,
  level: ToolAccessLevel
): void {
  const existing = loadToolConfig(db, toolName);
  if (!existing) {
    const legacyScope = levelToScope(level);
    const legacyEnabled = level === "off" ? 0 : 1;
    db.prepare(
      `INSERT INTO tool_config (tool_name, enabled, scope, scope_level, updated_at, updated_by)
       VALUES (?, ?, ?, ?, unixepoch(), NULL)`
    ).run(toolName, legacyEnabled, legacyScope, level);
  }
}
