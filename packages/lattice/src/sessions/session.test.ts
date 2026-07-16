import { describe, expect, it } from "vitest";

import { artifact, toArtifactRef } from "../artifacts/artifact.js";
import { createMemorySessionStore } from "./session.js";

describe("createMemorySessionStore scope", () => {
  it("preserves scope through create, save, and load", async () => {
    const store = createMemorySessionStore();
    const created = await store.create({
      id: "session:scoped",
      tenantId: "tenant:a",
      privacy: "restricted",
      retention: "durable",
    });
    const saved = await store.save({
      ...created,
      branchPointRunId: "run:1",
    });

    expect(saved).toMatchObject({
      tenantId: "tenant:a",
      privacy: "restricted",
      retention: "durable",
    });
    await expect(store.load(created.id)).resolves.toEqual(saved);
  });

  it("inherits record scope onto appended turns", async () => {
    const store = createMemorySessionStore();
    await store.create({
      id: "session:append",
      tenantId: "tenant:a",
      privacy: "sensitive",
      retention: "session",
    });
    const inputRef = toArtifactRef(artifact.text("input", { id: "artifact:input" }));
    const outputRef = toArtifactRef(artifact.text("output", { id: "artifact:output" }));
    const appended = await store.appendTurn({
      sessionId: "session:append",
      task: "continue",
      artifactRefs: [inputRef],
      outputArtifactRefs: [outputRef],
      planId: "plan:1",
      tenantId: "tenant:a",
      privacy: "sensitive",
      retention: "session",
    });

    expect(appended.turns[0]).toMatchObject({
      task: "continue",
      tenantId: "tenant:a",
      privacy: "sensitive",
      retention: "session",
      planId: "plan:1",
    });
    expect(appended.artifactRefs.map((ref) => ref.id)).toEqual([
      "artifact:input",
      "artifact:output",
    ]);
  });

  it("inherits parent scope when branching", async () => {
    const store = createMemorySessionStore();
    await store.create({
      id: "session:parent",
      tenantId: "tenant:a",
      privacy: "restricted",
      retention: "durable",
    });
    await store.appendTurn({
      sessionId: "session:parent",
      task: "parent turn",
      artifactRefs: [],
      tenantId: "tenant:a",
      privacy: "restricted",
      retention: "durable",
    });

    const branch = await store.branch("session:parent", {
      id: "session:branch",
      branchPointRunId: "run:branch",
    });

    expect(branch).toMatchObject({
      id: "session:branch",
      parentId: "session:parent",
      branchPointRunId: "run:branch",
      tenantId: "tenant:a",
      privacy: "restricted",
      retention: "durable",
    });
    expect(branch.turns).toHaveLength(1);
  });

  it.each([
    ["tenant", { tenantId: "tenant:b" }],
    ["privacy", { privacy: "standard" as const }],
    ["retention", { retention: "none" as const }],
  ])("rejects a conflicting explicit %s branch scope", async (_name, scope) => {
    const store = createMemorySessionStore();
    await store.create({
      id: "session:parent",
      tenantId: "tenant:a",
      privacy: "restricted",
      retention: "durable",
    });

    await expect(
      store.branch("session:parent", {
        id: "session:branch",
        ...scope,
      }),
    ).rejects.toThrow("Session branch scope conflicts");
    await expect(store.load("session:branch")).resolves.toBeUndefined();
  });

  it("rejects promoting legacy unscoped records during append or branch", async () => {
    const store = createMemorySessionStore();
    await store.create({ id: "session:legacy" });

    await expect(
      store.appendTurn({
        sessionId: "session:legacy",
        task: "scoped continuation",
        artifactRefs: [],
        tenantId: "tenant:a",
      }),
    ).rejects.toThrow("Session append scope conflicts on tenantId");
    await expect(
      store.branch("session:legacy", {
        id: "session:scoped-branch",
        tenantId: "tenant:a",
      }),
    ).rejects.toThrow("Session branch scope conflicts on tenantId");
  });
});
