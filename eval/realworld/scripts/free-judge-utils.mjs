export function parseJudge(answer) {
  const fence = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(answer);
  let value;
  try { value = JSON.parse(fence ? fence[1] : answer); } catch { return { judgeValid: false, judgeWrappedJson: !!fence }; }
  const valid = typeof value?.answerCorrect === "boolean" && typeof value?.abstained === "boolean"
    && Array.isArray(value.claims) && value.claims.every((c) => typeof c?.supported === "boolean" && typeof c.cited === "boolean"
      && Number.isSafeInteger(c.citationCount) && Number.isSafeInteger(c.relevantCitations)
      && c.relevantCitations >= 0 && c.relevantCitations <= c.citationCount);
  return { judgeValid: valid, judgeWrappedJson: !!fence,
    ...(valid ? { claims: value.claims, answerCorrect: value.answerCorrect, abstained: value.abstained } : {}) };
}

/** Serialize submission slots while allowing independent HTTP requests to overlap. */
export function createJudgePacer({ lastStartedAt = 0, intervalMs = 3200, now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  let tail = Promise.resolve();
  let notBefore = 0;
  return {
    defer(ms) { if (Number.isFinite(ms) && ms > 0) notBefore = Math.max(notBefore, now() + ms); },
    pace() {
      const next = tail.then(async () => {
        let delay;
        while ((delay = Math.max(lastStartedAt + intervalMs, notBefore) - now()) > 0) await sleep(delay);
        lastStartedAt = now();
        return lastStartedAt;
      });
      tail = next.catch(() => {});
      return next;
    },
  };
}
