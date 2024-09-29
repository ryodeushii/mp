import type { Container } from "@mp/pixi";
import type { TimeSpan } from "@mp/time";
import type { Vector } from "@mp/math";
import { moveAlongPath } from "@mp/data";

export class Interpolator {
  private pathInterpolation?: PathIntepolation;
  private needsInitialPosition = true;

  constructor(private target: Container) {}

  configure(
    staticPosition: Vector,
    pathInterpolation?: PathIntepolation,
  ): void {
    this.pathInterpolation = pathInterpolation;
    if (!pathInterpolation || this.needsInitialPosition) {
      const pos = this.target.position;
      pos.x = staticPosition.x;
      pos.y = staticPosition.y;
      this.needsInitialPosition = false;
    }
  }

  update(deltaTime: TimeSpan) {
    if (!this.pathInterpolation) {
      return;
    }

    const { destinationReached } = moveAlongPath(
      this.target.position,
      this.pathInterpolation.path,
      this.pathInterpolation.speed,
      deltaTime,
    );

    if (destinationReached) {
      this.pathInterpolation = undefined;
    }
  }
}

type PathIntepolation = { path: Vector[]; speed: number };
