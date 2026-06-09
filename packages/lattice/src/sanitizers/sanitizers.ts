import type { StandardSchemaV1 } from "@standard-schema/spec";

export interface SanitizerContext {
  readonly providerId: string;
  readonly modelId?: string;
  readonly outputName: string;
}

export type SanitizerFn = (
  text: string,
  context: SanitizerContext,
) => string | Promise<string>;

export type SanitizeOutputOption = SanitizerFn | readonly SanitizerFn[];

export interface InternalEnvelopeOptions {
  readonly field?: string;
  readonly path?: string;
  readonly schema?: StandardSchemaV1;
}

type ParsedEnvelopeOptions =
  | { readonly kind: "path"; readonly path: readonly string[]; readonly schema?: StandardSchemaV1 }
  | { readonly kind: "schema"; readonly schema: StandardSchemaV1 };

export async function applyOutputSanitizers(
  rawOutputs: Record<string, unknown>,
  sanitizeOutput: SanitizeOutputOption | undefined,
  context: Omit<SanitizerContext, "outputName">,
): Promise<Record<string, unknown>> {
  if (sanitizeOutput === undefined) return rawOutputs;

  const sanitizers = Array.isArray(sanitizeOutput) ? sanitizeOutput : [sanitizeOutput];
  const sanitizedEntries = await Promise.all(
    Object.entries(rawOutputs).map(async ([outputName, value]) => {
      if (typeof value !== "string") {
        return [outputName, value] as const;
      }

      let sanitized = value;
      const sanitizerContext: SanitizerContext = {
        ...context,
        outputName,
      };
      for (const sanitizer of sanitizers) {
        sanitized = await sanitizer(sanitized, sanitizerContext);
      }
      return [outputName, sanitized] as const;
    }),
  );

  return Object.fromEntries(sanitizedEntries);
}

export function stripReasoningTags(): SanitizerFn {
  return (text) => {
    let next = text;

    next = next.replace(
      /^\s*(?:reasoning|analysis|scratchpad)\s*:\s*(?:.|\n)*?(?:\n\s*(?:final|answer)\s*:\s*)/iu,
      "",
    );
    next = stripDelimitedBlock(next, "think");
    next = stripDelimitedBlock(next, "reasoning");
    next = stripDelimitedBlock(next, "scratchpad");

    return next === text ? text : next.trim();
  };
}

export function stripChatTemplateArtifacts(): SanitizerFn {
  return (text) => {
    let next = text;

    next = next.replace(/<\|im_start\|>\s*(?:system|user|assistant)?\s*/giu, "");
    next = next.replace(/\s*<\|im_end\|>/giu, "");
    next = next.replace(/\[\/?INST\]/giu, "");
    next = next.replace(/<<SYS>>|<<\/SYS>>/giu, "");
    next = next.replace(/^\s*(?:system|user|assistant)\s*:\s*/iu, "");

    return next === text ? text : next.trim();
  };
}

export function unwrapInternalEnvelope(
  schemaOrPath: string | InternalEnvelopeOptions | StandardSchemaV1,
): SanitizerFn {
  const options = parseEnvelopeOptions(schemaOrPath);

  return async (text) => {
    const parsed = parseJsonObject(text);
    if (parsed === undefined) return text;

    if (options.schema !== undefined) {
      const validation = await validateSchema(options.schema, parsed);
      if (!validation.ok) return text;
    }

    const value = options.kind === "path"
      ? getPathValue(parsed, options.path)
      : findOnlyStringField(parsed);

    return typeof value === "string" ? value : text;
  };
}

function stripDelimitedBlock(text: string, tag: string): string {
  const pattern = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "giu");
  return text.replace(pattern, "");
}

function parseEnvelopeOptions(
  schemaOrPath: string | InternalEnvelopeOptions | StandardSchemaV1,
): ParsedEnvelopeOptions {
  if (typeof schemaOrPath === "string") {
    return { kind: "path", path: splitPath(schemaOrPath) };
  }

  if (isStandardSchema(schemaOrPath)) {
    return { kind: "schema", schema: schemaOrPath };
  }

  const path = schemaOrPath.path ?? schemaOrPath.field;
  if (path !== undefined) {
    return {
      kind: "path",
      path: splitPath(path),
      ...(schemaOrPath.schema !== undefined ? { schema: schemaOrPath.schema } : {}),
    };
  }

  if (schemaOrPath.schema !== undefined) {
    return { kind: "schema", schema: schemaOrPath.schema };
  }

  return { kind: "path", path: [] };
}

function splitPath(path: string): readonly string[] {
  return path.split(".").map((part) => part.trim()).filter(Boolean);
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }

  return parsed as Record<string, unknown>;
}

function getPathValue(
  value: Record<string, unknown>,
  path: readonly string[],
): unknown {
  if (path.length === 0) return undefined;

  let current: unknown = value;
  for (const segment of path) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return undefined;
    }

    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function findOnlyStringField(value: Record<string, unknown>): string | undefined {
  const stringValues = Object.values(value).filter((field): field is string => typeof field === "string");
  return stringValues.length === 1 ? stringValues[0] : undefined;
}

async function validateSchema(
  schema: StandardSchemaV1,
  value: unknown,
): Promise<{ readonly ok: true } | { readonly ok: false }> {
  const result = schema["~standard"].validate(value);
  const resolved = result instanceof Promise ? await result : result;
  return "issues" in resolved ? { ok: false } : { ok: true };
}

function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    "~standard" in value &&
    typeof (value as { readonly "~standard"?: { readonly validate?: unknown } })["~standard"]
      ?.validate === "function"
  );
}
