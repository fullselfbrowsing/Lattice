import { describe, expect, it } from "vitest";

import type { StandardSchemaV1 } from "@standard-schema/spec";

import { defineTool } from "../../tools/tools.js";

import { defineAgent, type AgentSpec } from "./agent-spec.js";

/**
 * `~standard` stub schema — the examples/agent-loop/setup.mjs:54-60 pattern.
 * Stubs that pass validation must omit `issues` entirely.
 */
function makeSchema(): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "test-stub",
      validate: (value: unknown) => ({ value: value as never }),
    } as never,
  } as StandardSchemaV1;
}

function makeTool(name: string) {
  return defineTool({
    name,
    inputSchema: makeSchema(),
    execute: () => "ok",
  });
}

describe("defineAgent — kind discriminant", () => {
  it("returns { kind: \"agent\", ...fields } with the literal discriminant", () => {
    const schema = makeSchema();
    const spec = defineAgent({
      id: "researcher",
      intent: "Research the topic and summarize findings.",
      tools: [],
      summaryReturnSchema: schema,
    });
    expect(spec.kind).toBe("agent");
    expect(spec.id).toBe("researcher");
    expect(spec.intent).toBe("Research the topic and summarize findings.");
    expect(spec.tools).toEqual([]);
    expect(spec.summaryReturnSchema).toBe(schema);
  });
});

describe("defineAgent — tree composition by value", () => {
  it("round-trips a nested childAgents tree structurally without mutating inputs", () => {
    const schema = makeSchema();
    const grandchild = defineAgent({
      id: "grandchild",
      intent: "Leaf task.",
      tools: [],
      summaryReturnSchema: schema,
    });
    const childA = defineAgent({
      id: "child-a",
      intent: "Child A task.",
      tools: [makeTool("lookup")],
      childAgents: [grandchild],
      summaryReturnSchema: schema,
    });
    const childB = defineAgent({
      id: "child-b",
      intent: "Child B task.",
      tools: [],
      summaryReturnSchema: schema,
    });
    const childABefore = structuredClone({ id: childA.id, intent: childA.intent, kind: childA.kind });
    const parent = defineAgent({
      id: "parent",
      intent: "Coordinate children.",
      tools: [],
      childAgents: [childA, childB],
      summaryReturnSchema: schema,
    });

    // Deep structural round-trip: children compose by value as a tree.
    expect(parent.childAgents).toEqual([childA, childB]);
    expect(parent.childAgents?.[0]?.childAgents?.[0]).toEqual(grandchild);
    expect(parent.childAgents?.[0]?.childAgents?.[0]?.id).toBe("grandchild");

    // Inputs are not mutated by composition.
    expect({ id: childA.id, intent: childA.intent, kind: childA.kind }).toEqual(childABefore);
    expect(childA.kind).toBe("agent");
    expect(childB.kind).toBe("agent");
  });
});

describe("defineAgent — optional members", () => {
  it("does not emit undefined-valued keys for absent optional members", () => {
    const spec = defineAgent({
      id: "minimal",
      intent: "Minimal spec.",
      tools: [],
      summaryReturnSchema: makeSchema(),
    });
    const keys = Object.keys(spec);
    expect(keys).not.toContain("childAgents");
    expect(keys).not.toContain("contract");
    expect(keys.sort()).toEqual(["id", "intent", "kind", "summaryReturnSchema", "tools"]);
  });
});

describe("defineAgent — ~standard stub schema acceptance", () => {
  it("accepts a ~standard stub schema for summaryReturnSchema", () => {
    const stub = {
      "~standard": {
        version: 1,
        vendor: "showcase-stub",
        validate: (value: unknown) => ({ value }),
      },
    } as unknown as StandardSchemaV1;
    const spec: AgentSpec = defineAgent({
      id: "stub-schema-agent",
      intent: "Accepts a stub schema.",
      tools: [],
      summaryReturnSchema: stub,
    });
    expect(spec.summaryReturnSchema).toBe(stub);
    const standard = (spec.summaryReturnSchema as unknown as {
      readonly "~standard": { readonly vendor: string };
    })["~standard"];
    expect(standard.vendor).toBe("showcase-stub");
  });
});
