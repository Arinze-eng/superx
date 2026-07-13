import { spawn, type ChildProcess } from "child_process";
import { rmSync } from "fs";
import { Address, fromNano, internal, SendMode } from "@ton/core";
import { createLogger } from "../utils/logger.js";
import { getErrorMessage } from "../utils/errors.js";
import { tonapiFetch } from "../constants/api-endpoints.js";
import { getCachedTonClient } from "../ton/wallet-service.js";
import { openWallet } from "../ton/wallet-open.js";
import { sendWalletTx } from "../ton/confirm.js";
import { withTxLock } from "../ton/tx-lock.js";
import { ensureGocoonBinaries } from "./installer.js";
import {
  channelInfoOnChain,
  fetchClientSC,
  gocoonInit,
  streamGocoon,
  tonToNano,
  waitFunded,
  walletInfo,
  type InitSummary,
  type WalletInfo,
} from "./cli.js";
import { killProcessGroup, waitReady } from "./supervisor.js";
import {
  GOCOON_DEFAULT_PORT,
  clientConfigPath,
  gocoonDataDir,
  runnerBaseUrl,
  runnerBin,
  walletPath,
} from "./paths.js";

const log = createLogger("gocoon");

export { gocoonInit as init, waitFunded, walletInfo, tonToNano };
export type { InitSummary, WalletInfo };

export type GocoonStage =
  | "resolve"
  | "find_channel"
  | "spawn_runner"
  | "close_channel"
  | "wait_refund"
  | "withdraw_cocoon"
  | "withdraw_agent"
  | "complete";

export type GocoonStatus = "started" | "ok" | "info" | "warn" | "skipped" | "error";

export interface GocoonProgress {
  stage: GocoonStage;
  status: GocoonStatus;
  message: string;
  at: number;
}

export type ProgressSink = (e: GocoonProgress) => void;

const REFUND_TIMEOUT_MS = 180_000;
const REFUND_MIN_DELTA_NANO = 5_000_000_000n;
const MIN_COCOON_WITHDRAW_NANO = 50_000_000n;
const AGENT_FEE_BUFFER_NANO = 10_000_000n;
// Above this leftover balance, reset refuses: we never delete the mnemonic of a
// wallet that still controls funds.
const RESET_MAX_DUST_NANO = 100_000_000n;
const COCOON_CLIENT_OPS = new Set([
  "CocoonOwnerClientRegister",
  "CocoonExtClientTopUp",
  "CocoonOwnerRequestRefund",
  "CocoonOwnerWithdraw",
]);

// Thrown by findClientSC ONLY when the wallet has no cocoon_client interaction
// on chain (no channel was ever staked). Transient/HTTP failures throw plain
// Errors instead, so callers can abort rather than mistake a lookup failure for
// "no channel" and drain the liquid wallet while leaving the stake locked.
class ChannelNotFoundError extends Error {}

// Add TON to the open channel. The runner must be active (reads client_sc from /jsonstats).
export async function topup(
  amountTon: string,
  port: number = GOCOON_DEFAULT_PORT,
  onLine?: (line: string) => void
): Promise<void> {
  const nano = tonToNano(amountTon);
  const clientSC = await fetchClientSC(port);
  log.info(`Topping up channel with ${amountTon} TON (${nano} nanoTON)`);
  await streamGocoon(["channel", "topup", "--amount", nano, "--client-sc", clientSC], onLine);
}

// Close the channel, wait for the refund, then withdraw the COCOON and agent
// wallets to destination. The runner must not be running.
export async function withdrawAll(
  destination: string,
  sink: ProgressSink = () => {},
  port: number = GOCOON_DEFAULT_PORT
): Promise<void> {
  const emit = (stage: GocoonStage, status: GocoonStatus, message: string): void =>
    sink({ stage, status, message, at: Date.now() });

  emit("resolve", "started", "Resolving destination");
  const dest = await resolveDest(destination);
  emit("resolve", "ok", `Destination: ${dest.label}`);

  if (await isRunnerUp(port)) {
    throw new Error("the gocoon runner is active; stop teleton first, then retry the withdraw");
  }

  const cocoon = await walletInfo();
  // COCOON channel ops are executed by the fund (node) wallet, not the owner
  // wallet — scan fund_address (the prior owner-address scan silently skipped
  // the close and left the stake locked).
  emit("find_channel", "started", `Looking for a channel via ${shortAddr(cocoon.fundAddress)}`);
  let clientSC: string | null = null;
  try {
    clientSC = await findClientSC(cocoon.fundAddress);
  } catch (err) {
    if (err instanceof ChannelNotFoundError) {
      emit(
        "find_channel",
        "skipped",
        "No channel was ever staked; withdrawing wallet balance only"
      );
    } else {
      // A transient lookup failure (tonapi rate-limit/5xx, network) must NOT be
      // treated as "no channel" — that would drain the liquid wallet and leave
      // the staked TON locked while reporting success. Abort so the user retries.
      emit("find_channel", "error", `Channel lookup failed: ${getErrorMessage(err)}`);
      throw new Error(
        `could not check for an open channel (${getErrorMessage(err)}); aborting so the staked TON is not left locked. Retry the withdraw.`
      );
    }
  }

  if (clientSC) {
    // Decide liveness from the channel STATE, not the account status: a
    // cooperatively-closed cocoon_client account stays "active" (it holds
    // storage TON). Re-closing a closed channel would hang the refund wait.
    const ch = await channelInfoOnChain(clientSC);
    if (!ch) {
      emit("find_channel", "error", "Could not read the channel state");
      throw new Error(
        "located a channel but could not read its state; aborting so the staked TON is not left locked. Retry the withdraw."
      );
    }
    const live = ch.stateName !== "closed" && ch.stakeNano > 0n;
    if (live) {
      emit("find_channel", "ok", "Channel located (open) — closing");
      emit("spawn_runner", "started", "Starting gocoon-runner (transient)");
      const runner = await spawnTransientRunner();
      try {
        await waitReady(`${runnerBaseUrl(port)}/jsonstats`, 30_000);
        emit("spawn_runner", "ok", "Runner ready");

        emit("close_channel", "started", "Closing channel");
        await streamGocoon([
          "channel",
          "close",
          "--client-sc",
          clientSC,
          "--url",
          runnerBaseUrl(port),
        ]);
        emit("close_channel", "ok", "Channel close transaction sent");

        emit(
          "wait_refund",
          "started",
          "Waiting for the staked TON to return (cooperative close, up to 3 min)"
        );
        const landed = await waitForRefund(REFUND_TIMEOUT_MS);
        if (!landed) {
          // The close IS on chain; the stake returns once the node co-signs or
          // via the ~12h unilateral delay. Leave the wallets untouched so a
          // later re-run sweeps everything cleanly (the re-run is idempotent).
          emit(
            "wait_refund",
            "warn",
            "Refund not received within 3 min. The channel close is on chain; the stake returns once the node co-signs or via the ~12h fallback. Re-run the withdraw later to finish."
          );
          emit(
            "complete",
            "warn",
            "Channel closed; refund pending. Re-run the withdraw later to sweep the funds (your TON is safe)."
          );
          return;
        }
        emit("wait_refund", "ok", "Refund landed on chain");
      } finally {
        if (runner.pid != null) killProcessGroup(runner.pid);
      }
    } else {
      emit("find_channel", "ok", "Channel already closed — withdrawing the remaining balance");
    }
  }

  const balance = (await walletInfo()).balanceNano;
  if (balance > MIN_COCOON_WITHDRAW_NANO) {
    emit("withdraw_cocoon", "started", `Withdrawing COCOON wallet to ${dest.label}`);
    await streamGocoon([
      "wallet",
      "withdraw",
      "--wallet",
      walletPath(),
      "--config",
      clientConfigPath(),
      "--to",
      dest.address.toString({ bounceable: false }),
      "--timeout",
      "10m",
    ]);
    emit("withdraw_cocoon", "ok", "COCOON wallet withdrawn");
  } else {
    emit("withdraw_cocoon", "skipped", `COCOON wallet too low (${balance} nanoTON), skipping`);
  }

  emit("withdraw_agent", "started", `Withdrawing agent wallet to ${dest.label}`);
  await withdrawAgentWallet(dest.address, emit);

  emit("complete", "ok", `All funds sent to ${dest.label}`);
}

// Delete the local COCOON wallet + config so the next init generates a fresh
// owner/node wallet (gocoonInit reuses wallet.json when present). Binaries live
// in binDir() and are kept. Run after a full withdraw. Guard: refuses while the
// runner is up, or (without force) while the wallet still holds funds or an
// active channel exists, so we never destroy keys that still control value.
export async function resetWallet(
  opts: { force?: boolean } = {},
  port: number = GOCOON_DEFAULT_PORT
): Promise<void> {
  if (await isRunnerUp(port)) {
    throw new Error("the gocoon runner is active; stop it first, then retry the reset");
  }
  if (!opts.force) {
    let info: WalletInfo | null = null;
    try {
      info = await walletInfo();
    } catch {
      info = null; // no wallet on disk; nothing to guard
    }
    if (info) {
      if (info.balanceNano > RESET_MAX_DUST_NANO) {
        throw new Error(
          `fund wallet still holds ${info.balanceTon} TON; withdraw first (or reset with force)`
        );
      }
      if (info.fundAddress) {
        let liveChannel = false;
        try {
          const clientSC = await findClientSC(info.fundAddress);
          const ch = await channelInfoOnChain(clientSC);
          // findClientSC also returns a closed channel's contract (its account
          // stays active to hold storage TON), so check the channel state, not
          // the account status: only a not-closed channel that still holds
          // stake controls recoverable value and must block the reset.
          liveChannel = !!ch && ch.stateName !== "closed" && ch.stakeNano > 0n;
        } catch (err) {
          if (!(err instanceof ChannelNotFoundError)) {
            // Could not verify there is no live channel (transient lookup
            // failure). Refuse rather than risk deleting keys to a live stake.
            throw new Error(
              `could not verify the channel state (${getErrorMessage(err)}); refusing to reset. Retry, or reset with force if you are sure.`
            );
          }
          liveChannel = false; // ChannelNotFoundError: no channel was ever staked
        }
        if (liveChannel) {
          throw new Error("a funded channel still exists; withdraw first (or reset with force)");
        }
      }
    }
  }
  rmSync(gocoonDataDir(), { recursive: true, force: true });
}

interface ResolvedDest {
  address: Address;
  label: string;
}

// Accept a TON address or a .ton domain.
async function resolveDest(raw: string): Promise<ResolvedDest> {
  const s = raw.trim();
  if (!s) throw new Error("empty destination");
  if (s.toLowerCase().endsWith(".ton")) {
    const res = await tonapiFetch(`/dns/${encodeURIComponent(s.toLowerCase())}/resolve`);
    if (!res.ok) throw new Error(`tonapi dns resolve ${s} returned HTTP ${res.status}`);
    const j = (await res.json()) as { wallet?: { address?: string } };
    const addr = j.wallet?.address;
    if (!addr) throw new Error(`${s} has no wallet record`);
    return { address: Address.parse(addr), label: `${s} (${shortAddr(addr)})` };
  }
  try {
    return { address: Address.parse(s), label: s };
  } catch {
    throw new Error(`not a TON address or .ton domain: "${raw}"`);
  }
}

async function isRunnerUp(port: number): Promise<boolean> {
  try {
    await fetch(`${runnerBaseUrl(port)}/jsonstats`, { signal: AbortSignal.timeout(800) });
    return true;
  } catch {
    return false;
  }
}

// Find the client_sc this fund wallet interacted with on chain. Returns the
// client_sc address; throws ChannelNotFoundError if the wallet never opened a
// channel, and a plain Error for transient/HTTP failures so callers can abort
// rather than mistake a lookup failure for "no channel". Open-vs-closed liveness
// is decided by the caller via channelInfoOnChain.
async function findClientSC(walletAddr: string): Promise<string> {
  const res = await tonapiFetch(`/accounts/${encodeURIComponent(walletAddr)}/events?limit=50`);
  if (!res.ok) throw new Error(`tonapi events returned HTTP ${res.status}`);
  const j = (await res.json()) as {
    events?: {
      actions?: {
        type?: string;
        SmartContractExec?: {
          executor?: { address?: string };
          contract?: { address?: string };
          operation?: string;
        };
      }[];
    }[];
  };

  const me = normalizeRaw(walletAddr);
  let candidate: string | undefined;
  for (const event of j.events ?? []) {
    for (const action of event.actions ?? []) {
      const exec = action.SmartContractExec;
      if (action.type !== "SmartContractExec" || !exec) continue;
      if (normalizeRaw(exec.executor?.address ?? "") !== me) continue;
      if (!COCOON_CLIENT_OPS.has(exec.operation ?? "")) continue;
      candidate = exec.contract?.address;
      break;
    }
    if (candidate) break;
  }
  if (!candidate) {
    throw new ChannelNotFoundError(
      "no cocoon_client interaction found; channel may never have been staked"
    );
  }

  return Address.parse(candidate).toString({ bounceable: false });
}

// Poll the COCOON wallet balance until it grows by at least 5 TON (the refund).
// Returns true once the refund lands, false if it has not within timeoutMs (the
// caller handles the slow/unilateral path without hard-failing the withdraw).
async function waitForRefund(timeoutMs: number): Promise<boolean> {
  const baseline = (await walletInfo()).balanceNano;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(5_000);
    try {
      const now = (await walletInfo()).balanceNano;
      if (now > baseline && now - baseline >= REFUND_MIN_DELTA_NANO) return true;
    } catch {
      /* transient RPC error */
    }
  }
  return false;
}

// Send (balance - 0.01 TON) from teleton's agent wallet to dest. Skips if empty.
async function withdrawAgentWallet(
  dest: Address,
  emit: (stage: GocoonStage, status: GocoonStatus, message: string) => void
): Promise<void> {
  const client = await getCachedTonClient();
  const opened = await openWallet(client);
  if (!opened) {
    emit("withdraw_agent", "skipped", "No agent wallet on disk, skipping");
    return;
  }
  const balance = await client.getBalance(opened.contract.address);
  const send = balance - AGENT_FEE_BUFFER_NANO;
  if (send <= 0n) {
    emit("withdraw_agent", "skipped", `Agent wallet too low (${balance} nanoTON), skipping`);
    return;
  }
  const sent = await withTxLock(() =>
    sendWalletTx(client, opened.contract, {
      secretKey: opened.keyPair.secretKey,
      messages: [internal({ to: dest, value: send, bounce: false, body: "withdraw" })],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    })
  );
  if (!sent) throw new Error("agent wallet transfer was not confirmed on-chain");
  emit("withdraw_agent", "ok", `Agent wallet withdrawn (${fromNano(send)} TON sent)`);
}

async function spawnTransientRunner(): Promise<ChildProcess> {
  await ensureGocoonBinaries();
  return spawn(runnerBin(), ["--config", clientConfigPath()], { detached: true, stdio: "ignore" });
}

function normalizeRaw(s: string): string {
  try {
    const a = Address.parse(s);
    return `${a.workChain}:${a.hash.toString("hex")}`.toLowerCase();
  } catch {
    return s.toLowerCase();
  }
}

function shortAddr(s: string): string {
  return s.length > 18 ? `${s.slice(0, 8)}...${s.slice(-6)}` : s;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
