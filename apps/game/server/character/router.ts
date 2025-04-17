import { Vector, type VectorLike } from "@mp/math";
import { recordValues, type Tile } from "@mp/std";
import { RpcError } from "@mp/rpc";
import type { AuthToken } from "@mp/auth";
import type { ActorId } from "../traits/actor";
import { ctxGameStateMachine } from "../game-state";
import { rpc } from "../rpc";
import { roles } from "../user/auth";
import { defineRoles } from "../user/define-roles";
import { ctxCharacterService } from "./service";
import { type CharacterId } from "./schema";

export const characterRoles = defineRoles("character", [
  "join",
  "move",
  "attack",
  "kill",
  "respawn",
]);

export type CharacterRouter = typeof characterRouter;
export const characterRouter = rpc.router({
  authenticate: rpc.procedure.input<AuthToken>().mutation(({ input, ctx }) => {
    throw new Error("Not implemented");
  }),
  move: rpc.procedure
    .input<{ characterId: CharacterId; to: VectorLike<Tile> }>()
    .use(roles([characterRoles.move]))
    .mutation(({ input: { characterId, to }, ctx, mwc: { user } }) => {
      const state = ctx.get(ctxGameStateMachine);
      const char = state.actors()[characterId];

      if (!char || char.type !== "character") {
        throw new RpcError("Character not found");
      }

      if (char.userId !== user.id) {
        throw new RpcError("You don't have access to this character");
      }

      if (!char.health) {
        throw new RpcError("Cannot move a dead character");
      }

      state.actors.update(char.id, {
        attackTargetId: undefined,
        moveTarget: Vector.from(to),
      });
    }),

  attack: rpc.procedure
    .input<{ characterId: CharacterId; targetId: ActorId }>()
    .use(roles([characterRoles.attack]))
    .mutation(({ input: { characterId, targetId }, ctx, mwc: { user } }) => {
      const state = ctx.get(ctxGameStateMachine);
      const char = state.actors()[characterId];

      if (!char || char.type !== "character") {
        throw new RpcError("Character not found");
      }

      if (char.userId !== user.id) {
        throw new RpcError("You don't have access to this character");
      }

      if (targetId === characterId) {
        throw new RpcError("You can't attack yourself");
      }

      state.actors.update(characterId, {
        attackTargetId: targetId,
      });
    }),

  join: rpc.procedure
    .output<CharacterId>()
    .use(roles([characterRoles.join]))
    .mutation(async ({ ctx, mwc: { user } }) => {
      const state = ctx.get(ctxGameStateMachine);
      const characterService = ctx.get(ctxCharacterService);
      const existingCharacter = recordValues(state.actors())
        .filter((actor) => actor.type === "character")
        .find((actor) => actor.userId === user.id);

      if (existingCharacter) {
        return existingCharacter.id;
      }

      const char = await characterService.getOrCreateCharacterForUser(user);
      state.actors.set(char.id, { type: "character", ...char });
      return char.id;
    }),

  kill: rpc.procedure
    .input<{ targetId: ActorId }>()
    .use(roles([characterRoles.kill]))
    .mutation(({ input: { targetId }, ctx }) => {
      const state = ctx.get(ctxGameStateMachine);
      const target = state.actors()[targetId];
      state.actors.update(target.id, { health: 0 });
    }),

  respawn: rpc.procedure
    .input<CharacterId>()
    .use(roles([characterRoles.respawn]))
    .mutation(({ input: characterId, ctx, mwc: { user } }) => {
      const state = ctx.get(ctxGameStateMachine);
      const char = state.actors()[characterId];

      if (!char || char.type !== "character") {
        throw new RpcError("Character not found");
      }

      if (char.userId !== user.id) {
        throw new RpcError("You don't have access to this character");
      }

      if (char.health > 0) {
        throw new RpcError("Character is not dead");
      }

      const characterService = ctx.get(ctxCharacterService);
      state.actors.update(char.id, {
        health: char.maxHealth,
        ...characterService.getDefaultSpawnPoint(),
      });
    }),
});

export const characterRouterSlice = { character: characterRouter };
