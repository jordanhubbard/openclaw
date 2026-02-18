import type { Server as HttpServer } from "node:http";
import { GatewayLockError } from "../../infra/gateway-lock.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("http-listen");

// Retry budget for transient EADDRINUSE during supervised restarts.
// The previous process may still be releasing the socket after a force-exit.
const EADDRINUSE_MAX_RETRIES = 5;
const EADDRINUSE_BASE_DELAY_MS = 500;

function attemptListen(httpServer: HttpServer, port: number, bindHost: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      httpServer.off("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      httpServer.off("error", onError);
      resolve();
    };
    httpServer.once("error", onError);
    httpServer.once("listening", onListening);
    httpServer.listen(port, bindHost);
  });
}

export async function listenGatewayHttpServer(params: {
  httpServer: HttpServer;
  bindHost: string;
  port: number;
}) {
  const { httpServer, bindHost, port } = params;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= EADDRINUSE_MAX_RETRIES; attempt++) {
    try {
      await attemptListen(httpServer, port, bindHost);
      return;
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EADDRINUSE" || attempt >= EADDRINUSE_MAX_RETRIES) {
        break;
      }
      const delay = EADDRINUSE_BASE_DELAY_MS * 2 ** attempt;
      log.warn(
        `port ${port} in use, retrying in ${delay}ms (attempt ${attempt + 1}/${EADDRINUSE_MAX_RETRIES})`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  const code = (lastErr as NodeJS.ErrnoException | undefined)?.code;
  if (code === "EADDRINUSE") {
    throw new GatewayLockError(
      `another gateway instance is already listening on ws://${bindHost}:${port}`,
      lastErr,
    );
  }
  throw new GatewayLockError(
    `failed to bind gateway socket on ws://${bindHost}:${port}: ${String(lastErr)}`,
    lastErr,
  );
}
