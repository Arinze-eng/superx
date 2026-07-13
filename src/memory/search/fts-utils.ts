/**
 * Shared SQLite FTS5 query helpers.
 *
 * The escape function is a security-relevant surface (prevents FTS5 syntax
 * injection); keeping a single definition avoids the escaped-character list
 * drifting between the knowledge RAG, the tool index and session search.
 */

/**
 * Escape FTS5 special characters to prevent syntax errors.
 */
export function escapeFts5Query(query: string): string {
  return query
    .replace(/["\*\-\+\(\)\:\^\~\?\.\@\#\$\%\&\!\[\]\{\}\|\\\/<>=,;'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Convert BM25 rank to normalized score.
 * FTS5 rank is negative; more negative = better match.
 */
export function bm25ToScore(rank: number): number {
  return 1 / (1 + Math.exp(rank));
}
