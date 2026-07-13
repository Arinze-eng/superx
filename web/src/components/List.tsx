import type { ReactNode } from 'react';

export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`ios-list${className ? ` ${className}` : ''}`}>{children}</div>;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span className={`ios-row-chevron${open ? ' open' : ''}`} aria-hidden="true">
      <svg width="8" height="13" viewBox="0 0 8 13" fill="none">
        <path d="M1.5 1.5 6.5 6.5 1.5 11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Show a disclosure chevron (rotates when `expanded`). */
  disclosure?: boolean;
  expanded?: boolean;
  onClick?: () => void;
  /** Inset the top separator to align under the title (when rows have a leading icon). */
  insetSeparator?: boolean;
  className?: string;
  leadingClassName?: string;
}

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  disclosure,
  expanded,
  onClick,
  insetSeparator,
  className,
  leadingClassName,
}: ListRowProps) {
  const tappable = !!onClick;
  return (
    <div
      className={`ios-row${tappable ? ' tappable' : ''}${expanded ? ' expanded' : ''}${insetSeparator ? ' inset-sep' : ''}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      {...(tappable
        ? {
            role: 'button',
            tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            },
          }
        : {})}
    >
      {leading && <div className={`ios-row-lead${leadingClassName ? ` ${leadingClassName}` : ''}`}>{leading}</div>}
      <div className="ios-row-main">
        <div className="ios-row-title">{title}</div>
        {subtitle != null && <div className="ios-row-sub">{subtitle}</div>}
      </div>
      {(trailing || disclosure) && (
        <div
          className="ios-row-trail"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {trailing}
          {disclosure && <Chevron open={!!expanded} />}
        </div>
      )}
    </div>
  );
}
