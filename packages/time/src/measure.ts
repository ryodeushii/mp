import { TimeSpan } from "timespan-ts";

/**
 * Begins measuring the time span.
 * @returns A function that returns the time span since the call to `measureTimeSpan`.
 */
export function measureTimeSpan(): TimespanMeasureFn {
  const start = performance.now();
  return function getMeasurement() {
    return TimeSpan.fromMilliseconds(performance.now() - start);
  };
}

export type TimespanMeasureFn = () => TimeSpan;
