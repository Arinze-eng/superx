import { useState } from 'react';
import { api, ToolInfo, ModuleInfo, ToolAccessLevel } from '../lib/api';
import { errMsg } from '../lib/utils';

export function useToolManager(reloadFn: () => Promise<void>) {
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Shared envelope: mark `key` updating, run the mutation, reload, surface errors.
  const runUpdate = async (key: string, body: () => Promise<unknown>) => {
    setUpdating(key);
    try {
      await body();
      await reloadFn();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setUpdating(null);
    }
  };

  // Set the access level for a single tool.
  const updateLevel = (tool: ToolInfo, level: ToolAccessLevel) =>
    runUpdate(tool.name, () => api.updateToolConfig(tool.name, { level }));

  // Set the access level for every tool in a module.
  const bulkLevel = (module: ModuleInfo, level: ToolAccessLevel) =>
    runUpdate(module.name, async () => {
      for (const tool of module.tools) {
        if (tool.level !== level) {
          await api.updateToolConfig(tool.name, { level });
        }
      }
    });

  return { updating, error, setError, updateLevel, bulkLevel };
}
