# Quick Task 260616-ldk Summary

## Outcome

Addressed the 8 current actionable PR #12 review threads locally.

## Changes

- Preserved explicit and inline data URL MIME types through provider packaging and Anthropic/Gemini request bodies.
- Deep-merged `policy.gateway`, with run gateway scalars/arrays replacing defaults and `gateway.metadata` shallow-merged with run values winning.
- Added routing-time rejection for `policy.stream === true` when a candidate model does not advertise streaming support.
- Ended one-shot `capabilities.negotiation.fallback` OTel spans immediately after the event and attached normalized usage to successful `provider.attempt` events.
- Added agent eval baseline bootstrap support for `--agent --init-baseline`, including an injectable baseline writer for tests.
- Added regression coverage for receipt diff redaction/evidence/step-marker fields.
- Added direct Gemini execute/stream regressions for manually supplied public `fileUri` metadata under `noPublicUrl`.

## Scope Notes

- No changeset or version bump was added; these are PR review fix-ups for unreleased v1.4 work.
- The pre-existing untracked planning artifact `.planning/quick/260616-inn-add-single-chokepoint-nopublicurl-egress/260616-inn-REVIEW-final.md` was preserved.
- A thread-aware PR fetch still shows the original 8 current unresolved threads and 2 outdated unresolved threads in GitHub because this local fix set has not been pushed and no GitHub threads were resolved.
