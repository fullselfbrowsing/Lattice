import type { StandardSchemaV1 } from "@standard-schema/spec";

import { isArtifactRef, toArtifactRef } from "../artifacts/artifact.js";
import type { ResultPlan } from "../plan/plan.js";
import type { ValidationError, ValidationIssue } from "../results/errors.js";
import type { RunResult } from "../results/result.js";
import type { OutputContract, OutputContractMap } from "./contracts.js";
import type { InferOutputMap } from "./infer.js";

export type OutputMapValidationResult<TOutputs extends OutputContractMap> =
  | {
      readonly ok: true;
      readonly outputs: InferOutputMap<TOutputs>;
    }
  | {
      readonly ok: false;
      readonly error: ValidationError;
      readonly raw: Record<string, unknown>;
      readonly partialOutputs: Record<string, unknown>;
    };

export async function validateSchemaOutput<S extends StandardSchemaV1>(
  name: string,
  schema: S,
  value: unknown,
): Promise<
  | { readonly ok: true; readonly value: StandardSchemaV1.InferOutput<S> }
  | {
      readonly ok: false;
      readonly issue: {
        readonly ["output"]: string;
        readonly issues: readonly ValidationIssue[];
      };
    }
> {
  const result = schema["~standard"].validate(value);
  const validation = result instanceof Promise ? await result : result;

  if (validation.issues) {
    return {
      ok: false,
      issue: {
        ["output"]: name,
        issues: validation.issues.map(normalizeIssue),
      },
    };
  }

  return {
    ok: true,
    value: validation.value,
  };
}

export async function validateOutputMap<TOutputs extends OutputContractMap>(
  contracts: TOutputs,
  rawOutputs: Record<string, unknown>,
  plan: ResultPlan,
): Promise<RunResult<TOutputs>> {
  const validation = await validateOutputMapValues(contracts, rawOutputs);

  if (!validation.ok) {
    return {
      ok: false,
      error: validation.error,
      usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
      raw: validation.raw,
      partialOutputs: validation.partialOutputs,
      plan,
    };
  }

  return {
    ok: true,
    outputs: validation.outputs,
    artifacts: [],
    usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
    plan,
  };
}

export async function validateOutputMapValues<TOutputs extends OutputContractMap>(
  contracts: TOutputs,
  rawOutputs: Record<string, unknown>,
): Promise<OutputMapValidationResult<TOutputs>> {
  const outputs: Record<string, unknown> = {};

  for (const [name, contract] of Object.entries(contracts)) {
    const value = rawOutputs[name];
    const issue = await validateOutput(name, contract, value);

    if (!issue.ok) {
      return {
        ok: false,
        error: {
          kind: "validation",
          message: `Invalid output "${name}".`,
          ["output"]: name,
          issues: issue.issues,
        },
        raw: rawOutputs,
        partialOutputs: outputs,
      };
    }

    outputs[name] = issue.value;
  }

  return {
    ok: true,
    outputs: outputs as InferOutputMap<TOutputs>,
  };
}

async function validateOutput(
  name: string,
  contract: OutputContract,
  value: unknown,
): Promise<
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] }
> {
  if (contract === "text") {
    if (typeof value !== "string") {
      return {
        ok: false,
        issues: [{ message: "Expected text output to be a string." }],
      };
    }

    return { ok: true, value };
  }

  if (isStandardSchema(contract)) {
    const result = await validateSchemaOutput(name, contract, value);

    if (!result.ok) {
      return {
        ok: false,
        issues: result.issue.issues,
      };
    }

    return { ok: true, value: result.value };
  }

  if (contract.kind === "citations") {
    if (!Array.isArray(value)) {
      return {
        ok: false,
        issues: [{ message: "Expected citations output to be an array." }],
      };
    }

    return { ok: true, value };
  }

  if (contract.kind === "artifacts") {
    if (!Array.isArray(value)) {
      return {
        ok: false,
        issues: [{ message: "Expected artifacts output to be an array." }],
      };
    }

    for (const item of value) {
      if (!isArtifactRef(item)) {
        return {
          ok: false,
          issues: [{ message: "Expected artifacts output item to be an artifact ref." }],
        };
      }

      if (contract.artifactKind !== undefined && item.kind !== contract.artifactKind) {
        return {
          ok: false,
          issues: [
            {
              message: `Expected artifacts output item kind to be "${contract.artifactKind}".`,
            },
          ],
        };
      }
    }

    return { ok: true, value: value.map(toArtifactRef) };
  }

  return {
    ok: false,
    issues: [{ message: "Unsupported output contract." }],
  };
}

function isStandardSchema(contract: OutputContract): contract is StandardSchemaV1 {
  if (typeof contract !== "object" || contract === null) {
    return false;
  }

  const standard = (contract as { readonly "~standard"?: { readonly validate?: unknown } })[
    "~standard"
  ];

  return typeof standard?.validate === "function";
}

function normalizeIssue(issue: StandardSchemaV1.Issue): ValidationIssue {
  const path = issue.path
    ?.map(normalizePathSegment)
    .filter((segment): segment is string | number | symbol => segment !== undefined);

  return {
    message: issue.message,
    ...(path !== undefined && path.length > 0 ? { path } : {}),
  };
}

function normalizePathSegment(
  segment: PropertyKey | StandardSchemaV1.PathSegment,
): string | number | symbol | undefined {
  if (
    typeof segment === "string" ||
    typeof segment === "number" ||
    typeof segment === "symbol"
  ) {
    return segment;
  }

  return normalizePathKey(segment.key);
}

function normalizePathKey(key: PropertyKey): string | number | symbol {
  return key;
}
