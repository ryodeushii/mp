import { Server as SocketServer } from "socket.io";
import { id, transports } from "./shared";
import type { AnyModuleDefinitionRecord, ModuleRecord } from "./module";

export { Factory } from "./factory";

export type { inferModuleDefinitions } from "./module";

export interface CreateServerOptions<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  ServerContext,
  ClientContext,
> {
  modules: ModuleRecord<ModuleDefinitions>;
  createContext: (clientContext: ClientContext) => ServerContext;
  log?: typeof console.log;
}

export class Server<
  ModuleDefinitions extends AnyModuleDefinitionRecord,
  ServerContext,
  ClientContext,
> {
  private wss: SocketServer;

  constructor(
    private options: CreateServerOptions<
      ModuleDefinitions,
      ServerContext,
      ClientContext
    >,
  ) {
    this.wss = new SocketServer({ transports });
    this.wss.on("connection", (socket) => {
      socket.on("message", (moduleName, eventName, payload, clientContext) => {
        const context = this.options.createContext(clientContext);
        this.options.log?.("received", id(moduleName, eventName), {
          payload,
          clientContext,
          context,
        });

        const mod = options.modules[moduleName];
        const event = mod[eventName];
        event({ payload, context, origin: "client" });
      });
    });

    for (const moduleName in options.modules) {
      const mod = options.modules[moduleName];
      mod.$subscribe(({ name, args: [{ payload }] }) => {
        this.options.log?.("emitting", id(moduleName, name), payload);
        this.wss.emit(moduleName, name, payload);
      });
    }
  }

  listen(port: number) {
    this.wss.listen(port);
  }

  close() {
    this.wss.close();
  }
}
