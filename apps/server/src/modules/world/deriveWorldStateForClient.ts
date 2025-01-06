import type { ClientId } from "@mp/sync-server";
import { vec_distance } from "@mp/math";
import type { Character, WorldState } from "../../package";
import type { ClientRegistry } from "./ClientRegistry";

/**
 * Removes any information that the given client should not have access to.
 * Includes client specific information (ie. fog of war),
 * but also common things like signed out players.
 */
export function deriveWorldStateForClient(clients: ClientRegistry) {
  return (state: WorldState, clientId: ClientId): WorldState => {
    const userId = clients.getUserId(clientId);
    const clientCharacter = Object.values(state.characters).find(
      (char) => char.userId === userId,
    );

    if (!clientCharacter) {
      return { characters: {} };
    }

    const visibleCharacters = Object.entries(state.characters).filter(
      ([_, other]) => canSeeCharacter(clientCharacter, other),
    );

    return {
      characters: Object.fromEntries(visibleCharacters),
    };
  };
}

function canSeeCharacter(a: Character, b: Character) {
  if (a.id === b.id) {
    return true;
  }
  if (a.areaId !== b.areaId) {
    return false;
  }
  const distance = vec_distance(a.coords, b.coords);
  return distance <= 10;
}
