import path from "node:path";
import { hideBin } from "yargs/helpers";
import yargs from "yargs";
import { TimeSpan } from "@mp/time";

export type CliOptions = RemoveIndexSignature<
  ReturnType<typeof readCliOptions>
>;

export const cliEnvPrefix = "MP";

export function readCliOptions(argv = process.argv) {
  const options = yargs(hideBin(argv))
    .env(cliEnvPrefix)
    .parserConfiguration({
      "camel-case-expansion": false, // Ensures only the explicit option names are used
      "unknown-options-as-args": true, // Omits unknown args from the options object
    })
    .option("clientDir", {
      type: "string",
      description:
        "If provided, serves the client from this directory. Otherwise, assumes the client is served as a separate app.",
      coerce: (p: string) => (p ? path.resolve(p) : undefined),
    })
    .option("publicDir", {
      type: "string",
      default: "public",
      description: "The directory to serve static files from",
      coerce: (p: string) => path.resolve(p),
    })
    .option("publicPath", {
      type: "string",
      default: "/public/",
      description:
        "The relative path after the hostname where the public dir will be exposed",
    })
    .option("port", {
      type: "number",
      default: 9999,
      description: "The port to listen on",
    })
    .option("httpBaseUrl", {
      type: "string",
      default: "http://k573.localhost",
      description:
        "Used for generating public accessible urls to the http server",
    })
    .option("wsBaseUrl", {
      type: "string",
      default: "wss://k573.localhost",
      description:
        "Used for generating public accessible urls to the websocket server",
    })
    .option("hostname", {
      type: "string",
      default: "0.0.0.0",
      description: "The hostname for the server to listen on",
    })
    .option("corsOrigin", {
      type: "string",
      default: "*",
      description: "The CORS origin to allow",
    })
    .option("authSecretKey", {
      type: "string",
      description: "The secret key for the auth server",
      demandOption: true,
    })
    .option("authPublishableKey", {
      type: "string",
      description: "The publishable key for the auth server",
      demandOption: true,
    })
    .option("tickInterval", {
      type: "number",
      default: 50,
      description: "The server tick interval in milliseconds",
      coerce: (ms: number) => TimeSpan.fromMilliseconds(ms),
    })
    .option("persistInterval", {
      type: "number",
      default: 5000,
      description:
        "How often (in milliseconds) to save the world state to the database",
      coerce: (ms: number) => TimeSpan.fromMilliseconds(ms),
    })
    .option("logSyncPatches", {
      type: "boolean",
      default: false,
      description:
        "Whether to log server state changes that are sent to clients",
    })
    .option("databaseUrl", {
      type: "string",
      default: "postgres://mp:mp@mp:5432/mp",
      description: "The URL to the database",
      demandOption: true,
    })
    .option("buildVersion", {
      type: "string",
      default: "dev",
      description: "The version of the build",
      demandOption: true,
    })
    .parseSync();

  // Remove some yargs internals
  delete (options as Record<string, unknown>)["$0"];
  delete (options as Record<string, unknown>)["_"];

  return options;
}

type RemoveIndexSignature<T> = {
  [K in keyof T as K extends string
    ? string extends K
      ? never
      : K
    : never]: T[K];
};
