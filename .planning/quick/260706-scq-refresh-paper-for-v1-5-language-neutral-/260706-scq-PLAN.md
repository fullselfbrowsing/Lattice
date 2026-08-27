---
quick_id: 260706-scq
title: Refresh paper for v1.5 protocol and conformance
date: 2026-07-07
status: ready
mode: quick
---

# Quick Task 260706-scq: Refresh the Lattice IEEE paper for v1.5

## Objective

Update the existing IEEE paper in `paper/main.tex` so its implementation claims match
the current v1.4/v1.5 repository state while preserving the current title, structure,
and core thesis about signed replayable capability receipts.

## Planned changes

1. Update stale schema-version prose: accepted versions are v1.1, v1.2, and v1.3;
   newly minted receipts use v1.3; v1 or absent versions are rejected before crypto.
2. Add a concise protocol conformance section covering `spec/SPEC.md`, JSON Schemas,
   committed vectors, TypeScript verification, Python verify/replay/mint, and
   cross-mint parity CI.
3. Refresh implementation facts: npm latest 1.5.1, about 27.3k production TypeScript
   lines, 332 model profiles, and expanded CLI commands.
4. Replace old test metrics with the current distribution: runtime, CLI, conformance
   generator, TypeScript conformance/parity, and Python pytest.
5. Update limitations, future work, and conclusion so shipped v1.4/v1.5 features are
   not described as future work.
6. Update `spec/SPEC.md` only where it describes the paper as capped at v1.2.
7. Add bibliography entries only if new prose cites them.

## Verification

- Build with `make -C paper`.
- Scan for stale claims: `1.3.0`, `960`, `816`, `144`, `82`, and old v1/v1.2-only
  protocol wording.
- If TeX is unavailable, record that and run structural citation/environment checks.

## Commit guidance

Commit only the paper refresh files and this quick-task artifact. Leave unrelated dirty
workspace files alone.
