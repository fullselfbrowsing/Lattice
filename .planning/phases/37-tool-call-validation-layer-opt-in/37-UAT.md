---
status: complete
phase: 37-tool-call-validation-layer-opt-in
source: [37-01-SUMMARY.md, 37-02-SUMMARY.md, 37-03-SUMMARY.md]
started: 2026-06-09T22:34:01Z
updated: 2026-06-09T22:37:23Z
---

## Current Test

[testing complete]

## Tests

### 1. Public Validation API
expected: A package consumer can import the tool-call validation surface from the root package, including ToolCallValidationError, ToolCallValidationFailureReason, ValidateToolCallsOption, ValidatedToolCall, and validateToolCallRequests. The validator accepts the ToolDefinition name/inputSchema subset, reports unknown tools such as search_database, reports malformed args such as { quer: "..." } as invalid_args, rejects extra fields after schema validation, supports throw/drop/callback failure modes, and treats callback mode without onValidationFailure as a configuration error.
result: pass

### 2. Adapter Opt-In Validation
expected: When validateToolCalls is provided, OpenAI-compatible, OpenAI, OpenRouter, xAI, LM Studio, Anthropic, and Gemini adapters parse returned tool_calls envelopes, validate them, and populate response.toolCalls with normalized valid calls. When validateToolCalls is omitted, adapters preserve existing behavior and do not add response.toolCalls.
result: pass

### 3. Agent Runtime Consumption
expected: runAgent prefers adapter-normalized response.toolCalls when present, still falls back to prompt-envelope parsing for adapters that do not validate, and treats response.toolCalls: [] as no tool work so dropped invalid calls are not executed.
result: pass

### 4. Package Verification and Release Note
expected: The Phase 37 package surface type-checks for consumers, public-surface coverage passes, the all-seven parity suite passes, and the changeset documents opt-in returned tool-call validation without claiming native provider tool-use support.
result: pass

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
