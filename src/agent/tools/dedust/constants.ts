/**
 * DeDust DEX constants
 */

// Factory address + gas live in the neutral src/ton/dex-constants.ts (shared with
// the SDK without a sdk -> agent inversion); re-exported here for the dedust tools.
export {
  STONFI_PTON_ADDRESS as NATIVE_TON_ADDRESS,
  DEDUST_FACTORY_MAINNET,
  DEDUST_GAS,
} from "../../../ton/dex-constants.js";

// DeDust API URL
export const DEDUST_API_URL = "https://api.dedust.io/v2";
