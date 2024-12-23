import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import esbuild from "esbuild";
import builtinModules from "builtin-modules";
import { typecheckPlugin } from "@jgoz/esbuild-plugin-typecheck";

const isDevMode = process.argv.includes("--dev");
const isProd = !!isDevMode;
const outDir = path.resolve(import.meta.dirname, "dist");
const outFile = path.resolve(outDir, "index.js");

const buildOptions: esbuild.BuildOptions = {
  entryPoints: ["src/main.ts"],
  outfile: outFile,
  bundle: true,
  minify: isProd,
  platform: "node",
  target: "node22",
  sourcemap: !isProd,
  format: "esm",
  logLevel: "info",
  loader: {
    ".ts": "ts",
    ".wasm": "file",
  },
  external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
  mainFields: ["module", "main"],
  // Fix for https://github.com/evanw/esbuild/pull/2067
  banner: {
    js: [
      `import { createRequire as createRequireGlobal } from 'module';`,
      `const require = createRequireGlobal(import.meta.url);`,
    ].join("\n"),
  },
  plugins: [typecheckPlugin({ watch: isDevMode })],
};

if (isDevMode) {
  void devMode();
} else {
  void esbuild.build(buildOptions);
}

async function devMode() {
  const ctx = await esbuild.context({
    ...buildOptions,
    plugins: [
      ...(buildOptions.plugins ?? []),
      {
        name: "restart-node-on-rebuild",
        setup: (build) => build.onEnd(restartNode),
      },
    ],
  });

  await ctx.watch();

  let cp: ChildProcess | undefined;
  function restartNode() {
    cp?.kill();
    cp = spawn("node", ["--enable-source-maps", outDir], { stdio: "inherit" });
  }
}
