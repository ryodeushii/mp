import type { Container } from "@mp/pixi";
import { createContext } from "solid-js";

export const ParentContext = createContext<Container>(
  new Proxy({} as Container, {
    get() {
      throw new Error("ParentContext not provided");
    },
  }),
);
