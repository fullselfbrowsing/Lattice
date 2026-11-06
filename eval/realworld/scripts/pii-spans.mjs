// Detector spans remain UTF-16 until explicitly converted at the scoring boundary.
export function detectorSpans(detector, text, context) {
  if (detector.findAll) {
    const seen = new Set();
    const spans = [];
    for (const match of detector.findAll(text, context)) {
      if (!Number.isInteger(match.start) || !Number.isInteger(match.end) ||
          match.start < 0 || match.start >= match.end || match.end > text.length ||
          text.slice(match.start, match.end) !== match.substring) {
        throw new Error("Detector returned invalid UTF-16 match bounds");
      }
      const key = match.start + ":" + match.end;
      if (!seen.has(key)) {
        seen.add(key);
        spans.push({ start: match.start, end: match.end });
      }
    }
    return { mode: "all-matches", spans };
  }
  const found = detector.detect(text, context);
  if (!found.matched) return { mode: "first-match", spans: [] };
  if (!found.substring) throw new Error("Detector returned an empty matched substring");
  const start = text.indexOf(found.substring);
  if (start < 0) throw new Error("Detector returned a substring absent from its input");
  if (text.indexOf(found.substring, start + 1) >= 0) {
    throw new Error("Repeated substring has ambiguous offsets; this detector must implement findAll for span scoring");
  }
  return { mode: "first-match", spans: [{ start, end: start + found.substring.length }] };
}

export function toCodePointSpans(text, spans) {
  const boundaries = new Map([[0, 0]]);
  let utf16 = 0, codepoints = 0;
  for (const character of text) {
    utf16 += character.length;
    boundaries.set(utf16, ++codepoints);
  }
  return spans.map(({ start, end }) => {
    if (!boundaries.has(start) || !boundaries.has(end)) throw new Error("A span splits a surrogate pair or lies outside the text");
    return { start: boundaries.get(start), end: boundaries.get(end) };
  });
}

export function matchedCount(predictions, gold) {
  const edges = predictions.map((span) => gold.flatMap((target, index) =>
    span.start < target.end && span.end > target.start ? [index] : []));
  const assigned = new Map();
  function augment(index, seen) {
    for (const target of edges[index]) {
      if (seen.has(target)) continue;
      seen.add(target);
      if (!assigned.has(target) || augment(assigned.get(target), seen)) {
        assigned.set(target, index);
        return true;
      }
    }
    return false;
  }
  return predictions.reduce((count, _, index) => count + Number(augment(index, new Set())), 0);
}
