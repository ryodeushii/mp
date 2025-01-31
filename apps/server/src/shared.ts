import type { Tile } from "@mp/std";

// This file should only expose runtime code that is shared between client/server.

// This should end up being primarily constants and utility functions.
export const tokenHeaderName = "token";

/**
 * Diameter in tiles around the player that determines what a player can see and the zoom level of the camera.
 * We have one number for rendering and one for networking to allow for some margin
 * in the renderer so that objects don't pop in and out of view.
 */
export const clientViewDistance = {
  renderedTileCount: 66 as Tile,
  networkFogOfWarTileCount: 99 as Tile,
};

export { default as transformer } from "superjson";
