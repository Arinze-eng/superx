import { useState, Fragment } from 'react';
import { api, ToolInfo, ModuleInfo } from '../lib/api';
import { ToolRow, LEVEL_OPTIONS } from '../components/ToolRow';
import { PillTabs } from '../components/PillTabs';
import { SearchBar } from '../components/SearchBar';
import { Segmented } from '../components/Segmented';
import { List, ListRow } from '../components/List';
import { useToolManager } from '../hooks/useToolManager';
import { useResource } from '../hooks/useResource';
import { RefreshButton } from '../components/RefreshButton';
import { Alert } from '../components/Alert';
import { SkeletonRows } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';

type Filter = 'all' | 'enabled' | 'disabled';

// Common level across a module's tools, or '' when mixed.
const commonLevel = (tools: ToolInfo[]): string => {
  const set = new Set(tools.map((t) => t.level));
  return set.size === 1 ? (set.values().next().value ?? '') : '';
};

export function Tools() {
  const [expandedModule, setExpandedModule] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const { data: modules, loading, error, reload, setError } = useResource<ModuleInfo[]>(
    () => api.getTools().then((r) => r.data),
    [],
  );

  const { updating, updateLevel, bulkLevel } = useToolManager(reload);

  if (loading) {
    return (
      <div>
        <div className="header">
          <h1>Tools</h1>
          <p>Loading modules…</p>
        </div>
        <SkeletonRows />
      </div>
    );
  }

  const allModules = modules ?? [];
  const builtIn = allModules.filter((m) => !m.isPlugin);
  const builtInCount = builtIn.reduce((sum, m) => sum + m.toolCount, 0);
  const enabledCount = builtIn.reduce((sum, m) => sum + m.tools.filter((t) => t.level !== 'off').length, 0);

  const trimmedSearch = search.trim().toLowerCase();
  const filtered = builtIn.filter((m) => {
    if (trimmedSearch) {
      const match =
        m.name.toLowerCase().includes(trimmedSearch) ||
        m.tools.some(
          (t) =>
            t.name.toLowerCase().includes(trimmedSearch) ||
            t.description.toLowerCase().includes(trimmedSearch),
        );
      if (!match) return false;
    }
    if (filter === 'enabled') return m.tools.some((t) => t.level !== 'off');
    if (filter === 'disabled') return m.tools.every((t) => t.level === 'off');
    return true;
  });

  return (
    <div>
      <div className="header">
        <h1>Tools</h1>
        <p>
          {builtInCount} built-in tools across {builtIn.length} modules
        </p>
      </div>

      {error && (
        <Alert type="error" message={error} onDismiss={() => setError(null)} style={{ marginBottom: '14px' }}>
          <button className="btn-sm" onClick={() => { setError(null); reload(); }}>Retry</button>
        </Alert>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter modules"
          options={[
            { value: 'all', label: `All ${builtIn.length}` },
            { value: 'enabled', label: `Active ${enabledCount}` },
            { value: 'disabled', label: `Off ${builtInCount - enabledCount}` },
          ]}
        />
        <div style={{ flex: 1, minWidth: '180px' }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Search tools…" />
        </div>
        <RefreshButton onRefresh={reload} />
      </div>

      {/* Module list */}
      {filtered.length === 0 ? (
        <div className="card" style={{ padding: 0 }}>
          {trimmedSearch || filter !== 'all' ? (
            <EmptyState
              title="No modules found"
              description="No modules match your filters."
              action={
                <button className="btn-ghost btn-sm" onClick={() => { setSearch(''); setFilter('all'); }}>
                  Clear filters
                </button>
              }
            />
          ) : (
            <EmptyState title="No modules found" description="No tool modules are available." />
          )}
        </div>
      ) : (
        <List>
          {filtered.map((module) => {
            const isExpanded = expandedModule === module.name;
            const activeInModule = module.tools.filter((t) => t.level !== 'off').length;
            const common = commonLevel(module.tools);
            const isBusy = updating === module.name;

            return (
              <Fragment key={module.name}>
                <ListRow
                  leading={module.name.charAt(0).toUpperCase()}
                  title={module.name}
                  subtitle={`${activeInModule}/${module.toolCount} active`}
                  disclosure
                  expanded={isExpanded}
                  onClick={() => setExpandedModule(isExpanded ? null : module.name)}
                  trailing={
                    <PillTabs
                      value={common}
                      options={LEVEL_OPTIONS}
                      onChange={(v) => bulkLevel(module, v as ToolInfo['level'])}
                      disabled={isBusy}
                      ariaLabel={`Access level for all ${module.name} tools`}
                    />
                  }
                />
                {isExpanded && (
                  <div className="ios-sublist">
                    {module.tools.map((tool) => (
                      <ToolRow key={tool.name} tool={tool} updating={updating} onLevel={updateLevel} />
                    ))}
                  </div>
                )}
              </Fragment>
            );
          })}
        </List>
      )}
    </div>
  );
}
