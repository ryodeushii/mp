import type { AreaId } from "@mp/state";
import { TiledRenderer } from "@mp/tiled-renderer";
import { createTiledLoader } from "@mp/tiled-loader";
import { Application } from "@mp/pixi";
import { api } from "./api";

async function main() {
  const loadTiled = createTiledLoader({
    loadMap: fetchJson,
    loadTileset: (...args) => fetchJson(relativeURL(...args)),
  });

  const rootElement = document.querySelector("div#root")!;
  const areaUrl = await api.modules.area.areaFileUrl("forest" as AreaId);
  const { tiledMap, error } = await loadTiled(areaUrl);
  if (!tiledMap) {
    rootElement.innerHTML = `<pre>${error}</pre>`;
    return;
  }

  const app = new Application();
  await app.init({ antialias: true, background: 0x005500, resizeTo: window });
  app.stage.addChild(new TiledRenderer(tiledMap));
  rootElement.appendChild(app.canvas);
}

main();

async function fetchJson(url: string) {
  const response = await fetch(url);
  return response.json();
}

function relativeURL(url: string, base: string) {
  base = base.startsWith("//") ? window.location.protocol + base : base;
  return new URL(url, base).toString();
}
