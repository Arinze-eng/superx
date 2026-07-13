// Theme management — light / dark / system, grounded in the iOS token layer.
// Applies [data-theme="light|dark"] on <html>; the CSS in index.css does the rest.

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'teleton-theme';
const mql = () => window.matchMedia('(prefers-color-scheme: dark)');

export function getStoredMode(): ThemeMode {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

export function resolveMode(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? (mql().matches ? 'dark' : 'light') : mode;
}

function apply(mode: ThemeMode): void {
  document.documentElement.dataset.theme = resolveMode(mode);
}

// ── Subscriptions so every useTheme consumer re-renders on change ──
const subscribers = new Set<() => void>();
export function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}
function notify(): void {
  subscribers.forEach((cb) => cb());
}

// Keep in sync with the OS only while in "system" mode.
let mediaHandler: (() => void) | null = null;

export function setMode(mode: ThemeMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
  apply(mode);

  if (mediaHandler) {
    mql().removeEventListener('change', mediaHandler);
    mediaHandler = null;
  }
  if (mode === 'system') {
    mediaHandler = () => {
      apply('system');
      notify();
    };
    mql().addEventListener('change', mediaHandler);
  }
  notify();
}

// Call once, before first render, to avoid a flash of the wrong theme.
export function initTheme(): void {
  setMode(getStoredMode());
}
