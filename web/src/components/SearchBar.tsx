interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/** Full-width iOS-style search field with leading magnifier and clear button. */
export function SearchBar({ value, onChange, placeholder = 'Search' }: SearchBarProps) {
  return (
    <div className="ios-search">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M11 11 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {value && (
        <button type="button" className="ios-search-clear" aria-label="Clear search" onClick={() => onChange('')}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <circle cx="8" cy="8" r="8" />
            <path d="M5.5 5.5 10.5 10.5M10.5 5.5 5.5 10.5" stroke="var(--bg-secondary)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
