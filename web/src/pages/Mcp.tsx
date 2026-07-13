import { useState, Fragment } from 'react';
import { api, McpServerInfo } from '../lib/api';
import { errMsg } from '../lib/utils';
import { List, ListRow } from '../components/List';
import { useResource } from '../hooks/useResource';
import { RefreshButton } from '../components/RefreshButton';
import { Alert } from '../components/Alert';
import { SkeletonRows } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { toast } from '../lib/toast';
import { useConfirm } from '../components/ConfirmDialog';

function PlugIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 2v6M15 2v6M7 8h10v3a5 5 0 0 1-10 0V8ZM12 16v6" />
    </svg>
  );
}

export function Mcp() {
  const confirm = useConfirm();
  const { data: servers, loading, error, reload, setError } = useResource<McpServerInfo[]>(
    () => api.getMcpServers().then((r) => r.data),
    [],
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [addPkg, setAddPkg] = useState('');
  const [addArgs, setAddArgs] = useState('');
  const [addName, setAddName] = useState('');
  const [envPairs, setEnvPairs] = useState<{ key: string; value: string; id: string }[]>([]);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const toggleExpand = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const handleAdd = async () => {
    if (!addPkg.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const args = addArgs.trim() ? addArgs.trim().split(/\s+/) : undefined;
      const isUrl = addPkg.startsWith('http://') || addPkg.startsWith('https://');
      const env: Record<string, string> = {};
      for (const pair of envPairs) {
        if (pair.key.trim()) env[pair.key.trim()] = pair.value;
      }
      const res = await api.addMcpServer({
        ...(isUrl ? { url: addPkg.trim() } : { package: addPkg.trim() }),
        name: addName.trim() || undefined,
        args: isUrl ? undefined : args,
        env: Object.keys(env).length > 0 ? env : undefined,
      });
      toast.success(res.data.message);
      setAddPkg('');
      setAddArgs('');
      setAddName('');
      setEnvPairs([]);
      setShowAdd(false);
      reload();
    } catch (err) {
      setError(errMsg(err));
      toast.error(errMsg(err));
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (name: string) => {
    if (!(await confirm({ message: `Remove MCP server "${name}"?`, destructive: true, confirmLabel: 'Remove' }))) return;
    setRemoving(name);
    setError(null);
    try {
      await api.removeMcpServer(name);
      toast.success('Server removed');
      reload();
    } catch (err) {
      setError(errMsg(err));
      toast.error(errMsg(err));
    } finally {
      setRemoving(null);
    }
  };

  const allServers = servers ?? [];
  const connectedCount = allServers.filter((s) => s.connected).length;
  const toolTotal = allServers.reduce((sum, s) => sum + s.toolCount, 0);

  return (
    <div>
      <div className="header">
        <h1>MCP Servers</h1>
        <p>External tool servers connected via Model Context Protocol</p>
      </div>

      {error && <Alert type="error" message={error} onDismiss={() => setError(null)} style={{ marginBottom: '14px' }} />}

      {/* Controls */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px' }}>
        <span style={{ flex: 1, fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>
          {allServers.length > 0
            ? `${connectedCount}/${allServers.length} connected · ${toolTotal} tools`
            : 'No servers configured'}
        </span>
        <RefreshButton onRefresh={reload} />
        <button className="btn-sm" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? 'Cancel' : '+ Add Server'}
        </button>
      </div>

      {showAdd && (
        <div className="card mcp-add">
          <div className="section-title">Add MCP Server</div>
          <div className="field">
            <label className="field-label">Package or URL *</label>
            <input
              type="text"
              value={addPkg}
              onChange={(e) => setAddPkg(e.target.value)}
              placeholder="@modelcontextprotocol/server-filesystem  or  http://localhost:3001/mcp"
              style={{ width: '100%' }}
            />
          </div>
          <div className="mcp-add-grid">
            <div className="field">
              <label className="field-label">Arguments (space-separated)</label>
              <input type="text" value={addArgs} onChange={(e) => setAddArgs(e.target.value)} placeholder="/tmp /home/user/docs" style={{ width: '100%' }} />
            </div>
            <div className="field">
              <label className="field-label">Name (auto-derived if empty)</label>
              <input type="text" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="filesystem" style={{ width: '100%' }} />
            </div>
          </div>
          <div className="field">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <label className="field-label" style={{ margin: 0 }}>Environment Variables</label>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setEnvPairs([...envPairs, { key: '', value: '', id: crypto.randomUUID() }])}>
                + Add
              </button>
            </div>
            {envPairs.map((pair, i) => (
              <div key={pair.id} className="mcp-env-row">
                <input
                  type="text"
                  value={pair.key}
                  onChange={(e) => { const next = [...envPairs]; next[i] = { ...next[i], key: e.target.value }; setEnvPairs(next); }}
                  placeholder="BRAVE_API_KEY"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)' }}
                />
                <input
                  type="password"
                  value={pair.value}
                  onChange={(e) => { const next = [...envPairs]; next[i] = { ...next[i], value: e.target.value }; setEnvPairs(next); }}
                  placeholder="sk-xxx…"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-xs)' }}
                />
                <button type="button" className="chip-remove" onClick={() => setEnvPairs(envPairs.filter((_, j) => j !== i))} aria-label="Remove variable">&#x2715;</button>
              </div>
            ))}
          </div>
          <div className="mcp-add-actions">
            <span className="mcp-add-hint">Saved to config.yaml · restart teleton to connect</span>
            <button className="btn-ghost btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn-sm" onClick={handleAdd} disabled={adding || !addPkg.trim()}>
              {adding ? 'Adding…' : 'Add Server'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonRows />
      ) : allServers.length === 0 ? (
        !showAdd && (
          <div className="card" style={{ padding: 0 }}>
            <EmptyState
              title="No MCP servers configured"
              description="Add one above, or via CLI: teleton mcp add @modelcontextprotocol/server-filesystem /tmp"
            />
          </div>
        )
      ) : (
        <List>
          {allServers.map((s) => {
            const isOpen = expanded.has(s.name);
            return (
              <Fragment key={s.name}>
                <ListRow
                  className={`mcp-${s.connected ? 'on' : 'off'}${s.enabled ? '' : ' dimmed'}`}
                  leading={<PlugIcon />}
                  title={
                    <span className="mcp-title">
                      {s.name}
                      <span className="badge">{s.type}</span>
                      {s.scope !== 'always' && <span className="badge">{s.scope}</span>}
                      {!s.enabled && <span className="badge">disabled</span>}
                    </span>
                  }
                  subtitle={s.target}
                  trailing={s.toolCount > 0 ? <span className="badge count">{s.toolCount} tools</span> : undefined}
                  disclosure
                  expanded={isOpen}
                  onClick={() => toggleExpand(s.name)}
                />
                {isOpen && (
                  <div className="ios-sublist mcp-detail">
                    <div className={`mcp-status ${s.connected ? 'on' : 'off'}`}>
                      <span className="mcp-dot" />
                      {s.connected ? 'Connected' : 'Disconnected'}
                    </div>
                    {s.envKeys.length > 0 && (
                      <div className="mcp-chips">
                        {s.envKeys.map((k) => <span key={k} className="chip chip-mono">{k}=••••</span>)}
                      </div>
                    )}
                    {s.tools.length > 0 && (
                      <div className="mcp-chips">
                        {s.tools.map((t) => <span key={t} className="chip chip-mono">{t}</span>)}
                      </div>
                    )}
                    <div className="mcp-detail-actions">
                      <button className="btn-danger btn-sm" onClick={() => handleRemove(s.name)} disabled={removing === s.name}>
                        {removing === s.name ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
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
