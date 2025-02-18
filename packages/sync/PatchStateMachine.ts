import type { ReadonlyDeep } from "type-fest";
import type { ClientId } from "./shared";
import type { Patch, PatchPath, Operation } from "./patch";

/**
 * A state machine that records all state changes made as atomic patches,
 * is aware of which patches should be visible per client,
 * and allows flushing the collected patches at any given time.
 */
export type PatchStateMachine<State extends PatchableState> =
  EntityRepositoryRecord<State> & {
    [flushFunctionName]: FlushFn;
  };

export function createPatchStateMachine<State extends PatchableState>(
  opt: PatchStateMachineOptions<State>,
): PatchStateMachine<State> {
  const state = structuredClone(opt.initialState);
  const serverPatch: Patch = [];
  const flush = createFlushFunction(
    state,
    serverPatch,
    opt.clientIds,
    opt.clientVisibility,
  );
  const repositories = {} as EntityRepositoryRecord<State>;
  return new Proxy({} as PatchStateMachine<State>, {
    get(_, prop) {
      if (prop === flushFunctionName) {
        return flush;
      }
      const entityName = prop as keyof State;
      return (repositories[entityName] ??= createEntityRepository(
        state,
        serverPatch,
        entityName,
      ));
    },
  });
}

function createFlushFunction<State extends PatchableState>(
  state: State,
  serverPatch: Patch,
  getClientIds: () => Iterable<ClientId>,
  getClientVisibility: ClientVisibilityFactory<State>,
): FlushFn {
  const hasBeenGivenFullState = new Set<ClientId>();
  const visibilities: Map<ClientId, ClientVisibility<State>> = new Map();

  return function flush() {
    const clientIds = Array.from(getClientIds());
    const prevVisibilities: Record<
      ClientId,
      ClientVisibility<State>
    > = Object.fromEntries(
      clientIds.map((clientId) => [
        clientId,
        visibilities.get(clientId) ?? // Reuse last if it exists
          getClientVisibility(clientId, state), // Derive new if not
      ]),
    );

    const clientPatches: ClientPatches = new Map();

    for (const clientId of clientIds) {
      const prevVisibility = prevVisibilities[clientId];
      const nextVisibility = getClientVisibility(clientId, state);
      const clientPatch: Patch = [];

      visibilities.set(clientId, nextVisibility);

      if (!hasBeenGivenFullState.has(clientId)) {
        clientPatch.push(
          ...createFullStatePatch(deriveClientState(state, nextVisibility)),
        );
        hasBeenGivenFullState.add(clientId);
      }

      // Emulate adds and removals of entities due to visibility changes

      for (const entityName in state) {
        const prevIds = prevVisibility[entityName];
        const nextIds = nextVisibility[entityName];

        for (const addedId of nextIds.difference(prevIds)) {
          clientPatch.push({
            o: "a",
            p: [entityName, addedId as string],
            v: state[entityName][addedId],
          });
        }

        for (const removedId of prevIds.difference(nextIds)) {
          clientPatch.push({ o: "r", p: [entityName, removedId as string] });
        }
      }

      // Select the patches visible to the client

      clientPatch.push(
        ...serverPatch.filter(({ p: [entityName, entityId] }) => {
          return nextVisibility[entityName].has(entityId);
        }),
      );

      if (clientPatch.length > 0) {
        clientPatches.set(clientId, clientPatch);
      }
    }

    serverPatch.splice(0, serverPatch.length);

    return clientPatches;
  };
}

function deriveClientState<State extends PatchableState>(
  state: State,
  visibilities: ClientVisibility<State>,
): State {
  return Object.fromEntries(
    Object.entries(visibilities).map(
      ([entityName, entityIds]: [string, ReadonlySet<PatchableEntityId>]) => {
        const allEntities = state[entityName];
        const referencedEntities = Object.fromEntries(
          entityIds.values().map((id) => [id, allEntities[id]]),
        );
        return [entityName, referencedEntities];
      },
    ),
  ) as State;
}

function createEntityRepository<
  State extends PatchableState,
  EntityName extends keyof State,
>(
  state: State,
  serverPatch: Patch,
  entityName: EntityName,
): EntityRepository<State[EntityName]> {
  type Entities = State[EntityName];
  type Id = keyof Entities;
  type Entity = Entities[Id];

  function entity() {
    // Type level immutability is enough, we don't need to check at runtime as it will impact performance
    return state[entityName] as ReadonlyDeep<Entities>;
  }

  entity.set = function setEntity(id: Id, entity: Entity) {
    serverPatch.push({
      o: "u",
      p: [entityName as string, id as string],
      v: entity,
    });
    state[entityName][id] = entity;
  };

  entity.update = function updateEntity(id: Id, value: Partial<Entity>) {
    for (const prop in value) {
      const key = prop as keyof Entity;
      serverPatch.push(
        createSetOperation(
          [entityName as string, id as string, prop],
          value[key],
          state[entityName][id][key],
        ),
      );
    }
    Object.assign(state[entityName][id] as object, value);
  };

  entity.remove = function removeEntity(id: Id) {
    serverPatch.push({
      o: "r",
      p: [entityName as string, id as string],
    });
    delete state[entityName][id];
  };

  return entity;
}

function createFullStatePatch<State extends PatchableState>(
  state: State,
): Patch {
  const patch: Patch = [];
  for (const key in state) {
    patch.push({
      o: "a",
      p: [key],
      v: state[key as keyof typeof state],
    });
  }
  return patch;
}

function createSetOperation<Value>(
  path: PatchPath,
  nextValue: Value,
  prevValue: Value,
): Operation {
  if (nextValue === undefined && prevValue !== undefined) {
    return { o: "r", p: path };
  }
  if (nextValue !== undefined && prevValue === undefined) {
    return { o: "a", p: path, v: nextValue };
  }
  return { o: "u", p: path, v: nextValue };
}

const flushFunctionName = "flush";

export type EntityRepositoryRecord<State extends PatchableState> = {
  [EntityName in keyof State]: EntityRepository<State[EntityName]>;
};

type FlushFn = () => ClientPatches;

export interface EntityRepository<Entities extends PatchableEntities> {
  (): ReadonlyDeep<Entities>;
  set: (id: keyof Entities, entity: Entities[keyof Entities]) => void;
  update: (
    id: keyof Entities,
    entity: Partial<Entities[keyof Entities]> & object,
  ) => void;
  remove: (id: keyof Entities) => void;
}

export interface PatchStateMachineOptions<State extends PatchableState> {
  initialState: State;
  clientVisibility: ClientVisibilityFactory<State>;
  clientIds: () => Iterable<ClientId>;
}

export type ClientVisibilityFactory<State extends PatchableState> = (
  clientId: ClientId,
  state: State,
) => ClientVisibility<State>;

export type ClientPatches = Map<ClientId, Patch>;

export type ClientVisibility<State extends PatchableState> = {
  [EntityName in keyof State]: ReadonlySet<keyof State[EntityName]>;
};

export type PatchableEntityId = string;

export type PatchableEntity = unknown;

export type PatchableEntities = {
  [entityId: PatchableEntityId]: PatchableEntity;
};

export type PatchableState = { [entityName: string]: PatchableEntities };
