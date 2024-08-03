import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import { signal, type Signal } from "@preact/signals-core";
import type {
  AnyProcedureDefinition,
  AnyProcedureRecord,
  AnyModuleDefinitionRecord,
  ProcedureDefinition,
  ProcedureHandler,
  ProcedureType,
} from "./module";
import type { ProcedureBus } from "./procedure";
import { createProcedureBus } from "./procedure";
import type {
  SocketIO_ClientToServerEvents,
  SocketIO_RPC,
  SocketIO_ServerToClientEvents,
} from "./socket";
import type { Parser, Serializer } from "./serialization";

export class Client<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  State,
  StateUpdate,
> {
  private socket: ClientSocket<StateUpdate>;
  readonly modules: ClientModuleRecord<ModuleDefinitions>;
  readonly state: Signal<State>;

  get clientId() {
    return this.socket.id;
  }

  constructor(private options: ClientOptions<State, StateUpdate>) {
    this.socket = io(options.url, { transports: ["websocket"] });

    this.modules = createModuleInterface<ModuleDefinitions, State, StateUpdate>(
      this.socket,
      this.options,
    );

    this.state = signal(options.createInitialState());

    this.socket.on("stateUpdate", (update) => {
      this.state.value = options.createNextState(
        this.state.value,
        options.parseStateUpdate(update),
      );
    });

    this.socket.on(
      "disconnect",
      () => (this.state.value = options.createInitialState()),
    );
  }

  dispose() {
    this.socket.disconnect();
  }
}

function createModuleInterface<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  State,
  StateUpdate,
>(
  socket: ClientSocket<State>,
  options: ClientOptions<State, StateUpdate>,
): ClientModuleRecord<ModuleDefinitions> {
  return new Proxy({} as ClientModuleRecord<ModuleDefinitions>, {
    get: (_, moduleName) =>
      createModuleProcedureBus(moduleName, socket, options),
  });
}

function createModuleProcedureBus<State, StateUpdate>(
  moduleName: PropertyKey,
  socket: ClientSocket<State>,
  options: ClientOptions<State, StateUpdate>,
) {
  return createProcedureBus(
    async (procedureName, ...[input]) => {
      const serializedResponse = await socket.emitWithAck(
        "rpc",
        options.serializeRPC({
          moduleName: String(moduleName),
          procedureName: String(procedureName),
          input,
        }),
      );

      return options.parseRPCOutput(serializedResponse) as never;
    },
    () => {
      throw new Error("Subscriptions are not supported on the client");
    },
  );
}

export interface ClientOptions<State, StateUpdate> {
  url: string;
  serializeRPC: Serializer<SocketIO_RPC>;
  parseRPCOutput: Parser<unknown>;
  parseStateUpdate: Parser<StateUpdate>;
  createNextState: (state: State, update: StateUpdate) => State;
  createInitialState: () => State;
}

export type * from "./serialization";

type ClientSocket<State> = Socket<
  SocketIO_ServerToClientEvents<State>,
  SocketIO_ClientToServerEvents
>;

type ClientModuleRecord<Procedures extends AnyModuleDefinitionRecord> = {
  [K in keyof Procedures]: ClientModule<Procedures[K]>;
};

type ClientModule<Procedures extends AnyProcedureRecord = AnyProcedureRecord> =
  ProcedureBus<ClientToServerProcedures<Procedures>, {}>;

type ClientToServerProcedures<Procedures extends AnyProcedureRecord> = {
  [ProcedureName in ProcedureNamesForType<
    Procedures,
    "client-to-server"
  >]: ClientProcedureHandler<Procedures[ProcedureName]>;
};

type ClientProcedureHandler<
  Procedure extends AnyProcedureDefinition,
  Type extends ProcedureType = ProcedureType,
> =
  Procedure extends ProcedureDefinition<Type, infer Payload, infer Output>
    ? ProcedureHandler<Payload["input"], Output>
    : never;

// This seems to cause the language service to fail to go to definition
// on module procedures even though it resolves to the correct types
type ProcedureNamesForType<
  Procedures extends AnyProcedureRecord,
  Type extends ProcedureType,
> = {
  [Key in keyof Procedures]: Procedures[Key] extends ProcedureDefinition<
    Type,
    infer _1,
    infer _2
  >
    ? Key
    : never;
}[keyof Procedures];
