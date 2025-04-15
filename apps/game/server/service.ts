import { recordValues } from "@mp/std";
import type { PatchStateMachine } from "@mp/sync";
import type { DBClient } from "@mp/db";
import { characterTable } from "./character/schema";
import type { GameState } from "./game-state";

export class GameService {
  constructor(private db: DBClient) {}

  persist = (state: PatchStateMachine<GameState>) => {
    return this.db.transaction((tx) =>
      Promise.all(
        recordValues(state.actors())
          .filter((actor) => actor.type === "character")
          .map((char) => {
            return tx.insert(characterTable).values(char).onConflictDoUpdate({
              target: characterTable.id,
              set: char,
            });
          }),
      ),
    );
  };
}
