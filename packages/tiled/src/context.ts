export type JsonLoader = (path: string) => Promise<unknown>;

export interface LoaderContext {
  loadMap: JsonLoader;
  loadTileset: JsonLoader;
}
