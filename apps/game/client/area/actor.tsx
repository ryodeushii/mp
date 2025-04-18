import { Container, Graphics, Text } from "@mp/pixi";
import { Vector } from "@mp/math";
import { Pixi } from "@mp/solid-pixi";
import { createEffect, createMemo, Show } from "solid-js";
import type { Tile } from "@mp/std";
import type { TiledResource } from "../../shared/area/tiled-resource";
import type { Actor } from "../../server/traits/actor";
import { useAnimatedCoords } from "./use-animated-coords";

export function Actor(props: { tiled: TiledResource; actor: Actor }) {
  const coords = useAnimatedCoords(
    () => props.actor.coords,
    () => props.actor.path,
    () => props.actor.speed,
    () => 2 as Tile, // Magic number, no reason other than it seems to work well
  );

  const position = createMemo(() => props.tiled.tileCoordToWorld(coords()));

  const container = new Container();
  const gfx = new Graphics();
  const text = new Text({ scale: 0.25, anchor: { x: 0.5, y: 0 } });
  container.addChild(gfx);
  container.addChild(text);

  createEffect(() => {
    const { hitBox, opacity, color } = props.actor;
    const { x: width, y: height } = props.tiled.tileSize.scale(
      new Vector(hitBox.width, hitBox.height),
    );

    gfx.clear();
    gfx.fillStyle.color = color;
    container.alpha = opacity ?? 1;
    gfx.rect(-width / 2, -height / 2, width, height);
    gfx.fill();
  });

  createEffect(() => {
    const { name, health, maxHealth } = props.actor;
    text.text = name + `\n${health}/${maxHealth}`;
  });

  return (
    <Show when={position()}>
      {(pos) => <Pixi label="Actor" as={container} position={pos()} />}
    </Show>
  );
}
