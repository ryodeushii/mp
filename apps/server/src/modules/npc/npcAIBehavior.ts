import type { StateAccess } from "@mp/sync/server";
import type { TickEventHandler } from "@mp/time";
import type { AreaLookup } from "../area/loadAreas";
import type { WorldState } from "../world/WorldState";

export function npcAIBehavior(
  accessState: StateAccess<WorldState>,
  areas: AreaLookup,
): TickEventHandler {
  return () => {
    accessState("npcAIBehavior", (state) => {
      for (const subject of Object.values(state.npcs)) {
        if (!subject.path) {
          const area = areas.get(subject.areaId);
          if (!area) {
            throw new Error(`Area not found: ${subject.areaId}`);
          }

          const fromNode = area.graph.getNearestNode(subject.coords);
          const toNode = randomItem(Array.from(area.graph.getNodes()));
          if (fromNode && toNode) {
            subject.path = area.findPath(fromNode.id, toNode.id);
          }
        }
      }
    });
  };
}

function randomItem<T>(arr: T[]): T | undefined {
  return arr[Math.floor(Math.random() * arr.length)];
}
