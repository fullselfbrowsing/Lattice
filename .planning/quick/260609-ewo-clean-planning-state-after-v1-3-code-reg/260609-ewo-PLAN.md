# Quick Task 260609-ewo: Clean planning state after v1.3 code/registry audit - Plan

**Date:** 2026-06-09
**Status:** Complete

## Goal

Reconcile v1.3 planning artifacts with the code, git refs, and npm registry audit so the next GSD step starts from the true state of the milestone.

## Tasks

### 1. Normalize v1.3 package scope references

**Files:** `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`

**Action:** Replace stale npm package-scope references with `@full-self-browsing/*` while preserving GitHub org/repo names such as `fullselfbrowsing/Lattice`.

**Done:** Complete

### 2. Reconcile completion counts and open work

**Files:** `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`

**Action:** Record that 7 / 16 v1.3 phases are complete, 9 phases remain, 64 / 87 planned REQ-IDs are authored, 38 / 64 authored REQ-IDs are complete, and the 23 remaining planned REQ-IDs belong to Phases 35-39.

**Done:** Complete

### 3. Update project narrative

**Files:** `.planning/PROJECT.md`

**Action:** Replace pre-release assumptions with audited facts: rc.0 is published with provenance, stable 1.3.0 is not published, CI/release/registry-drift workflows exist, and Phase 35 is next.

**Done:** Complete

### 4. Verify stale text is removed

**Files:** planning docs

**Action:** Run stale-text scans against source-of-truth planning files and `git diff --check`; do not run package tests because this is documentation-only cleanup.

**Done:** Complete
