import type { Context } from "hono";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Locate the built web SPA directory (`dist/web`). Tries common locations
 * relative to the launch CWD first, then relative to the compiled file.
 * Returns the directory containing `index.html`, or null if none is found.
 *
 * Shared by the WebUI and Setup servers so both probe the same candidates.
 */
export function findWebDist(): string | null {
  // Try common locations relative to CWD (where teleton is launched from)
  const candidates = [
    resolve("dist/web"), // npm start / teleton start (from project root)
    resolve("web"), // fallback
  ];
  // Also try relative to the compiled file
  const __dirname = dirname(fileURLToPath(import.meta.url));
  candidates.push(
    resolve(__dirname, "web"), // dist/web when __dirname = dist/
    resolve(__dirname, "../dist/web") // when running with tsx from src/
  );

  for (const candidate of candidates) {
    if (existsSync(join(candidate, "index.html"))) {
      return candidate;
    }
  }
  return null;
}

/** Static asset MIME types served with explicit Content-Type. */
export const MIME_TYPES: Record<string, string> = {
  js: "application/javascript",
  css: "text/css",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  ico: "image/x-icon",
  json: "application/json",
  woff2: "font/woff2",
  woff: "font/woff",
};

/**
 * Build a catch-all static-file handler with SPA fallback for the given build
 * directory. Includes a path-traversal guard, immutable caching for `/assets/`,
 * and serves `index.html` for any non-file route.
 *
 * The `async` flag selects the file-read strategy: the WebUI server reads files
 * asynchronously (`readFile`), while the Setup server reads synchronously
 * (`readFileSync`) — kept behind the flag to preserve each server's behavior.
 */
export function createStaticHandler(
  webDist: string,
  options: { async: boolean }
): (c: Context) => Response | Promise<Response> {
  const indexPath = join(webDist, "index.html");

  // Read index.html fresh per request (cheap) so a web rebuild is picked up
  // without restarting the server, and serve it with no-cache so browsers
  // always revalidate and fetch the current hashed chunk references.
  const renderIndex = async (c: Context): Promise<Response> => {
    const html = options.async
      ? await readFile(indexPath, "utf-8")
      : readFileSync(indexPath, "utf-8");
    return c.html(html, 200, { "Cache-Control": "no-cache" });
  };

  return async (c: Context): Promise<Response> => {
    const filePath = resolve(join(webDist, c.req.path));
    // Prevent path traversal — resolved path must stay inside webDist
    const rel = relative(webDist, filePath);
    if (rel.startsWith("..") || resolve(filePath) !== filePath) {
      return renderIndex(c);
    }

    // Try serving the actual file
    try {
      const content = options.async ? await readFile(filePath) : readFileSync(filePath);
      const ext = filePath.split(".").pop() || "";
      if (MIME_TYPES[ext]) {
        const immutable = c.req.path.startsWith("/assets/");
        return c.body(content, 200, {
          "Content-Type": MIME_TYPES[ext],
          "Cache-Control": immutable
            ? "public, max-age=31536000, immutable"
            : "public, max-age=3600",
        });
      }
    } catch {
      // File not found — fall through to SPA
    }

    // SPA fallback: serve index.html for all non-file routes
    return renderIndex(c);
  };
}
