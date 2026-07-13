import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false));

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (o) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setOpts(o);
      }),
    [],
  );

  const close = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <div className="modal-overlay" onClick={() => close(false)}>
          <div
            className="modal confirm-modal"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
          >
            {opts.title && <h3 className="confirm-title">{opts.title}</h3>}
            <p className="confirm-message">{opts.message}</p>
            <div className="confirm-actions">
              <button type="button" className="btn-ghost" onClick={() => close(false)}>
                {opts.cancelLabel ?? 'Cancel'}
              </button>
              <button
                type="button"
                className={opts.destructive ? 'btn-destructive' : ''}
                onClick={() => close(true)}
                autoFocus
              >
                {opts.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

/** Returns an async confirm(opts) → Promise<boolean>. Replaces window.confirm(). */
export function useConfirm() {
  return useContext(ConfirmContext);
}
