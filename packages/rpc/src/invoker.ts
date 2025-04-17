import type { Branded, Result } from "@mp/std";
import { err, ok } from "@mp/std";
import type { AnyRouteRecord, AnyRpcNode, RouterNode } from "./builder";

export function createRpcInvoker<Input, Output, Context>(
  root: RouterNode<AnyRouteRecord<Context>>,
): RpcInvoker<Input, Output, Context> {
  return async function invokeRpc(call, ctx) {
    const [path, input] = call;
    const node = resolveRpcNode<Context>(root, path);
    if (!node || node.type === "router") {
      return err(new RpcInvokerError(call, "path not found"));
    }

    try {
      const output = (await node.handler({ ctx, input, mwc })) as Output;
      return ok(output);
    } catch (error) {
      return err(new RpcInvokerError<Input>(call, error));
    }
  };
}

function resolveRpcNode<Context>(
  start: AnyRpcNode,
  path: string[],
): AnyRpcNode<Context> | undefined {
  let node: AnyRpcNode | undefined = start;
  for (const key of path) {
    if (node.type === "router") {
      node = node.routes[key];
    }
  }
  return node;
}

export class RpcInvokerError<Input> extends Error {
  constructor(call: RpcCall<Input>, cause: unknown) {
    super(`error in rpc handler "${call[0].join(".")}"`, { cause });
    this.name = "InvokerError";
  }
}

export type RpcInvoker<Input, Output, Context = void> = (
  call: RpcCall<Input>,
  context: Context,
) => Promise<RpcInvokerResult<Input, Output>>;

export type RpcInvokerResult<Input, Output> = Result<
  Output,
  RpcInvokerError<Input>
>;

export type RpcCallId = Branded<number, "RpcCallId">;

export type RpcCall<Input> = [path: string[], input: Input, id: RpcCallId];

// The first handler never has a middleware context,
// but we provide an empty object to make debugging easier,
// since many rpc handlers will try to destructure the mwc in the function signature,
// which can make breakpoints hard to set if it's undefined.
// Defaulting to an empty object slightly improves dx at no cost.
const mwc = Object.freeze({});
