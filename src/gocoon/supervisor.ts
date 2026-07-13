import { execFileSync } from "child_process";
import { type ChildProcess, spawn } from "child_process";
import { createLogger } from "../utils/logger.js";
import { getErrorMessage } from "../utils/errors.js";
import { runnerBin } from "./paths.js";

const log = createLogger("gocoon");

export interface SupervisorOptions {
  configPath: string;
  healthUrl: string;
  startGraceMs?: number;
  verbosity?: number;
  backoffCapMs?: number;
  onLog?: (line: string) => void;
}

const READY_PROBE_TIMEOUT_MS = 2_000;
const READY_POLL_INTERVAL_MS = 250;
const KILL_GRACE_MS = 5_000;
const MAX_RESTART_FAILURES = 5;

// Spawns gocoon-runner, waits for the health URL, then auto-restarts on crash
// with exponential backoff until stop() is called.
export class GocoonSupervisor {
  private child: ChildProcess | null = null;
  private stopped = false;
  private runningFlag = false;
  private failures = 0;
  private backoffMs = 1_000;

  private readonly configPath: string;
  private readonly healthUrl: string;
  private readonly startGraceMs: number;
  private readonly verbosity: number;
  private readonly backoffCapMs: number;
  private readonly onLog: (line: string) => void;

  constructor(opts: SupervisorOptions) {
    this.configPath = opts.configPath;
    this.healthUrl = opts.healthUrl;
    this.startGraceMs = opts.startGraceMs ?? 30_000;
    this.verbosity = opts.verbosity ?? 0;
    this.backoffCapMs = opts.backoffCapMs ?? 60_000;
    this.onLog = opts.onLog ?? ((line) => log.debug(line));
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.failures = 0;
    this.backoffMs = 1_000;
    this.spawnChild();
    try {
      await waitReady(this.healthUrl, this.startGraceMs);
    } catch (err) {
      this.stopped = true; // prevent the exit handler from respawning
      this.killChild();
      throw new Error(`gocoon-runner did not become healthy: ${getErrorMessage(err)}`);
    }
    log.info(`gocoon-runner ready (pid ${this.child?.pid ?? "?"})`);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.killChild();
  }

  isRunning(): boolean {
    return this.runningFlag;
  }

  private spawnChild(): void {
    const args = ["--config", this.configPath];
    if (this.verbosity > 0) args.push(`-v${this.verbosity}`);
    const child = spawn(runnerBin(), args, { detached: true, stdio: ["ignore", "pipe", "pipe"] });
    this.child = child;
    this.runningFlag = true;
    log.info(`gocoon-runner started (pid ${child.pid ?? "?"})`);
    const onData = (buf: Buffer): void => {
      const line = buf.toString().trimEnd();
      if (line) this.onLog(line);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", (err) => log.error(`gocoon-runner process error: ${getErrorMessage(err)}`));
    child.on("exit", (code, signal) => this.onChildExit(code, signal));
  }

  private onChildExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.runningFlag = false;
    if (this.stopped) {
      log.info("gocoon-runner stopped");
      return;
    }
    log.warn(
      `gocoon-runner exited (code=${code ?? "null"} signal=${signal ?? "null"}); restarting in ${this.backoffMs}ms`
    );
    setTimeout(() => void this.restart(), this.backoffMs);
  }

  private async restart(): Promise<void> {
    if (this.stopped) return;
    try {
      this.spawnChild();
      await waitReady(this.healthUrl, this.startGraceMs);
      this.failures = 0;
      this.backoffMs = 1_000;
      log.info("gocoon-runner recovered");
    } catch (err) {
      this.failures += 1;
      this.backoffMs = Math.min(this.backoffMs * 2, this.backoffCapMs);
      if (this.failures >= MAX_RESTART_FAILURES) {
        this.stopped = true;
        this.killChild();
        log.error(`gocoon-runner failed ${this.failures} times, giving up`);
        return;
      }
      log.error(
        `gocoon-runner restart unhealthy (${this.failures}/${MAX_RESTART_FAILURES}): ${getErrorMessage(err)}`
      );
      this.killChild(); // its exit event reschedules the next restart
    }
  }

  private killChild(): void {
    const child = this.child;
    this.child = null;
    if (child?.pid != null) killProcessGroup(child.pid);
  }
}

// SIGTERM the whole process group, then SIGKILL after graceMs. taskkill on Windows.
export function killProcessGroup(pid: number, graceMs = KILL_GRACE_MS): void {
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      /* gone */
    }
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
    setTimeout(() => {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        /* gone */
      }
    }, graceMs);
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* gone */
    }
  }
}

export async function waitReady(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(READY_PROBE_TIMEOUT_MS) });
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(READY_POLL_INTERVAL_MS);
  }
  throw new Error(`health ${url} not ready within ${timeoutMs}ms`);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
