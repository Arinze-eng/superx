import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { logStore } from '../lib/log-store';
import { Segmented } from '../components/Segmented';
import { SearchBar } from '../components/SearchBar';
import { EmptyState } from '../components/EmptyState';
import { toast } from '../lib/toast';

type LevelFilter = 'all' | 'info' | 'warn' | 'error';

// Map a raw log level onto one of the three display buckets.
const bucket = (level: string): 'info' | 'warn' | 'error' =>
  level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';

export function Logs() {
  const logs = useSyncExternalStore((cb) => logStore.subscribe(cb), () => logStore.getLogs());
  const connected = useSyncExternalStore((cb) => logStore.subscribe(cb), () => logStore.isConnected());

  const [level, setLevel] = useState<LevelFilter>('all');
  const [query, setQuery] = useState('');
  const [autoscroll, setAutoscroll] = useState(true);
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { logStore.connect(); }, []);

  const counts = useMemo(() => {
    const c = { info: 0, warn: 0, error: 0 };
    for (const l of logs) c[bucket(l.level)]++;
    return c;
  }, [logs]);

  const q = query.trim().toLowerCase();
  const filtered = logs.filter((l) => {
    if (level !== 'all' && bucket(l.level) !== level) return false;
    if (q && !l.message.toLowerCase().includes(q)) return false;
    return true;
  });

  // Only snap to the bottom when the user is already there — never yank them
  // back up while they're reading scrolled-up history.
  useEffect(() => {
    if (autoscroll && atBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filtered.length, autoscroll, atBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
  };

  const copy = () => {
    if (filtered.length === 0) return;
    const text = filtered
      .map((l) => `[${l.level.toUpperCase()}] ${new Date(l.timestamp).toLocaleTimeString()} ${l.message}`)
      .join('\n');
    navigator.clipboard?.writeText(text).then(
      () => toast.success(`Copied ${filtered.length} lines`),
      () => toast.error('Copy failed'),
    );
  };

  return (
    <div>
      <div className="header">
        <h1>Logs</h1>
        <p>Live agent output{logs.length ? ` · ${logs.length} entries` : ''}</p>
      </div>

      <div className="logs-controls">
        <Segmented<LevelFilter>
          value={level}
          onChange={setLevel}
          ariaLabel="Filter by level"
          options={[
            { value: 'all', label: `All ${logs.length}` },
            { value: 'info', label: `Info ${counts.info}` },
            { value: 'warn', label: `Warn ${counts.warn}` },
            { value: 'error', label: `Error ${counts.error}` },
          ]}
        />
        <div style={{ flex: 1, minWidth: 180 }}>
          <SearchBar value={query} onChange={setQuery} placeholder="Search logs…" />
        </div>
        <div className="logs-autoscroll">
          <span>Auto-scroll</span>
          <label className="toggle">
            <input type="checkbox" checked={autoscroll} onChange={(e) => setAutoscroll(e.target.checked)} />
            <span className="toggle-track" />
            <span className="toggle-thumb" />
          </label>
        </div>
        <button className="btn-ghost btn-sm" onClick={copy} disabled={filtered.length === 0}>Copy</button>
        <button className="btn-ghost btn-sm" onClick={() => logStore.clear()} disabled={logs.length === 0}>Clear</button>
      </div>

      <div className="card logs-card">
        <div className="logs-statusbar">
          <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
          {connected ? 'Connected' : 'Disconnected'}
          {!atBottom && filtered.length > 0 && (
            <button className="logs-jump" onClick={() => { setAtBottom(true); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }}>
              Jump to latest ↓
            </button>
          )}
          <span className="logs-shown">{filtered.length} shown</span>
        </div>
        <div className="logs-scroll" ref={scrollRef} onScroll={onScroll}>
          {filtered.length === 0 ? (
            <EmptyState
              title={logs.length ? 'No matching logs' : 'Waiting for logs…'}
              description={
                logs.length ? 'No entries match your filters.' : 'Live output from the agent will stream here.'
              }
            />
          ) : (
            filtered.map((log, i) => (
              <div key={i} className={`log-entry ${bucket(log.level)}`}>
                <span className={`badge ${bucket(log.level)}`}>{log.level.toUpperCase()}</span>{' '}
                <span className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>{' '}
                <span className="log-msg">{log.message}</span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
