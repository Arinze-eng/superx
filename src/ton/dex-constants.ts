/**
 * Shared DEX constants (neutral layer, no tool/SDK dependency).
 */

/**
 * STON.fi pTON proxy address — the placeholder both STON.fi and DeDust APIs use
 * to denote raw TON. Single source; previously duplicated under two names
 * (NATIVE_TON_ADDRESS / STONFI_NATIVE_TON) across stonfi/, dedust/ and the SDK.
 */
export const STONFI_PTON_ADDRESS = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";

/** DeDust factory contract address on mainnet. */
export const DEDUST_FACTORY_MAINNET = "EQBfBWT7X2BHg9tXAxzhz2aKiNTU1tpt5NsiK0uSDW_YAJ67";

/** Gas amounts (in TON) for DeDust operations. */
export const DEDUST_GAS = {
  // TON to Jetton swap
  SWAP_TON_TO_JETTON: "0.25",
  // Jetton to any asset swap
  SWAP_JETTON_TO_ANY: "0.3",
  // Forward gas for jetton transfers
  FORWARD_GAS: "0.2",
};
