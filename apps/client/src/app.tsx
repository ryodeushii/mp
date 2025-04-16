import { consoleLoggerHandler, Logger } from "@mp/logger";
import { AuthContext, createAuthClient } from "@mp/auth/client";
import { ErrorFallbackContext } from "@mp/ui";
import { RouterProvider } from "@tanstack/solid-router";
import { TanStackRouterDevtools } from "@tanstack/solid-router-devtools";
import { registerSyncExtensions } from "@mp/server";
import { GameRPCSliceApiContext } from "@mp/game/client";
import { WebSocket } from "@mp/ws/client";
import { createClientRouter } from "./integrations/router/router";
import { env } from "./env";
import {
  createRPCClient,
  RPCClientContext,
  SocketContext,
} from "./integrations/rpc";
import { LoggerContext } from "./logger";

// This is effectively the composition root of the application.
// It's okay to define instances in the top level here, but do not export them.
// They should be passed down to the solidjs tree via context.
// We initialize these here because they have significantly large 3rd party dependencies,
// and since App.tsx is lazy loaded, this helps with initial load time.

registerSyncExtensions();

const socket = new WebSocket(env.wsUrl);
const auth = createAuthClient(env.auth);
const rpc = createRPCClient(socket);
const router = createClientRouter();
const logger = new Logger();

logger.subscribe(consoleLoggerHandler(console));
socket.addEventListener("error", logger.error);
void auth.refresh();

// eslint-disable-next-line unicorn/prefer-top-level-await
void import("./integrations/faro").then((faro) =>
  faro.init(logger, auth.identity),
);

export default function App() {
  return (
    <>
      <LoggerContext.Provider value={logger}>
        <ErrorFallbackContext.Provider value={{ handleError: logger.error }}>
          <AuthContext.Provider value={auth}>
            <SocketContext.Provider value={socket}>
              <RPCClientContext.Provider value={rpc}>
                <GameRPCSliceApiContext.Provider value={rpc}>
                  <RouterProvider router={router} />
                  <TanStackRouterDevtools router={router} />
                </GameRPCSliceApiContext.Provider>
              </RPCClientContext.Provider>
            </SocketContext.Provider>
          </AuthContext.Provider>
        </ErrorFallbackContext.Provider>
      </LoggerContext.Provider>
    </>
  );
}
