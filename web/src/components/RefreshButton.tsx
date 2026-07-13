import { useState } from 'react';

interface RefreshButtonProps {
  /** May return a promise — the icon spins until it resolves (min 500ms). */
  onRefresh: () => void | Promise<unknown>;
  disabled?: boolean;
}

/** Unified refresh control: a circular icon button that spins while refreshing. */
export function RefreshButton({ onRefresh, disabled }: RefreshButtonProps) {
  const [spinning, setSpinning] = useState(false);

  const handle = async () => {
    if (spinning) return;
    setSpinning(true);
    try {
      await onRefresh();
    } catch {
      /* errors are surfaced by the caller's own handling */
    } finally {
      window.setTimeout(() => setSpinning(false), 500);
    }
  };

  return (
    <button
      type="button"
      className="refresh-btn"
      onClick={handle}
      disabled={disabled}
      aria-label="Refresh"
      title="Refresh"
    >
      <svg
        className={spinning ? 'spin' : ''}
        width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      >
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    </button>
  );
}
