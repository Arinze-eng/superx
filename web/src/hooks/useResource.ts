import { useState, useEffect, useCallback, useRef, type DependencyList } from 'react';
import { errMsg } from '../lib/utils';

export interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Triggers a re-fetch; returns a Promise that resolves when the fetch settles. */
  reload: () => Promise<void>;
  setError: (msg: string | null) => void;
}

/**
 * Encapsulates the repeated load/loading/error state machine:
 *   useState(true) + useState<string|null>(null) + try/catch/finally + useEffect.
 *
 * @param fetcher  Async function that returns the data.
 * @param deps     Dependency list — when they change the data is re-fetched automatically.
 */
export function useResource<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList,
): ResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Increment to trigger a manual reload without changing external deps.
  const [tick, setTick] = useState(0);

  // Keep fetcher stable across renders via ref so the effect dep array stays clean.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Cancellation token: each fetch cycle gets a unique object; stale fetches are ignored.
  const cancelRef = useRef<object>({});

  useEffect(() => {
    const token = {};
    cancelRef.current = token;
    setLoading(true);
    setError(null);
    fetcherRef.current()
      .then((result) => {
        if (cancelRef.current === token) { setData(result); setLoading(false); }
      })
      .catch((err: unknown) => {
        if (cancelRef.current === token) { setError(errMsg(err)); setLoading(false); }
      });
    return () => { cancelRef.current = {}; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  /**
   * Imperatively re-fetch and return a Promise that settles when done.
   * Safe to use as a `useToolManager` reload callback.
   */
  const reload = useCallback((): Promise<void> => {
    setTick((n) => n + 1);
    // Run the fetcher directly so callers that await reload() get fresh data.
    setLoading(true);
    setError(null);
    return fetcherRef.current()
      .then((result) => { setData(result); setLoading(false); })
      .catch((err: unknown) => { setError(errMsg(err)); setLoading(false); });
  }, []);

  return { data, loading, error, reload, setError };
}
