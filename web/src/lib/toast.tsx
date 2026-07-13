import { useEffect, useState } from 'react';

// Lightweight toast store (react-hot-toast style) — importable anywhere, no provider.
// Mount <Toaster /> once near the app root.

export type ToastKind = 'success' | 'error' | 'info';
export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

let items: ToastItem[] = [];
const subscribers = new Set<() => void>();
let counter = 0;

function emit() {
  subscribers.forEach((cb) => cb());
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

function push(kind: ToastKind, message: string, ttl: number) {
  const id = ++counter;
  items = [...items, { id, kind, message }];
  emit();
  window.setTimeout(() => dismiss(id), ttl);
}

export const toast = {
  success: (message: string) => push('success', message, 3500),
  error: (message: string) => push('error', message, 5000),
  info: (message: string) => push('info', message, 3500),
};

export function Toaster() {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force((n) => n + 1);
    subscribers.add(cb);
    return () => {
      subscribers.delete(cb);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="toaster" role="region" aria-label="Notifications">
      {items.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.kind}`}
          role="status"
          onClick={() => dismiss(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
