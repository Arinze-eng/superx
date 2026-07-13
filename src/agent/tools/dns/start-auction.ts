import { Type } from "@sinclair/typebox";
import type { Tool, ToolExecutor, ToolResult } from "../types.js";
import { loadWallet, getCachedTonClient } from "../../../ton/wallet-service.js";
import { toNano, internal, beginCell } from "@ton/ton";
import { Address } from "@ton/core";
import { getErrorMessage } from "../../../utils/errors.js";
import { createLogger } from "../../../utils/logger.js";
import { withTxLock } from "../../../ton/tx-lock.js";
import { openWallet } from "../../../ton/wallet-open.js";
import { sendWalletTx, tonExplorerTxUrl } from "../../../ton/confirm.js";

const log = createLogger("Tools");

const DNS_COLLECTION = "EQC3dNlesgVD8YbAazcauIrXBPfiVhMMr5YYk2in0Mtsz0Bz";
interface DnsStartAuctionParams {
  domain: string;
  amount: number;
}
export const dnsStartAuctionTool: Tool = {
  name: "dns_start_auction",
  description:
    "Start an auction for an unminted .ton domain. Amount must meet minimum price for domain length.",
  parameters: Type.Object({
    domain: Type.String({
      description: "Domain name to mint (without .ton extension, 4-126 chars)",
    }),
    amount: Type.Number({
      description:
        "Bid amount in TON (must meet minimum: ~100 TON for 4 chars, ~1 TON for 11+ chars)",
      minimum: 1,
    }),
  }),
};
export const dnsStartAuctionExecutor: ToolExecutor<DnsStartAuctionParams> = async (
  params,
  _context
): Promise<ToolResult> => {
  try {
    let { domain } = params;
    const { amount } = params;

    // Normalize and validate domain
    domain = domain.toLowerCase().replace(/\.ton$/, "");

    if (domain.length < 4 || domain.length > 126) {
      return {
        success: false,
        error: "Domain must be 4-126 characters long",
      };
    }

    if (!/^[a-z0-9-]+$/.test(domain)) {
      return {
        success: false,
        error: "Domain can only contain lowercase letters, numbers, and hyphens",
      };
    }

    const walletData = loadWallet();
    if (!walletData) {
      return {
        success: false,
        error: "Wallet not initialized. Contact admin to generate wallet.",
      };
    }

    const client = await getCachedTonClient();
    const opened = await openWallet(client);
    if (!opened) {
      return { success: false, error: "Wallet key derivation failed." };
    }
    const { keyPair, contract } = opened;

    const sent = await withTxLock(async () => {
      // Build message body: op=0, domain as UTF-8 string
      const body = beginCell()
        .storeUint(0, 32) // op = 0
        .storeStringTail(domain) // domain without .ton
        .endCell();

      return sendWalletTx(client, contract, {
        secretKey: keyPair.secretKey,
        messages: [
          internal({
            to: Address.parse(DNS_COLLECTION),
            value: toNano(amount),
            body,
            bounce: true,
          }),
        ],
      });
    });

    if (!sent) {
      return { success: false, error: "Auction start failed or could not be confirmed on-chain." };
    }

    return {
      success: true,
      data: {
        domain: `${domain}.ton`,
        amount: `${amount} TON`,
        collection: DNS_COLLECTION,
        from: walletData.address,
        txHash: sent.hash,
        message: `Auction started for ${domain}.ton with ${amount} TON — confirmed on-chain\n  From: ${walletData.address}\n  Collection: ${DNS_COLLECTION}\n  tx ${sent.hash}\n  ${tonExplorerTxUrl(sent.hash)}`,
      },
    };
  } catch (error) {
    log.error({ err: error }, "Error in dns_start_auction");
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
};
