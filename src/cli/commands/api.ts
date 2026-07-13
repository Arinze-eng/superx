import { createHash, randomBytes } from "node:crypto";
import { readRawConfig, setNestedValue, writeRawConfig } from "../../config/configurable-keys.js";
import { TELETON_ROOT } from "../../workspace/paths.js";
import { ensureTlsCert } from "../../api/tls.js";

/**
 * Generate a new Management API key, hash it, and persist the hash to config.
 * The plaintext key is printed ONCE to stdout — it cannot be recovered.
 */
export async function apiRotateKeyCommand(options: { config: string }): Promise<void> {
  const key = "tltn_" + randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(key).digest("hex");

  const raw = readRawConfig(options.config);
  setNestedValue(raw, "api.key_hash", hash);
  writeRawConfig(raw, options.config);

  console.log(key);
}

/**
 * Print the TLS certificate fingerprint for the Management API.
 */
export async function apiFingerprintCommand(): Promise<void> {
  const tls = await ensureTlsCert(TELETON_ROOT);
  console.log(tls.fingerprint);
}
