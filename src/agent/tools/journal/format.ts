import type { JournalEntry, JournalOutcome } from "../../../memory/journal-store.js";

/** Emoji for a journal outcome (profit/loss/pending/cancelled/other). */
export function outcomeEmoji(outcome?: JournalOutcome): string {
  return outcome === "profit"
    ? "✅"
    : outcome === "loss"
      ? "❌"
      : outcome === "pending"
        ? "⏳"
        : outcome === "cancelled"
          ? "🚫"
          : "➖";
}

/** "<amount> <asset> → <amount> <asset>" for an entry, or null when no assets are set. */
export function formatAssetFlow(
  entry: Pick<JournalEntry, "asset_from" | "asset_to" | "amount_from" | "amount_to">
): string | null {
  if (!entry.asset_from && !entry.asset_to) return null;
  const fromStr = entry.asset_from
    ? `${entry.amount_from?.toFixed(4) ?? "?"} ${entry.asset_from}`
    : "—";
  const toStr = entry.asset_to ? `${entry.amount_to?.toFixed(4) ?? "?"} ${entry.asset_to}` : "—";
  return `${fromStr} → ${toStr}`;
}

/** Short display form of a tx hash: first 16 chars + ellipsis, in backticks. */
export function formatTxHash(hash: string): string {
  return `\`${hash.slice(0, 16)}...\``;
}
