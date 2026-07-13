import { serve, type ServerType } from "@hono/node-server";
import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

type ServeOptions = Parameters<typeof serve>[0];

export interface StartHonoServerOptions {
  /** Hono `app.fetch` callback. */
  fetch: ServeOptions["fetch"];
  /** Port to listen on. */
  port: number;
  /** Optional bind hostname (WebUI/Setup pass this). */
  hostname?: string;
  /** Optional custom server factory (API passes the HTTPS `createServer`). */
  createServer?: ServeOptions["createServer"];
  /** Optional server options (API passes the TLS cert/key). */
  serverOptions?: ServeOptions["serverOptions"];
  /** Optional cap on concurrent connections (API sets 20; WebUI/Setup leave unset). */
  maxConnections?: number;
  /** Invoked once the server is listening, with the resolved address info. */
  onListen?: (info: AddressInfo) => void;
}

/**
 * Start a `@hono/node-server` instance and resolve once it is listening.
 *
 * Encapsulates the shared lifecycle for the API, WebUI and Setup servers:
 * `serve()`, the `'error'` → reject handler, the optional `maxConnections`
 * cap, and the `onListen` callback. Divergent options (HTTPS `createServer` +
 * `serverOptions` for the API, `hostname` for WebUI/Setup, `maxConnections`
 * only for the API) stay as explicit parameters so behavior is unchanged.
 */
export function startHonoServer(options: StartHonoServerOptions): Promise<ServerType> {
  return new Promise((resolve, reject) => {
    try {
      const server = serve(
        {
          fetch: options.fetch,
          port: options.port,
          ...(options.hostname ? { hostname: options.hostname } : {}),
          ...(options.createServer ? { createServer: options.createServer } : {}),
          ...(options.serverOptions ? { serverOptions: options.serverOptions } : {}),
        } as ServeOptions,
        (info) => {
          if (options.maxConnections !== undefined) {
            (server as HttpServer).maxConnections = options.maxConnections;
          }
          options.onListen?.(info);
          resolve(server);
        }
      );

      (server as HttpServer).on("error", (err: Error) => {
        reject(err);
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Gracefully stop a `@hono/node-server` instance: force-close keep-alive
 * connections (so we don't wait ~30s for them to drain) then close the server.
 */
export function stopHonoServer(server: ServerType): Promise<void> {
  return new Promise((resolve) => {
    (server as HttpServer).closeAllConnections();
    (server as HttpServer).close(() => resolve());
  });
}
