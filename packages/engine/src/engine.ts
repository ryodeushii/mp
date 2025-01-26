import { TimeSpan } from "@mp/time";
import type { Vector } from "@mp/math";
import type { Pixel } from "@mp/std";
import { Camera } from "./camera";
import { PointerForCamera } from "./pointer";
import { Keyboard } from "./keyboard";

export class Engine {
  #previousFrameTime = performance.now();
  #previousFrameDuration = TimeSpan.Zero;
  #isRunning = false;
  pointer: PointerForCamera;
  keyboard: Keyboard;
  #viewportSizeObserver?: ResizeObserver;
  #frameCallbacks = new Set<FrameCallback>();

  get frameCallbackCount() {
    return this.#frameCallbacks.size;
  }

  readonly camera: Camera;

  constructor(private readonly viewport: HTMLElement) {
    this.camera = new Camera(elementSize(viewport));
    this.pointer = new PointerForCamera(viewport, this.camera);
    this.keyboard = new Keyboard(window);
  }

  start = () => {
    this.pointer.start();
    this.keyboard.start();
    this.#isRunning = true;
    requestAnimationFrame(this.nextFrame);
    this.#viewportSizeObserver = new ResizeObserver(this.onViewportResized);
    this.#viewportSizeObserver.observe(this.viewport);
  };

  stop = () => {
    this.pointer.stop();
    this.keyboard.stop();
    this.#isRunning = false;
    this.#viewportSizeObserver?.disconnect();
    this.#viewportSizeObserver = undefined;
  };

  // Note: Explicit callback based frame reactivity because implicit
  // reactivity for rendering is error prone and hard to reason about.
  addFrameCallback(callback: FrameCallback) {
    this.#frameCallbacks.add(callback);
    return () => this.#frameCallbacks.delete(callback);
  }

  private nextFrame: FrameRequestCallback = () => {
    const thisFrameTime = performance.now();
    const timeSinceLastFrame = TimeSpan.fromMilliseconds(
      thisFrameTime - this.#previousFrameTime,
    );
    this.#previousFrameTime = thisFrameTime;

    for (const callback of this.#frameCallbacks) {
      callback(timeSinceLastFrame, this.#previousFrameDuration);
    }

    this.#previousFrameDuration = TimeSpan.fromMilliseconds(
      performance.now() - thisFrameTime,
    );

    if (this.#isRunning) {
      requestAnimationFrame(this.nextFrame);
    }
  };

  private onViewportResized = () => {
    this.camera.cameraSize = elementSize(this.viewport);
  };
}

function elementSize(element: HTMLElement): Vector<Pixel> {
  return {
    get x() {
      return element.clientWidth as Pixel;
    },
    get y() {
      return element.clientHeight as Pixel;
    },
  };
}

export type FrameCallback = (
  deltaTime: TimeSpan,
  previousFrameDuration: TimeSpan,
) => unknown;
