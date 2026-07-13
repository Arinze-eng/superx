import { WalletContractV5R1, type TonClient, type OpenedContract } from "@ton/ton";
import { getKeyPair, getCachedTonClient } from "./wallet-service.js";

type WalletV5R1 = ReturnType<typeof WalletContractV5R1.create>;

/** Opened V5R1 wallet context shared by the on-chain write tools. */
export interface OpenedWallet {
  keyPair: NonNullable<Awaited<ReturnType<typeof getKeyPair>>>;
  wallet: WalletV5R1;
  contract: OpenedContract<WalletV5R1>;
}

/**
 * Provision the agent's V5R1 wallet: derive the key pair, build the contract and
 * open it on a TON client. Returns `null` when no key pair can be derived, so each
 * tool emits its own standard error result.
 *
 * Pass an existing `tonClient` (e.g. one already used for a DEX factory/router) to
 * open the wallet on the same client; otherwise the cached client is used.
 *
 * Wallet provisioning ONLY — callers keep their own `withTxLock`/seqno handling and
 * transactional body unchanged.
 */
export async function openWallet(tonClient?: TonClient): Promise<OpenedWallet | null> {
  const keyPair = await getKeyPair();
  if (!keyPair) return null;

  const wallet = WalletContractV5R1.create({
    workchain: 0,
    publicKey: keyPair.publicKey,
  });
  const client = tonClient ?? (await getCachedTonClient());
  const contract = client.open(wallet);

  return { keyPair, wallet, contract };
}
