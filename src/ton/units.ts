/**
 * On-chain unit conversion helpers — pure, with no asset-cache/DEX dependency.
 *
 * String-based to avoid floating-point precision loss: an off-by-one on the
 * decimals here means lost funds, so keep a single tested definition that any
 * layer (SDK, DEX tools, jetton transfers) can import without coupling to DeDust.
 */

/** Convert a human amount to on-chain integer units (10^decimals). */
export function toUnits(amount: number, decimals: number): bigint {
  const str = amount.toFixed(decimals);
  const [whole, frac = ""] = str.split(".");
  const padded = frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole + padded);
}

/** Convert on-chain integer units back to a human amount. */
export function fromUnits(units: bigint, decimals: number): number {
  const factor = 10 ** decimals;
  return Number(units) / factor;
}
