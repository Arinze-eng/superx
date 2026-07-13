import { ToolInfo, ToolAccessLevel } from '../lib/api';
import { PillTabs } from './PillTabs';

interface ToolRowProps {
  tool: ToolInfo;
  updating: string | null;
  onLevel: (tool: ToolInfo, level: ToolAccessLevel) => void;
}

export const LEVEL_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'allowlist', label: 'List' },
  { value: 'admin', label: 'Admin' },
  { value: 'off', label: 'Off' },
];

export function ToolRow({ tool, updating, onLevel }: ToolRowProps) {
  const busy = updating === tool.name;

  return (
    <div className="tool-row2" style={{ opacity: tool.level === 'off' ? 0.55 : 1 }}>
      <div className="ios-row-title tool-row2-main" title={tool.description}>{tool.name}</div>
      <PillTabs
        value={tool.level}
        options={LEVEL_OPTIONS}
        onChange={(v) => onLevel(tool, v as ToolAccessLevel)}
        disabled={busy}
        ariaLabel={`Access level for ${tool.name}`}
      />
    </div>
  );
}
