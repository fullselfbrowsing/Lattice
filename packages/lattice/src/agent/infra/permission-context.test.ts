import { describe, expect, it } from "vitest";

import { BAND, createHookPipeline } from "../../contract/bands.js";

import {
  createPermissionContext,
  createPermissionGuardHook,
  permissionGuardRegisterOptions,
} from "./permission-context.js";

describe("createPermissionContext — decide", () => {
  it("allows by default when no rule matches", () => {
    const pc = createPermissionContext([]);
    expect(pc.decide({ toolName: "anything", iterationIndex: 0 })).toEqual({ allow: true });
  });

  it("first matching rule wins", () => {
    const pc = createPermissionContext([
      { toolName: "search", verdict: "deny", reason: "no searches in this scope" },
      { toolName: /^.*$/u, verdict: "allow" },
    ]);
    expect(pc.decide({ toolName: "search", iterationIndex: 0 }).allow).toBe(false);
    expect(pc.decide({ toolName: "calc", iterationIndex: 0 }).allow).toBe(true);
  });

  it("supports regex toolName matching", () => {
    const pc = createPermissionContext([
      { toolName: /^fs-/u, verdict: "deny", reason: "fs-* gated" },
    ]);
    expect(pc.decide({ toolName: "fs-read", iterationIndex: 0 }).allow).toBe(false);
    expect(pc.decide({ toolName: "calc", iterationIndex: 0 }).allow).toBe(true);
  });

  it("rule's resource matcher narrows further", () => {
    const pc = createPermissionContext([
      { toolName: "search", resource: "secret", verdict: "deny" },
      { toolName: "search", verdict: "allow" },
    ]);
    expect(pc.decide({ toolName: "search", iterationIndex: 0, resource: "secret" }).allow).toBe(false);
    expect(pc.decide({ toolName: "search", iterationIndex: 0, resource: "public" }).allow).toBe(true);
  });

  it("returns a default deny reason when none is supplied", () => {
    const pc = createPermissionContext([{ toolName: "x", verdict: "deny" }]);
    const v = pc.decide({ toolName: "x", iterationIndex: 0 });
    expect(v.allow).toBe(false);
    if (!v.allow) expect(v.reason).toContain("denied by permission rule");
  });
});

describe("createPermissionGuardHook — integration with bands pipeline", () => {
  it("denies via controls.deny when the rule fires", async () => {
    const pc = createPermissionContext([
      { toolName: "delete", verdict: "deny", reason: "delete is gated" },
    ]);
    const pipeline = createHookPipeline();
    pipeline.register("BEFORE_TOOL", createPermissionGuardHook(pc), permissionGuardRegisterOptions());
    await pipeline.run("BEFORE_TOOL", { iterationIndex: 0, toolName: "delete" });
    expect(pipeline.lastDenialReason()).toBe("delete is gated");
  });

  it("does NOT deny when no rule matches", async () => {
    const pc = createPermissionContext([
      { toolName: "delete", verdict: "deny" },
    ]);
    const pipeline = createHookPipeline();
    pipeline.register("BEFORE_TOOL", createPermissionGuardHook(pc), permissionGuardRegisterOptions());
    await pipeline.run("BEFORE_TOOL", { iterationIndex: 0, toolName: "search" });
    expect(pipeline.lastDenialReason()).toBeNull();
  });

  it("permissionGuardRegisterOptions registers at BAND.SAFETY", () => {
    expect(permissionGuardRegisterOptions().band).toBe(BAND.SAFETY);
  });
});
