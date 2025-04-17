import * as tanstack from "@tanstack/solid-query";
import type { UseMutationResult, UseQueryResult } from "@tanstack/solid-query";
import { skipToken, type SkipToken } from "@tanstack/solid-query";
import type {
  AnyMutationNode,
  AnyQueryNode,
  AnyRouterNode,
  AnyRpcNode as AnyRpcNode,
} from "./builder";
import type { AnyFunction } from "./invocation-proxy";
import { createInvocationProxy } from "./invocation-proxy";
import type {
  InferOutput,
  InferInput,
  RpcProcedureInvoker,
} from "./proxy-invoker";
import type { AnyRpcTransceiver as AnyRpcTransceiver } from "./transceiver";

export function createSolidRpcInvoker<Node extends AnyRpcNode>(
  transceiver: AnyRpcTransceiver,
): SolidRpcInvoker<Node> {
  const proxy = createInvocationProxy((path) => {
    const last = path.at(-1);
    switch (last) {
      case useQueryProperty:
        return createUseQuery(transceiver, path.slice(0, -1)) as AnyFunction;
      case useMutationProperty:
        return createUseMutation(transceiver, path.slice(0, -1)) as AnyFunction;
    }
    return (input) => transceiver.call(path, input);
  });

  return proxy as SolidRpcInvoker<Node>;
}

function createUseQuery(
  transceiver: AnyRpcTransceiver,
  path: string[],
): UseQuery<AnyQueryNode> {
  function useQuery<MappedOutput>(
    options?: () => SolidRpcQueryOptions<unknown, unknown, MappedOutput>,
  ): UseQueryResult {
    return tanstack.useQuery(() => {
      const { input, throwOnError } = options?.() ?? {};
      return {
        queryKey: [path, input],
        queryFn: input === skipToken ? skipToken : queryFn,
        throwOnError,
      };
    });

    async function queryFn() {
      const { input, map } = options?.() ?? {};
      const result = (await transceiver.call(path, input)) as unknown;
      if (map) {
        return map(result, input);
      }
      return result;
    }
  }

  return useQuery as UseQuery<AnyQueryNode>;
}

function createUseMutation(
  transceiver: AnyRpcTransceiver,
  path: string[],
): UseMutation<AnyMutationNode> {
  return () => {
    return tanstack.useMutation(() => ({
      mutationKey: path,
      mutationFn: (input: unknown) => transceiver.call(path, input),
    }));
  };
}

export type SolidRpcInvoker<Node extends AnyRpcNode> =
  Node extends AnyRouterNode
    ? SolidRpcRouterInvoker<Node>
    : Node extends AnyQueryNode
      ? SolidRpcQueryInvoker<Node>
      : Node extends AnyMutationNode
        ? SolidRpcMutationInvoker<Node>
        : never;

export type SolidRpcRouterInvoker<Router extends AnyRouterNode> = {
  [K in keyof Router["routes"]]: SolidRpcInvoker<Router["routes"][K]>;
};

export interface SolidRpcQueryOptions<Input, Output, MappedOutput> {
  input: Input | tanstack.SkipToken;
  map?: (output: Output, input: Input) => MappedOutput | Promise<MappedOutput>;
  throwOnError?: boolean;
}

export interface SolidRpcQueryInvoker<Node extends AnyQueryNode>
  extends RpcProcedureInvoker<Node> {
  [useQueryProperty]: UseQuery<Node>;
}

export interface UseQuery<Node extends AnyQueryNode> {
  /**
   * Returns a @tanstack/solid-query query wrapper of the rpc procedure.
   */
  <MappedOutput = InferOutput<Node["handler"]>>(
    options?: () => SolidRpcQueryOptions<
      InferInput<Node["handler"]>,
      InferOutput<Node["handler"]>,
      MappedOutput
    >,
  ): UseQueryResult<MappedOutput, unknown>;
}

const useQueryProperty = "useQuery";
const useMutationProperty = "useMutation";

export interface UseMutation<Node extends AnyMutationNode> {
  /**
   * Returns a @tanstack/solid-query mutation wrapper of the rpc procedure.
   */
  (): UseMutationResult<
    InferInput<Node["handler"]>,
    unknown,
    InferOutput<Node["handler"]>
  >;
}
export interface SolidRpcMutationInvoker<Node extends AnyMutationNode>
  extends RpcProcedureInvoker<Node> {
  [useMutationProperty]: UseMutation<Node>;
}

export { skipToken, type SkipToken };
export { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
