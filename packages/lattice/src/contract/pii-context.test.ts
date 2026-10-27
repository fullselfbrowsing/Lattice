import { describe, expect, it } from "vitest";
import { defaultPiiDetectors, type PiiDetector } from "./pii-detectors.js";
import { inv } from "./invariants.js";
import { evaluateTripwires } from "./tripwire.js";

const detector = (name: string) => defaultPiiDetectors.find((item) => item.name === name)!;
const contextual = { contextual: true };

describe("PII extraction and contextual detection", () => {
  it("enumerates distinct values with UTF-16 offsets, without changing detect's shape", () => {
    const text = "😀 a@example.com and b@example.net then a@example.com";
    const email = detector("email");
    const spans = email.findAll!(text);
    expect(spans.map((span) => span.substring)).toEqual([
      "a@example.com", "b@example.net", "a@example.com",
    ]);
    expect(spans[0]?.start).toBe(3);
    for (const span of spans) expect(text.slice(span.start, span.end)).toBe(span.substring);
    expect(email.detect(text)).toEqual({ matched: true, substring: "a@example.com" });
  });

  it("does not copy a matched substring to a different, suppressed context", () => {
    const text = "ref 219-09-9999; SSN 219-09-9999";
    const hits = detector("us-ssn").findAll!(text);
    expect(hits).toEqual([{ start: 21, end: 32, substring: "219-09-9999" }]);
  });

  it("enumerates separated cards and never repeats an offset", () => {
    const text = "Cards 4111111111111111, 5555555555554444";
    const hits = detector("credit-card").findAll!(text);
    expect(hits.map((hit) => hit.substring)).toEqual(["4111111111111111", "5555555555554444"]);
    expect(new Set(hits.map((hit) => hit.start + ":" + hit.end)).size).toBe(hits.length);
  });

  it("keeps E.164 and support phrases opt-in", () => {
    const phone = detector("us-phone");
    for (const text of [
      "Phone +14155551234", "Please call the customer at 4155551234",
      "Customer support: 4155551234", "Support line 4155551234",
    ]) {
      expect(phone.detect(text).matched).toBe(false);
      expect(phone.detect(text, contextual).matched).toBe(true);
      expect(phone.findAll!(text, contextual)).toHaveLength(1);
    }
  });

  it("does not broaden a cue past an arbitrary word, sentence, line, or identifier", () => {
    const phone = detector("us-phone");
    for (const text of [
      "call the customer account 4155551234",
      "call the customer. 4155551234",
      "call the customer\n4155551234",
      "call duration 4155551234",
      "support case 4155551234",
      "customer account 4155551234",
      "order +141555512345",
      "x+14155551234",
    ]) expect(phone.detect(text, contextual).matched).toBe(false);
  });

  it("uses recognized structured fields only on explicit opt-in", async () => {
    const data = { answer: { socialSecurityNumber: "219099999", phone: "4155551234" } };
    expect((await evaluateTripwires(data, [inv.noPII("answer")])).ok).toBe(true);
    expect((await evaluateTripwires(data, [inv.noPII("answer", contextual)])).ok).toBe(false);
    expect((await evaluateTripwires(data, [inv.noPII("answer.socialSecurityNumber", contextual)])).ok).toBe(false);
    expect((await evaluateTripwires({ rows: [data.answer] }, [inv.noPII("rows[*].phone", contextual)])).ok).toBe(false);
  });

  it("does not leak a neighboring or parent object's field cue", async () => {
    const data = { ssn: { value: "219099999" }, phone: "unavailable", count: "4155551234" };
    expect((await evaluateTripwires(data, [inv.noPII("", contextual)])).ok).toBe(true);
  });

  it("revisits an aliased array under a different field cue", async () => {
    const shared = ["219099999"];
    const data = { count: shared, ssn: shared };
    const result = await evaluateTripwires(data, [inv.noPII("", contextual)]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.evidence.observed).toMatchObject({ foundAt: "ssn[0]" });
  });

  it("still terminates on cycles in contextual mode", async () => {
    const data: Record<string, unknown> = {};
    data["loop"] = data;
    data["phone"] = "4155551234";
    expect((await evaluateTripwires(data, [inv.noPII("", contextual)])).ok).toBe(false);
  });

  it("retains custom detectors without findAll or a context parameter", async () => {
    const custom: PiiDetector = {
      name: "custom",
      detect: (text) => text.includes("secret")
        ? { matched: true, substring: "secret" } : { matched: false },
    };
    expect((await evaluateTripwires({ value: "secret" }, [inv.noPII("", contextual)], [custom])).ok).toBe(false);
  });

  it("omits unused options from old declarations and signs explicit opt-in", () => {
    expect(inv.noPII("answer", { id: "fixed" })).toEqual({
      id: "fixed", kind: "no-pii", path: "answer",
    });
    expect(inv.noPII("answer", { id: "fixed", contextual: true })).toEqual({
      id: "fixed", kind: "no-pii", path: "answer", contextual: true,
    });
    expect(() => inv.noPII("", { contextual: "yes" as never })).toThrow(TypeError);
  });
});
