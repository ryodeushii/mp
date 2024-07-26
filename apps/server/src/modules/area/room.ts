import type { Client } from "colyseus";
import { Room } from "colyseus";
import { messageReceiver } from "@mp/events";
import { type AreaMessages } from "./messages";
import type { Coordinate, Path } from "./schema";
import { Area, Character } from "./schema";
import { findPath } from "./findPath";

export class AreaRoom extends Room<Area> {
  fixedTimeStep = 1000 / 60;

  bus = messageReceiver<AreaMessages>()(this);

  override onCreate() {
    this.setState(new Area());

    this.bus.onMessage("move", (client, destination) => {
      const char = this.state.characters.get(client.sessionId);
      if (char) {
        char.path = findPath(char.coords, destination);
      }
    });

    this.setSimulationInterval(this.onTick);
  }

  onTick = (deltaTimeMs: number) => {
    const deltaTime = deltaTimeMs / 1000;
    for (const char of this.state.characters.values()) {
      moveAlongPath(char.coords, char.path, char.speed * deltaTime);
    }
  };

  override onJoin(client: Client) {
    console.log(client.sessionId, "joined!");

    const player = new Character(client.sessionId);
    player.connected = true;
    this.state.characters.set(player.id, player);
  }

  override async onLeave(client: Client, consented: boolean) {
    this.state.characters.get(client.sessionId)!.connected = false;
    try {
      if (consented) {
        throw new Error("consented leave");
      }
      console.log("Allowing reconnection...", client.sessionId);
      await this.allowReconnection(client, 2);
      this.state.characters.get(client.sessionId)!.connected = false;
    } catch {
      console.log(client.sessionId, "left!");
      this.state.characters.delete(client.sessionId);
    }
  }

  override onDispose() {
    console.log("room", this.roomId, "disposing...");
  }
}

function moveAlongPath(coords: Coordinate, path: Path, distance: number): void {
  while (path.length > 0 && distance > 0) {
    const destination = path[0];
    const distanceToDestination = Math.hypot(
      destination.x - coords.x,
      destination.y - coords.y,
    );

    if (distance > distanceToDestination) {
      distance -= distanceToDestination;
      const { x, y } = path.shift()!;
      coords.x = x;
      coords.y = y;
    } else {
      const percentage = distance / distanceToDestination;
      coords.x += (destination.x - coords.x) * percentage;
      coords.y += (destination.y - coords.y) * percentage;
      break;
    }

    // TODO add new coordinate to travelled path when implementing collision detection
  }
}
