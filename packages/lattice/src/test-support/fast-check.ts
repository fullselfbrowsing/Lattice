import { createRequire } from "node:module";

interface FastCheckArbitrary<T> {
  readonly __latticeFastCheckType?: T;
}

interface FastCheckLengthConstraints {
  readonly minLength?: number;
  readonly maxLength?: number;
}

interface FastCheckIntegerConstraints {
  readonly min?: number;
  readonly max?: number;
}

type FastCheckRecord<T extends Record<string, FastCheckArbitrary<unknown>>> = {
  [K in keyof T]: T[K] extends FastCheckArbitrary<infer TValue>
    ? TValue
    : never;
};

interface FastCheckAssertOptions {
  readonly numRuns?: number;
}

interface FastCheckLite {
  readonly assert: (
    property: unknown,
    options?: FastCheckAssertOptions,
  ) => void | Promise<void>;
  readonly asyncProperty: {
    <T>(
      arbitrary: FastCheckArbitrary<T>,
      predicate: (value: T) => Promise<void>,
    ): unknown;
    <TFirst, TSecond>(
      first: FastCheckArbitrary<TFirst>,
      second: FastCheckArbitrary<TSecond>,
      predicate: (first: TFirst, second: TSecond) => Promise<void>,
    ): unknown;
  };
  readonly array: <T>(
    arbitrary: FastCheckArbitrary<T>,
    constraints?: FastCheckLengthConstraints,
  ) => FastCheckArbitrary<T[]>;
  readonly string: (
    constraints?: FastCheckLengthConstraints,
  ) => FastCheckArbitrary<string>;
  readonly integer: (
    constraints?: FastCheckIntegerConstraints,
  ) => FastCheckArbitrary<number>;
  readonly record: <T extends Record<string, FastCheckArbitrary<unknown>>>(
    model: T,
  ) => FastCheckArbitrary<FastCheckRecord<T>>;
  readonly constantFrom: <T>(...values: readonly T[]) => FastCheckArbitrary<T>;
  readonly uniqueArray: <T>(
    arbitrary: FastCheckArbitrary<T>,
    constraints?: FastCheckLengthConstraints,
  ) => FastCheckArbitrary<T[]>;
}

const require = createRequire(import.meta.url);

// fast-check@4.7.0 ships declarations that TS 6 rejects under skipLibCheck:false.
// Tests only need this small runtime surface, so avoid importing its .d.ts file.
export const fc = require("fast-check") as FastCheckLite;
