import type { RootRouter } from "@mp/server";
import type { SolidRPCInvoker } from "@mp/rpc";
import { BinaryRPCTransmitter, createSolidRPCInvoker } from "@mp/rpc";
import { createContext, onCleanup, useContext } from "solid-js";

export type RPCClient = SolidRPCInvoker<RootRouter>;

export function createRPCClient(socket: WebSocket): RPCClient {
  const transmitter = new BinaryRPCTransmitter((data) => socket.send(data));
  socket.addEventListener("message", transmitter.handleMessageEvent);
  onCleanup(() =>
    socket.removeEventListener("message", transmitter.handleMessageEvent),
  );
  return createSolidRPCInvoker<RootRouter>(transmitter);
}

export function useRPC() {
  return useContext(RPCClientContext);
}

export const RPCClientContext = createContext<RPCClient>(
  new Proxy({} as RPCClient, {
    get: () => {
      throw new Error("RPCClientContext must be provided");
    },
  }),
);

export const SocketContext = createContext<WebSocket>(
  new Proxy({} as WebSocket, {
    get: () => {
      throw new Error("SocketContext must be provided");
    },
  }),
);
