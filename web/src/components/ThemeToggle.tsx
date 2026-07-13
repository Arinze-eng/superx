import { useTheme } from '../hooks/useTheme';
import type { ThemeMode } from '../lib/theme';

const OPTIONS: { mode: ThemeMode; label: string; glyph: string }[] = [
  { mode: 'light', label: 'Light', glyph: '☀' },
  { mode: 'system', label: 'System', glyph: '◐' },
  { mode: 'dark', label: 'Dark', glyph: '☾' },
];

export function ThemeToggle() {
  const { mode, setMode } = useTheme();

  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      {OPTIONS.map((opt) => (
        <button
          key={opt.mode}
          type="button"
          className={`theme-toggle-btn${mode === opt.mode ? ' active' : ''}`}
          aria-pressed={mode === opt.mode}
          title={opt.label}
          onClick={() => setMode(opt.mode)}
        >
          <span aria-hidden="true">{opt.glyph}</span>
        </button>
      ))}
    </div>
  );
}
