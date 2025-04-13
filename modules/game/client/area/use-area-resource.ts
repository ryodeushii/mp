import { createTiledLoader } from "@mp/tiled-loader";
import { skipToken } from "@mp/solid-trpc";
import { type Accessor } from "solid-js";
import { AreaResource } from "../../shared";
import type { AreaId } from "../../shared/area/area-id";
import { TiledResource } from "../../shared/area/tiled-resource";
import { useTRPC } from "../trpc";

export function useAreaResource(areaId?: Accessor<AreaId | undefined>) {
  const trpc = useTRPC();

  return trpc.area.areaFileUrl.createQuery(() => ({
    input: areaId?.() ?? skipToken,
    async map(url, input) {
      const result = await loadTiled(url);
      if (result.isErr()) {
        throw result.error;
      }
      return new AreaResource(input, new TiledResource(result.value));
    },
  }));
}

const loadTiled = createTiledLoader({
  loadJson,
  relativePath: relativeURL,
});

async function loadJson(url: string) {
  const response = await fetch(url);
  const json: unknown = await response.json();
  return json as Record<string, unknown>;
}

function relativeURL(url: string, base: string) {
  base = base.startsWith("//") ? window.location.protocol + base : base;
  return new URL(url, base).toString();
}
