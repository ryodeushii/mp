import { ctxGameStateMachine } from "../game-state";
import { ctxAreaLookup } from "../area/lookup";
import { spawnNpcInstance } from "./npc-spawn-behavior";
import { ctxNpcService } from "./service";
import { rpc } from "@mp/game";
import { defineRoles, roles } from "@mp/game";

export const npcRoles = defineRoles("npc", ["spawnRandom"]);

export type NPCRouter = typeof npcRouter;
export const npcRouter = rpc.router({
  spawnRandomNPC: rpc.procedure
    .use(roles([npcRoles.spawnRandom]))
    .mutation(async ({ ctx }) => {
      const npcService = ctx.get(ctxNpcService);
      const state = ctx.get(ctxGameStateMachine);
      const areas = ctx.get(ctxAreaLookup);
      const [{ npc, spawn }] = await npcService.getAllSpawnsAndTheirNpcs();
      const area = areas.get(spawn.areaId);
      if (!area) {
        throw new Error(`Area not found: ${spawn.areaId}`);
      }
      const instance = spawnNpcInstance(npc, spawn, area);
      state.actors.set(instance.id, { type: "npc", ...instance });
    }),
});

export const npcRouterSlice = { npc: npcRouter };
