import { useEffect, useState } from 'react';
import {
  getStoredMode,
  resolveMode,
  setMode as applyMode,
  subscribe,
  type ResolvedTheme,
  type ThemeMode,
} from '../lib/theme';

export function useTheme() {
  const [mode, setLocalMode] = useState<ThemeMode>(getStoredMode);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveMode(getStoredMode()));

  useEffect(
    () =>
      subscribe(() => {
        const next = getStoredMode();
        setLocalMode(next);
        setResolved(resolveMode(next));
      }),
    [],
  );

  const setMode = (m: ThemeMode) => applyMode(m);
  const toggle = () => applyMode(resolved === 'dark' ? 'light' : 'dark');

  return { mode, resolved, setMode, toggle };
}
