export interface PillTabOption<T extends string> {
  value: T;
  label: string;
}

interface PillTabsProps<T extends string> {
  value: T;
  options: PillTabOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

/** Telegram-folders-style horizontal pill tabs: selected = filled pill, rest = plain text. */
export function PillTabs<T extends string>({ value, options, onChange, disabled, ariaLabel }: PillTabsProps<T>) {
  return (
    <div className="pill-tabs" role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          className={`pill-tab${value === opt.value ? ' active' : ''}`}
          disabled={disabled}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
