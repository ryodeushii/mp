import Phaser from "phaser";
import type { Room } from "colyseus.js";
import type { InputData, TestRoomState } from "@mp/server";

export function createScene(room: Room<TestRoomState>) {
  return class extends Phaser.Scene {
    constructor() {
      super({ key: "test" });
    }

    currentPlayer?: Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
    playerEntities: {
      [sessionId: string]: Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
    } = {};

    localRef?: Phaser.GameObjects.Rectangle;
    remoteRef?: Phaser.GameObjects.Rectangle;

    cursorKeys?: Phaser.Types.Input.Keyboard.CursorKeys;

    inputPayload: Partial<InputData> = {};

    elapsedTime = 0;
    fixedTimeStep = 1000 / 60;

    preload() {
      this.load.image(
        "ship_0001",
        "https://cdn.glitch.global/3e033dcd-d5be-4db4-99e8-086ae90969ec/ship_0001.png?v=1649945243288",
      );
    }

    async create() {
      this.cursorKeys = this.input.keyboard!.createCursorKeys();

      room.state.players.onAdd((player, sessionId) => {
        const entity = this.physics.add.image(player.x, player.y, "ship_0001");
        this.playerEntities[sessionId] = entity;

        if (sessionId === room.sessionId) {
          this.currentPlayer = entity;

          this.localRef = this.add.rectangle(0, 0, entity.width, entity.height);
          this.localRef.setStrokeStyle(1, 0x00ff00);

          this.remoteRef = this.add.rectangle(
            0,
            0,
            entity.width,
            entity.height,
          );
          this.remoteRef.setStrokeStyle(1, 0xff0000);

          player.onChange(() => {
            if (this.remoteRef) {
              this.remoteRef.x = player.x;
              this.remoteRef.y = player.y;
            }
          });
        } else {
          player.onChange(() => {
            entity.setData("serverX", player.x);
            entity.setData("serverY", player.y);
          });
        }
      });

      room.state.players.onRemove((player, sessionId) => {
        const entity = this.playerEntities[sessionId];
        if (entity) {
          entity.destroy();
          delete this.playerEntities[sessionId];
        }
      });

      this.cameras.main.setBounds(0, 0, 800, 600);
    }

    update(time: number, delta: number): void {
      if (!this.currentPlayer) {
        return;
      }

      this.elapsedTime += delta;
      while (this.elapsedTime >= this.fixedTimeStep) {
        this.elapsedTime -= this.fixedTimeStep;
        this.fixedTick(time, this.fixedTimeStep);
      }
    }

    fixedTick(time: number, delta: number) {
      if (!this.currentPlayer) {
        return;
      }

      this.moveByMouse();

      if (this.localRef) {
        this.localRef.x = this.currentPlayer.x;
        this.localRef.y = this.currentPlayer.y;
      }

      for (const sessionId in this.playerEntities) {
        if (sessionId === room.sessionId) {
          continue;
        }

        const entity = this.playerEntities[sessionId];
        const { serverX, serverY } = entity.data?.values ?? {};

        entity.x = Phaser.Math.Linear(entity.x, serverX, 0.2);
        entity.y = Phaser.Math.Linear(entity.y, serverY, 0.2);
      }
    }

    moveByMouse() {
      if (!this.currentPlayer) {
        return;
      }

      const { x, y } = this.input.mousePointer;
      this.inputPayload = { x, y };
      room.send(0, this.inputPayload);
      this.currentPlayer.x = x;
      this.currentPlayer.y = y;
    }
  };
}
