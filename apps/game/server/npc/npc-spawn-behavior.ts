import {
  names,
  uniqueNamesGenerator,
  adjectives,
  animals,
} from "unique-names-generator";
import type { PatchStateMachine } from "@mp/sync";
import type { TickEventHandler } from "@mp/time";
import type { Tile, TimesPerSecond } from "@mp/std";
import { randomItem, recordValues, uuid } from "@mp/std";
import { clamp, Rect, Vector } from "@mp/math";
import type { VectorGraphNode } from "@mp/path-finding";
import type { GameState } from "../game-state";
import type { AreaLookup } from "../area/lookup";
import type { AreaId } from "../../shared/area/area-id";
import type { AreaResource } from "../../shared/area/area-resource";
import type { NpcService } from "./service";
import type { Npc, NpcInstance, NpcInstanceId, NpcSpawn } from "./schema";

export function npcSpawnBehavior(
  state: PatchStateMachine<GameState>,
  npcService: NpcService,
  areas: AreaLookup,
): TickEventHandler {
  let spawns: Awaited<ReturnType<NpcService["getAllSpawnsAndTheirNpcs"]>> = [];
  void npcService.getAllSpawnsAndTheirNpcs().then((list) => {
    spawns = list;
  });

  return () => {
    // Clean up dead NPCs
    for (const actor of recordValues(state.actors())) {
      if (actor.type === "npc" && actor.health <= 0) {
        state.actors.remove(actor.id);
      }
    }

    for (const { spawn, npc } of spawns) {
      const area = areas.get(spawn.areaId);
      if (!area) {
        throw new Error(`Area not found: ${spawn.areaId}`);
      }

      const existingNpcs = recordValues(state.actors())
        .filter(
          (a) => a.type === "npc" && a.npcId === npc.id && a.areaId === area.id,
        )
        .toArray().length;

      const amountToSpawn = spawn.count - existingNpcs;

      for (let i = 0; i < amountToSpawn; i++) {
        const instance = spawnNpcInstance(npc, spawn, area);
        state.actors.set(instance.id, { type: "npc", ...instance });
      }
    }
  };
}

const randomAndCustomNames = [
  "Chombs",
  "Chomps",
  "Bill",
  "normal Jeff",
  "Max Power",
  ...names,
];

export function spawnNpcInstance(
  npc: Npc,
  spawn: NpcSpawn,
  area: AreaResource,
): NpcInstance {
  return createNpcInstance(
    npc,
    spawn.areaId,
    determineSpawnCoords(spawn, area),
  );
}

export function createNpcInstance(
  npc: Npc,
  areaId: AreaId,
  coords: Vector<Tile>,
): NpcInstance {
  const id = uuid() as NpcInstanceId;
  const name = uniqueNamesGenerator({
    dictionaries: [adjectives, animals, randomAndCustomNames],
    separator: " ",
    style: "capital",
    seed: id,
  });
  return {
    id,
    npcId: npc.id,
    areaId,
    coords,
    speed: npc.speed,
    color: 0xff_00_00, // Hard coded to enemy color for now
    name,
    hitBox: Rect.fromDiameter(Vector.zero(), 1 as Tile),
    health: 25,
    maxHealth: 25,
    attackDamage: 5,
    attackRange: 1 as Tile,
    attackSpeed: 1 as TimesPerSecond,
  };
}

function determineSpawnCoords(
  spawn: NpcSpawn,
  area: AreaResource,
): Vector<Tile> {
  if (spawn.coords) {
    return spawn.coords;
  }

  let randomNode: VectorGraphNode<Tile> | undefined;
  if (spawn.randomRadius) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * spawn.randomRadius;

    const randomTile = new Vector(
      clamp(0, Math.cos(angle) * radius, area.tiled.mapSize.x) as Tile,
      clamp(0, Math.sin(angle) * radius, area.tiled.mapSize.y) as Tile,
    );
    randomNode = area.graph.getNearestNode(randomTile);
  } else {
    randomNode = randomItem(Array.from(area.graph.getNodes()));
  }

  if (!randomNode) {
    throw new Error("No tiles available for NPC spawn");
  }

  return randomNode.data.vector;
}
