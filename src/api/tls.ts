import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, X509Certificate } from "node:crypto";
import { generate } from "selfsigned";
import { createLogger } from "../utils/logger.js";

const log = createLogger("TLS");

export interface TlsCert {
  cert: string;
  key: string;
  fingerprint: string;
}

function computeFingerprint(certPem: string): string {
  const x509 = new X509Certificate(certPem);
  const der = x509.raw;
  return createHash("sha256").update(der).digest("hex");
}

function isCertValid(certPem: string): boolean {
  try {
    const x509 = new X509Certificate(certPem);
    const now = new Date();
    return now >= new Date(x509.validFrom) && now <= new Date(x509.validTo);
  } catch {
    return false;
  }
}

export async function ensureTlsCert(dataDir: string): Promise<TlsCert> {
  const certPath = join(dataDir, "api-cert.pem");
  const keyPath = join(dataDir, "api-key.pem");

  // Try loading existing cert
  if (existsSync(certPath) && existsSync(keyPath)) {
    const cert = readFileSync(certPath, "utf-8");
    const key = readFileSync(keyPath, "utf-8");

    if (isCertValid(cert)) {
      const fingerprint = computeFingerprint(cert);
      log.info("Loaded existing TLS certificate");
      return { cert, key, fingerprint };
    }
    log.warn("Existing TLS certificate is expired, regenerating");
  }

  // Generate new self-signed cert
  log.info("Generating self-signed TLS certificate");

  const notBeforeDate = new Date();
  const notAfterDate = new Date();
  notAfterDate.setFullYear(notAfterDate.getFullYear() + 2);

  const pems = await generate([{ name: "commonName", value: "teleton-api" }], {
    keySize: 2048,
    algorithm: "sha256",
    notBeforeDate,
    notAfterDate,
    extensions: [
      { name: "basicConstraints", cA: false, critical: true },
      {
        name: "keyUsage",
        digitalSignature: true,
        keyEncipherment: true,
        critical: true,
      },
      { name: "extKeyUsage", serverAuth: true },
      {
        name: "subjectAltName",
        altNames: [
          { type: 2, value: "localhost" },
          { type: 7, ip: "127.0.0.1" },
          { type: 7, ip: "::1" },
        ],
      },
    ],
  });

  writeFileSync(certPath, pems.cert, { mode: 0o600 });
  writeFileSync(keyPath, pems.private, { mode: 0o600 });

  const fingerprint = computeFingerprint(pems.cert);
  log.info(`TLS certificate generated (fingerprint: ${fingerprint.slice(0, 16)}...)`);

  return { cert: pems.cert, key: pems.private, fingerprint };
}
