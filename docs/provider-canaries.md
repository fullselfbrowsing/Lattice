# Provider Canary Runbook

The provider canary is an optional live compatibility signal for the packed Lattice 1.6.0
runtime. It exercises one bounded request for each configured OpenAI-compatible,
Anthropic, and Gemini wire family, checks normalized usage and cost, requires a standard
`lattice-receipt/v1.4` receipt, and verifies that receipt with
`legacyPolicy: "reject"`.

It does not gate pull requests. The workflow runs only on its weekly schedule or through a
manual dispatch. Deterministic fake-server coverage remains the required local and CI test.

## Protected Environment

Create a GitHub Actions environment named `provider-canary` and configure environment
protection before adding credentials. Require an appropriate reviewer for changes or manual
runs, restrict deployment branches to trusted release branches, and limit administration of
the environment to maintainers responsible for provider spend.

Add these environment secrets by name:

- `PROVIDER_CANARY_OPENAI_API_KEY`
- `PROVIDER_CANARY_ANTHROPIC_API_KEY`
- `PROVIDER_CANARY_GEMINI_API_KEY`

Add these environment variables by name:

- `PROVIDER_CANARY_OPENAI_MODEL`
- `PROVIDER_CANARY_OPENAI_BASE_URL`
- `PROVIDER_CANARY_OPENAI_INPUT_PRICE_PER_1K_USD`
- `PROVIDER_CANARY_OPENAI_OUTPUT_PRICE_PER_1K_USD`
- `PROVIDER_CANARY_OPENAI_MAX_SPEND_USD`
- `PROVIDER_CANARY_ANTHROPIC_MODEL`
- `PROVIDER_CANARY_ANTHROPIC_INPUT_PRICE_PER_1K_USD`
- `PROVIDER_CANARY_ANTHROPIC_OUTPUT_PRICE_PER_1K_USD`
- `PROVIDER_CANARY_ANTHROPIC_MAX_SPEND_USD`
- `PROVIDER_CANARY_GEMINI_MODEL`
- `PROVIDER_CANARY_GEMINI_INPUT_PRICE_PER_1K_USD`
- `PROVIDER_CANARY_GEMINI_OUTPUT_PRICE_PER_1K_USD`
- `PROVIDER_CANARY_GEMINI_MAX_SPEND_USD`

The workflow maps these protected names to process-local `LATTICE_CANARY_*` names. Do not
store credential values in repository variables, workflow YAML, issue text, job summaries,
or documentation. Anthropic and Gemini use their built-in HTTPS API base URLs; the
OpenAI-compatible family requires the configured base URL.

## Spend Ownership

The environment owner is responsible for selecting permitted models, confirming current
provider pricing, setting per-1k input and output prices, and monitoring the provider
account's actual billing controls. Pricing variables are operational configuration, not a
claim that Lattice maintains a live price catalog.

Each family is limited to one transport, 2,048 input tokens, 16 output tokens, a 20-second
deadline, and at most USD 0.02 configured spend. A family's configured spend cap must be
positive, no greater than USD 0.02, and high enough for the worst-case projection from the
configured prices. These limits bound this workflow; provider-side quotas and account
budgets remain the maintainer's responsibility.

## Running the Canary

The workflow file is `.github/workflows/provider-canary.yml`. It runs at `30 7 * * 3`
and can be started with GitHub Actions `workflow_dispatch`. It has no `push` or
`pull_request` trigger, uses read-only repository permissions, does not cancel an in-flight
run, and executes the packed consumer on Node 24.

Run the deterministic local equivalent before any manual live rerun:

```bash
node --test scripts/provider-canary.test.mjs
```

That test packs the public runtime, installs it in an isolated consumer, and uses local fake
HTTP servers. It needs no live credentials and proves request limits, provider wire shapes,
timeouts, spend checks, strict receipt verification, and report sanitization.

## Result Semantics

Every family has exactly one tri-state status:

- `not-run`: no network request occurred because configuration was absent, invalid, or
  projected spend exceeded its cap. This is not success evidence. A report containing only
  `not-run` and `passed` records exits successfully so optional families may remain disabled.
- `passed`: exactly one provider transport completed, observed model and usage evidence was
  present, limits and configured spend passed, and the returned v1.4 receipt verified as
  standard DSSE with `deprecated=false`.
- `failed`: a configured attempt, runtime check, receipt check, or launcher step failed. Any
  `failed` family makes the canary command and workflow fail.

The stable `code` field gives the bounded reason. Examples include `missing-model`,
`projected-spend-exceeds-cap`, `provider-http-error`, `transport-timeout`,
`usage-limit-exceeded`, `spend-limit-exceeded`, and
`receipt-verification-failed`. Do not infer success from workflow completion alone; inspect
each family status and treat `not-run` as missing live evidence.

## Sanitized Evidence

The retained `provider-canary-report.json` has this bounded shape:

```json
{
  "packageVersion": "1.6.0",
  "commit": "<commit-id-or-unknown>",
  "limits": {
    "maxInputTokens": 2048,
    "maxOutputTokens": 16,
    "timeoutMs": 20000,
    "maxTransports": 1,
    "maxSpendUsdPerFamily": 0.02
  },
  "families": [
    {
      "family": "openai-compatible",
      "status": "passed",
      "code": "ok",
      "configuredModel": "<bounded-identifier>",
      "observedModel": "<bounded-identifier>",
      "requestId": "<bounded-identifier>",
      "usage": {
        "inputTokens": 0,
        "outputTokens": 0,
        "totalTokens": 0
      },
      "costUsd": 0,
      "durationMs": 0,
      "transportCount": 1,
      "receiptVerified": true
    }
  ]
}
```

Optional family fields are omitted when unavailable. The sanitizer admits only bounded
identifiers, numeric usage/cost/duration, transport count, receipt status, and stable status
codes. It discards credentials, base URLs, prompts, provider output, raw requests, raw
responses, receipt envelopes, and caught error text.

GitHub retains this sanitized artifact for 30 days. Do not extend retention or upload any
debug artifact without a separate security review. Never add steps that print the process
environment, HTTP bodies, authorization headers, receipt payloads, or raw provider errors.

## Incident Response

1. Read the job summary and sanitized report. Record the commit, package version, family,
   status, code, and bounded counters only.
2. Run `node --test scripts/provider-canary.test.mjs` to separate a deterministic package or
   wire regression from a live provider or configuration problem.
3. Check the protected environment configuration by name and provider account dashboards.
   Do not echo values or reproduce requests with verbose credential-bearing output.
4. For auth, quota, pricing, or model drift, update the protected environment through the
   GitHub UI and provider console, then use a manual dispatch. Keep the repository unchanged
   unless the public wire contract actually changed.
5. If credential exposure is suspected, stop reruns, rotate the affected provider key,
   review GitHub and provider access logs, and remove any exposed artifact through the
   repository's security incident process.
6. If a package regression is confirmed, disable the affected family by removing its model
   variable, open a scoped fix, and treat subsequent `not-run` as an explicit evidence gap
   until a protected live run passes again.
