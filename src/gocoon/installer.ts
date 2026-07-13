import { createHash } from "crypto";
import { execFileSync } from "child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { createLogger } from "../utils/logger.js";
import { fetchWithTimeout } from "../utils/fetch.js";
import { GOCOON_VERSION, binDir, gocoonBin, runnerBin, versionSentinel } from "./paths.js";

const log = createLogger("gocoon");

const REPO = "TONresistor/gocoon";
const DOWNLOAD_TIMEOUT_MS = 120_000;

interface Platform {
  os: "darwin" | "linux" | "windows";
  arch: "amd64" | "arm64";
}

export function detectPlatform(): Platform {
  const osMap: Record<string, Platform["os"]> = {
    darwin: "darwin",
    linux: "linux",
    win32: "windows",
  };
  const archMap: Record<string, Platform["arch"]> = { x64: "amd64", arm64: "arm64" };
  const os = osMap[process.platform];
  const arch = archMap[process.arch];
  if (!os || !arch) {
    throw new Error(`gocoon: unsupported platform ${process.platform}/${process.arch}`);
  }
  return { os, arch };
}

export interface GocoonBinaries {
  gocoon: string;
  runner: string;
}

function sha256File(p: string): string {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

// The sentinel is JSON { version, gocoon, runner } recording each binary's
// sha256 at install time. Legacy installs wrote a plain version string; those
// parse to null so they get re-verified (and re-downloaded) once.
function readSentinel(): { version: string; gocoon: string; runner: string } | null {
  try {
    const j = JSON.parse(readFileSync(versionSentinel(), "utf-8")) as Record<string, unknown>;
    if (
      typeof j.version === "string" &&
      typeof j.gocoon === "string" &&
      typeof j.runner === "string"
    ) {
      return { version: j.version, gocoon: j.gocoon, runner: j.runner };
    }
  } catch {
    /* missing or legacy plain-string sentinel */
  }
  return null;
}

// Cheap presence check for status display: pinned version + both files exist.
export function isInstalled(): boolean {
  const s = readSentinel();
  return !!s && s.version === GOCOON_VERSION && existsSync(gocoonBin()) && existsSync(runnerBin());
}

// Full integrity check: the on-disk binaries still match the sha256 recorded at
// install. Catches an out-of-band swap/corruption that the version string alone
// would miss, so we never launch an unverified runner against a live channel.
function binariesVerified(): boolean {
  const s = readSentinel();
  if (!s || s.version !== GOCOON_VERSION) return false;
  if (!existsSync(gocoonBin()) || !existsSync(runnerBin())) return false;
  try {
    return sha256File(gocoonBin()) === s.gocoon && sha256File(runnerBin()) === s.runner;
  } catch {
    return false;
  }
}

// Download the pinned release, verify its SHA-256, extract both binaries into
// ~/.teleton/bin. Idempotent via the version sentinel.
export async function ensureGocoonBinaries(): Promise<GocoonBinaries> {
  const out: GocoonBinaries = { gocoon: gocoonBin(), runner: runnerBin() };
  if (binariesVerified()) return out;

  const { os, arch } = detectPlatform();
  const archive = `gocoon-${GOCOON_VERSION}-${os}-${arch}.tar.gz`;
  const base = `https://github.com/${REPO}/releases/download/${GOCOON_VERSION}`;
  log.info(`Installing gocoon ${GOCOON_VERSION} (${os}/${arch})`);

  const [tar, shaLine] = await Promise.all([
    fetchBuffer(`${base}/${archive}`),
    fetchText(`${base}/${archive}.sha256`),
  ]);

  const expected = shaLine.trim().split(/\s+/)[0]?.toLowerCase();
  const actual = createHash("sha256").update(tar).digest("hex");
  if (!expected || expected !== actual) {
    throw new Error(
      `gocoon checksum mismatch for ${archive} (expected ${expected}, got ${actual})`
    );
  }

  mkdirSync(binDir(), { recursive: true });
  // Temp dir under binDir so the final rename stays on one filesystem (no EXDEV).
  const tmp = join(binDir(), `.extract-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const tarPath = join(tmp, archive);
  writeFileSync(tarPath, tar);
  try {
    execFileSync("tar", ["-xzf", tarPath, "-C", tmp], { stdio: "pipe" });
    const ext = os === "windows" ? ".exe" : "";
    for (const [name, dest] of [
      ["gocoon", out.gocoon],
      ["gocoon-runner", out.runner],
    ] as const) {
      const src = join(tmp, name + ext);
      if (!existsSync(src)) throw new Error(`gocoon: archive ${archive} is missing ${name}${ext}`);
      renameSync(src, dest);
      if (os !== "windows") chmodSync(dest, 0o755);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  writeFileSync(
    versionSentinel(),
    JSON.stringify({
      version: GOCOON_VERSION,
      gocoon: sha256File(out.gocoon),
      runner: sha256File(out.runner),
    })
  );
  log.info(`gocoon ${GOCOON_VERSION} installed`);
  return out;
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetchWithTimeout(url, { timeoutMs: DOWNLOAD_TIMEOUT_MS });
  if (!res.ok) throw new Error(`gocoon: download failed ${url} (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchText(url: string): Promise<string> {
  const res = await fetchWithTimeout(url, { timeoutMs: DOWNLOAD_TIMEOUT_MS });
  if (!res.ok) throw new Error(`gocoon: download failed ${url} (HTTP ${res.status})`);
  return res.text();
}
