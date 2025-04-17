import type { RootRouter } from "@mp/server";
import type { SolidRpcInvoker } from "@mp/rpc";
import { BinaryRpcTransmitter, createSolidRpcInvoker } from "@mp/rpc";
import { createContext, onCleanup, useContext } from "solid-js";
import type { Logger } from "@mp/logger";

export type RpcClient = SolidRpcInvoker<RootRouter>;

export function createRpcClient(socket: WebSocket, logger: Logger): RpcClient {
  const transmitter = new BinaryRpcTransmitter((data) => socket.send(data));
  const handleMessage = transmitter.messageEventHandler(logger.error);
  socket.addEventListener("message", handleMessage);
  onCleanup(() => socket.removeEventListener("message", handleMessage));
  return createSolidRpcInvoker<RootRouter>(transmitter);
}

export function useRpc() {
  return useContext(RpcClientContext);
}

export const RpcClientContext = createContext<RpcClient>(
  new Proxy({} as RpcClient, {
    get: () => {
      throw new Error("RpcClientContext must be provided");
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
