import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface MenuAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}
export type MenuEntry = MenuAction | 'separator';

interface MenuProps {
  trigger: ReactNode;
  items: MenuEntry[];
  align?: 'left' | 'right';
  triggerClassName?: string;
  ariaLabel?: string;
}

export function Menu({ trigger, items, align = 'right', triggerClassName, ariaLabel }: MenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu-anchor" ref={ref}>
      <button
        type="button"
        className={`menu-trigger${triggerClassName ? ` ${triggerClassName}` : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>
      {open && (
        <div className={`menu-pop ${align}`} role="menu">
          {items.map((item, i) =>
            item === 'separator' ? (
              <div key={`sep-${i}`} className="menu-sep" role="separator" />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`menu-item${item.destructive ? ' destructive' : ''}`}
                disabled={item.disabled}
                onClick={() => { setOpen(false); item.onClick(); }}
              >
                {item.icon && <span className="menu-item-icon">{item.icon}</span>}
                <span className="menu-item-label">{item.label}</span>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
