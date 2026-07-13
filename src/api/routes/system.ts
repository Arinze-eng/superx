import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const API_VERSION = "1.0.0";

function readPackageVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    // Try from dist/ or src/ layout
    const candidates = [
      join(__dirname, "../../package.json"),
      join(__dirname, "../../../package.json"),
    ];
    for (const p of candidates) {
      try {
        const pkg = JSON.parse(readFileSync(p, "utf-8"));
        return pkg.version ?? "unknown";
      } catch {
        continue;
      }
    }
  } catch {
    // ignore
  }
  return "unknown";
}

const cachedVersion = readPackageVersion();

export function createSystemRoutes() {
  const app = new Hono();

  app.get("/version", (c) => {
    return c.json({
      teleton: cachedVersion,
      node: process.version,
      os: process.platform,
      arch: process.arch,
      apiVersion: API_VERSION,
    });
  });

  app.get("/info", (c) => {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    return c.json({
      cpu: {
        model: cpus[0]?.model ?? "unknown",
        cores: cpus.length,
        loadAvg: os.loadavg(),
      },
      memory: {
        total: totalMem,
        free: freeMem,
        used: totalMem - freeMem,
        heapUsed: process.memoryUsage().heapUsed,
        heapTotal: process.memoryUsage().heapTotal,
      },
      uptime: {
        process: Math.floor(process.uptime()),
        system: Math.floor(os.uptime()),
      },
    });
  });

  return app;
}
