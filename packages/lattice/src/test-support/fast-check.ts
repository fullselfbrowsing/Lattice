import { createRequire } from "node:module";

interface FastCheckArbitrary<T> {
  readonly __latticeFastCheckType?: T;
}

interface FastCheckLengthConstraints {
  readonly minLength?: number;
  readonly maxLength?: number;
}

interface FastCheckAssertOptions {
  readonly numRuns?: number;
}

interface FastCheckLite {
  readonly assert: (
    property: unknown,
    options?: FastCheckAssertOptions,
  ) => void | Promise<void>;
  readonly asyncProperty: <T>(
    arbitrary: FastCheckArbitrary<T>,
    predicate: (value: T) => Promise<void>,
  ) => unknown;
  readonly array: <T>(
    arbitrary: FastCheckArbitrary<T>,
    constraints?: FastCheckLengthConstraints,
  ) => FastCheckArbitrary<T[]>;
  readonly string: (
    constraints?: FastCheckLengthConstraints,
  ) => FastCheckArbitrary<string>;
}

const require = createRequire(import.meta.url);

// fast-check@4.7.0 ships declarations that TS 6 rejects under skipLibCheck:false.
// Tests only need this small runtime surface, so avoid importing its .d.ts file.
export const fc = require("fast-check") as FastCheckLite;
