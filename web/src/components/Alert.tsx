import type { CSSProperties, ReactNode } from 'react';

interface AlertProps {
  type: 'error' | 'success';
  message: string;
  onDismiss?: () => void;
  /** Optional extra action buttons (e.g. a Retry button). */
  children?: ReactNode;
  style?: CSSProperties;
}

/**
 * Shared dismissible alert reusing existing .alert .error / .success CSS classes.
 * If onDismiss is not provided, no Dismiss button is rendered.
 */
export function Alert({ type, message, onDismiss, children, style }: AlertProps) {
  return (
    <div
      className={`alert ${type}`}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...style }}
    >
      <span>{message}</span>
      {(onDismiss || children) && (
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          {children}
          {onDismiss && (
            <button className="btn-ghost btn-sm" onClick={onDismiss}>Dismiss</button>
          )}
        </div>
      )}
    </div>
  );
}
