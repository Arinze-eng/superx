/** Extract a human message from an unknown thrown value. */
export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function formatDate(input: string | number | null | undefined, epochScale = 1): string {
  if (input == null) return '\u2014';
  const date = typeof input === 'number' ? new Date(input * epochScale) : new Date(input);
  return date.toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Compact relative time from a unix-seconds epoch: now, 5m, 3h, 2d, else date. */
export function timeAgo(epochSeconds: number | null | undefined): string {
  if (epochSeconds == null) return '—';
  const diff = Date.now() / 1000 - epochSeconds;
  if (diff < 45) return 'now';
  if (diff < 3600) return `${Math.round(diff / 60)}m`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h`;
  if (diff < 604800) return `${Math.round(diff / 86400)}d`;
  return formatDate(epochSeconds, 1000);
}

export function formatDateTime(input: string | number | null | undefined, epochScale = 1): string {
  if (input == null) return '\u2014';
  const date = typeof input === 'number' ? new Date(input * epochScale) : new Date(input);
  return date.toLocaleString('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
