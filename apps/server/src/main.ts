#!/usr/bin/env node

import "dotenv/config";
import path from "node:path";
import http from "node:http";
import { consoleLoggerHandler, Logger } from "@mp/logger";
import express from "express";
import { type PathToLocalFile, type UrlToPublicFile } from "@mp/data";
import createCors from "cors";
import type { AuthToken } from "@mp/auth-server";
import { createAuthServer } from "@mp/auth-server";
import * as trpcExpress from "@trpc/server/adapters/express";
import type { ClientId, HandshakeData } from "@mp/sync/server";
import { SyncServer, WebSocketServer } from "@mp/sync/server";
import { measureTimeSpan, Ticker } from "@mp/time";
import {
  collectDefaultMetrics,
  MetricsGague,
  MetricsHistogram,
  MetricsRegistry,
} from "@mp/telemetry/prom";
import { parseEnv } from "@mp/env";
import type { WorldState } from "./modules/world/schema";
import type { HttpSessionId } from "./context";
import { type ServerContext } from "./context";
import { loadAreas } from "./modules/area/loadAreas";
import type { ServerOptions } from "./schemas/serverOptions";
import { serverOptionsSchema } from "./schemas/serverOptions";
import { createDBClient } from "./db/client";
import { ClientRegistry } from "./modules/world/ClientRegistry";
import { createRootRouter } from "./modules/router";
import { tokenHeaderName } from "./shared";
import { collectUserMetrics } from "./modules/world/collectUserMetrics";
import { metricsMiddleware } from "./express/metricsMiddleware";
import { deriveWorldStateForClient } from "./modules/world/deriveWorldStateForClient";
import { WorldService } from "./modules/world/service";

const logger = new Logger();
logger.subscribe(consoleLoggerHandler(console));

const optResult = parseEnv(serverOptionsSchema, process.env, "MP_SERVER_");
if (optResult.isErr()) {
  logger.error("Server options invalid or missing:\n", optResult.error);
  process.exit(1);
}

const opt = optResult.value;
logger.info(serverTextHeader(opt));

const areas = await loadAreas(path.resolve(opt.publicDir, "areas"));

if (areas.isErr() || areas.value.size === 0) {
  logger.error(
    "Cannot start server without areas",
    areas.isErr() ? areas.error : "No areas found",
  );
  process.exit(1);
}

const clients = new ClientRegistry();
const metrics = new MetricsRegistry();
collectDefaultMetrics({ register: metrics });

new MetricsGague({
  name: "process_uptime_seconds",
  help: "Time since the process started in seconds",
  registers: [metrics],
  collect() {
    this.set(process.uptime());
  },
});

const tickBuckets = [
  0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 7, 10, 12, 16, 24, 36, 48, 65, 100, 200,
  400, 600, 800, 1000,
];

const tickIntervalMetric = new MetricsHistogram({
  name: "server_tick_interval",
  help: "Time between each server tick in milliseconds",
  registers: [metrics],
  buckets: tickBuckets,
});

const tickDurationMetric = new MetricsHistogram({
  name: "server_tick_duration",
  help: "Time taken to process each server tick in milliseconds",
  registers: [metrics],
  buckets: tickBuckets,
});

const auth = createAuthServer(opt.auth);
const db = createDBClient(opt.databaseUrl);
const defaultAreaId = [...areas.value.keys()][0];

const expressLogger = createExpressLogger(logger);

const expressStaticConfig = {
  maxAge: opt.publicMaxAge * 1000,
};

const webServer = express()
  .set("trust proxy", opt.trustProxy)
  .use(metricsMiddleware(metrics)) // Intentionally placed before logger since it's so verbose and unnecessary to log
  .use(expressLogger)
  .use(createCors({ origin: opt.corsOrigin }))
  .use(opt.publicPath, express.static(opt.publicDir, expressStaticConfig));

const httpServer = http.createServer(webServer);

const wsServer = new WebSocketServer({
  server: httpServer,
  path: opt.wsEndpointPath,
});

const syncServer = new SyncServer<WorldState, WorldState>({
  wss: wsServer,
  handshakeTimeout: 5000,
  initialState: { characters: {} },
  createClientState: deriveWorldStateForClient(clients),
  patchCallback: opt.logSyncPatches
    ? (props) => logger.info("[sync]", props)
    : undefined,
  onConnection: handleSyncServerConnection,
  onDisconnect(clientId) {
    logger.info("Client disconnected", clientId);
    const userId = clients.getUserId(clientId);
    syncServer.access("disconnect", (state) => {
      for (const char of Object.values(state.characters)) {
        if (char.userId === userId) {
          logger.info("Removing character", char.id);
          delete state.characters[char.id];
        }
      }
    });
    clients.deleteClient(clientId);
  },
});

collectUserMetrics(metrics, clients, syncServer);

const persistTicker = new Ticker({
  interval: opt.persistInterval,
  async middleware() {
    try {
      await worldService.persistWorldState(
        syncServer.access("persist", (state) => state),
      );
    } catch (error) {
      logger.error("Error persisting world state", error);
    }
  },
});

const apiTicker = new Ticker({
  interval: opt.tickInterval,
  middleware({ delta: tickInterval, next }) {
    try {
      tickIntervalMetric.observe(tickInterval.totalMilliseconds);
      const getMeasurement = measureTimeSpan();
      next(tickInterval);
      tickDurationMetric.observe(getMeasurement().totalMilliseconds);
    } catch (error) {
      logger.error("Error in api ticker", error);
    }
  },
});

const worldService = new WorldService(db, areas.value, defaultAreaId);

const trpcRouter = createRootRouter({
  areas: areas.value,
  service: worldService,
  state: syncServer.access,
  createUrl: urlToPublicFile,
  buildVersion: opt.buildVersion,
  ticker: apiTicker,
});

webServer.use(
  opt.apiEndpointPath,
  trpcExpress.createExpressMiddleware({
    onError: ({ path, error }) =>
      logger.error(`[trpc error][${path}]: ${error.message}`),
    router: trpcRouter,
    createContext: ({ req }) =>
      createServerContext(
        `${req.ip}-${req.headers["user-agent"]}` as HttpSessionId,
        String(req.headers[tokenHeaderName]) as ServerContext["authToken"],
      ),
  }),
);

httpServer.listen(opt.port, opt.hostname, () => {
  logger.info(`Server listening on ${opt.hostname}:${opt.port}`);
});

persistTicker.start();
apiTicker.start();
syncServer.start();

function createServerContext(
  sessionId: HttpSessionId,
  authToken: ServerContext["authToken"],
): ServerContext {
  return {
    sessionId,
    accessWorldState: syncServer.access,
    authToken,
    auth,
    logger,
    clients,
    exposeErrorDetails: opt.exposeErrorDetails,
  };
}

async function handleSyncServerConnection(
  clientId: ClientId,
  { token }: HandshakeData,
) {
  logger.info("Client connected", clientId);

  if (token === undefined) {
    logger.info("Client did not provide a token", clientId);
    syncServer.disconnectClient(clientId);
    return;
  }

  const verifyResult = await auth.verifyToken(token as AuthToken);
  if (!verifyResult.ok) {
    logger.info(
      "Could not verify client authentication token",
      clientId,
      verifyResult.error,
    );
    syncServer.disconnectClient(clientId);
    return;
  }

  clients.associateClientWithUser(clientId, verifyResult.user.id);
  logger.info("Client verified and associated with user", {
    clientId,
    userId: verifyResult.user.id,
  });

  const char = await worldService.getCharacterForUser(verifyResult.user.id);
  if (char) {
    syncServer.access("handleSyncServerConnection", (state) => {
      logger.info("Adding character to world state", char.id);
      state.characters[char.id] = char;
    });
  }
}

function urlToPublicFile(fileInPublicDir: PathToLocalFile): UrlToPublicFile {
  const relativePath = path.isAbsolute(fileInPublicDir)
    ? path.relative(opt.publicDir, fileInPublicDir)
    : fileInPublicDir;
  return `${opt.httpBaseUrl}${opt.publicPath}${relativePath}` as UrlToPublicFile;
}

function createExpressLogger(logger: Logger): express.RequestHandler {
  return (req, _, next) => {
    logger.info("[http]", req.method, req.url);
    next();
  };
}

function serverTextHeader(options: ServerOptions) {
  return `
===============================
#                             #
#     ███╗   ███╗ ██████╗     #
#     ████╗ ████║ ██╔══██╗    #
#     ██╔████╔██║ ██████╔╝    #
#     ██║╚██╔╝██║ ██╔═══╝     #
#     ██║ ╚═╝ ██║ ██║         #
#     ╚═╝     ╚═╝ ╚═╝         #
===============================
${JSON.stringify(options, null, 2)}
=====================================================`;
}
