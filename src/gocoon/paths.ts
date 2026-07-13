import { join } from "path";
import { TELETON_ROOT } from "../workspace/paths.js";

// Pinned release. The installer verifies the SHA-256 of this exact tag.
export const GOCOON_VERSION = "v0.2.0";
export const GOCOON_DEFAULT_PORT = 10000;

const exe = (name: string): string => (process.platform === "win32" ? `${name}.exe` : name);

export const binDir = (): string => join(TELETON_ROOT, "bin");
export const gocoonBin = (): string => join(binDir(), exe("gocoon"));
export const runnerBin = (): string => join(binDir(), exe("gocoon-runner"));
export const versionSentinel = (): string => join(binDir(), ".gocoon-version");

export const gocoonDataDir = (): string => join(TELETON_ROOT, "gocoon");
export const walletPath = (): string => join(gocoonDataDir(), "wallet.json");
export const clientConfigPath = (): string => join(gocoonDataDir(), "client-config.json");
export const tonConfigPath = (): string => join(gocoonDataDir(), "ton-config.json");

export const runnerBaseUrl = (port: number = GOCOON_DEFAULT_PORT): string =>
  `http://127.0.0.1:${port}`;
