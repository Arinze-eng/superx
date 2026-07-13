import { useState, useEffect, Fragment } from 'react';
import { api, MemorySourceFile, MemoryChunk, SearchResult } from '../lib/api';
import { formatDate, errMsg } from '../lib/utils';
import { SearchBar } from '../components/SearchBar';
import { List, ListRow } from '../components/List';
import { CodeBlock } from '../components/CodeBlock';
import { useResource } from '../hooks/useResource';
import { RefreshButton } from '../components/RefreshButton';
import { Alert } from '../components/Alert';
import { SkeletonRows } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';

export function Memory() {
  const [filter, setFilter] = useState('');

  const { data: sources, loading, error, reload, setError } = useResource<MemorySourceFile[]>(
    () => api.getMemorySources().then((r) => r.data ?? []),
    [],
  );

  // Expanded source state
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [chunks, setChunks] = useState<MemoryChunk[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);

  // Semantic search state (wired to GET /memory/search)
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const query = filter.trim();

  // Debounced semantic search across indexed knowledge (hybrid vector + keyword).
  useEffect(() => {
    if (!query) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.searchKnowledge(query);
        if (!cancelled) setResults(res.data ?? []);
      } catch (err) {
        if (!cancelled) setError(errMsg(err));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const toggleSource = async (sourceKey: string) => {
    if (expandedSource === sourceKey) {
      setExpandedSource(null);
      setChunks([]);
      return;
    }
    setExpandedSource(sourceKey);
    setChunksLoading(true);
    try {
      const res = await api.getSourceChunks(sourceKey);
      setChunks(res.data ?? []);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setChunksLoading(false);
    }
  };

  const allSources = sources ?? [];
  const totalChunks = allSources.reduce((sum, s) => sum + s.entryCount, 0);

  return (
    <div>
      <div className="header">
        <h1>Memory</h1>
        <p>
          {allSources.length} {allSources.length === 1 ? 'source' : 'sources'} · {totalChunks} chunks indexed
        </p>
      </div>

      {error && (
        <Alert type="error" message={error} onDismiss={() => setError(null)} style={{ marginBottom: '14px' }} />
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px' }}>
        <div style={{ flex: 1 }}>
          <SearchBar value={filter} onChange={setFilter} placeholder="Search memory content…" />
        </div>
        <RefreshButton onRefresh={reload} />
      </div>

      {query ? (
        /* ── Semantic search results ── */
        searching ? (
          <SkeletonRows />
        ) : results.length === 0 ? (
          <div className="card" style={{ padding: 0 }}>
            <EmptyState
              title="No results"
              description={`No matches for "${query}".`}
              action={<button className="btn-ghost btn-sm" onClick={() => setFilter('')}>Clear search</button>}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {results.map((r) => (
              <CodeBlock
                key={r.id}
                header={
                  <>
                    <span style={{ wordBreak: 'break-all' }}>{r.source}</span>
                    <span className="badge count" style={{ flexShrink: 0 }}>score {r.score.toFixed(3)}</span>
                  </>
                }
              >
                {r.text}
              </CodeBlock>
            ))}
          </div>
        )
      ) : loading ? (
        <SkeletonRows />
      ) : allSources.length === 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <EmptyState title="No memory files indexed" description="Indexed knowledge sources will appear here once content is added." />
        </div>
      ) : (
        /* ── Sources list ── */
        <List>
          {allSources.map((src) => {
            const isExpanded = expandedSource === src.source;
            return (
              <Fragment key={src.source}>
                <ListRow
                  leading={src.source.charAt(0).toUpperCase()}
                  title={src.source}
                  subtitle={`${src.entryCount} ${src.entryCount === 1 ? 'chunk' : 'chunks'} · ${formatDate(src.lastUpdated, 1000)}`}
                  disclosure
                  expanded={isExpanded}
                  onClick={() => toggleSource(src.source)}
                />
                {isExpanded && (
                  <div className="ios-sublist" style={{ padding: '10px 14px 14px' }}>
                    {chunksLoading ? (
                      <SkeletonRows rows={3} />
                    ) : chunks.length === 0 ? (
                      <div style={{ padding: '8px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 'var(--font-sm)' }}>
                        No chunks
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {chunks.map((chunk) => (
                          <CodeBlock
                            key={chunk.id}
                            resizable
                            header={
                              <span>
                                {chunk.startLine != null && chunk.endLine != null && (
                                  <span>Lines {chunk.startLine}–{chunk.endLine} · </span>
                                )}
                                {formatDate(chunk.updatedAt, 1000)}
                              </span>
                            }
                          >
                            {chunk.text}
                          </CodeBlock>
                        ))}
                      </div>
                    )}
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
