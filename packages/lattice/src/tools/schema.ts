import type { StandardSchemaV1 } from "@standard-schema/spec";

export type JsonSchemaLike = Record<string, unknown>;

/**
 * Convert a Standard Schema to a JSON Schema-shaped descriptor for native
 * provider tools and structured-output hints. Schema libraries may expose
 * `toJSONSchema()` on the schema object; when absent we fall back to a valid
 * object schema and keep vendor metadata inspectable.
 */
export function standardSchemaToJsonSchema(schema: StandardSchemaV1): JsonSchemaLike {
  const maybeToJson = (schema as unknown as { readonly toJSONSchema?: () => unknown })
    .toJSONSchema;
  if (typeof maybeToJson === "function") {
    try {
      const converted = maybeToJson();
      if (isRecord(converted)) {
        return converted;
      }
    } catch {
      // fall through to placeholder
    }
  }

  const standardSchema = (schema as unknown as { readonly "~standard"?: unknown })["~standard"];
  if (isRecord(standardSchema) && typeof standardSchema.vendor === "string") {
    return {
      $comment: `standard-schema vendor: ${standardSchema.vendor}; toJSONSchema not available`,
      type: "object",
    };
  }

  return { $comment: "non-standard-schema input", type: "object" };
}

export const toolSchemaToJsonSchema = standardSchemaToJsonSchema;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
