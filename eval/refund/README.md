# Free-model refund workflow demonstration

This harness runs a synthetic travel provider's refund reviews through real Lattice calls to two pinned OpenRouter free models. Lattice prepares the artifacts, selects the configured route, checks a recommendation-format invariant and signs terminal results. Separate application code evaluates business rules and simulates employee/manager review and payment.

The eight scenarios cover a routine refund, basic-fare rejection, disputed company promise, missing cancellation date, approval limit, prior refund, mismatched booking and customer-message instruction. Each model receives each scenario twice. Two development calls use a separate ticket and are excluded from the 32-run denominator.

## Evidence and scoring

- [Fixtures](fixtures.mjs) contain the frozen policy, synthetic evidence, expected labels, prompts and model settings. Expected labels and approval fixtures are not sent to the models.
- [Workflow](workflow.mjs) separates format validation, exact-field evaluation, application rules, payment simulation and retained-evidence verification. The business controller does not read evaluation labels.
- [Runner](run.mjs) records every attempted run, exact serialized request, output, receipt and simulated case event. A configured signer is required.
- [Reporter](report.mjs) rechecks exported bundles in a fresh process using the saved public key, then generates the report and runs scoped negative controls.
- [Controls](controls.mjs) include content changes, missing records, forged signatures and a separately scripted wrong-but-validly-signed recommendation.

Read [the generated report](results/summary.md) for measured results. Its strict score requires the correct action, amount, authority, conflict flag, decisive rule and source references. It is not a semantic assessment of the explanation. These authored scenarios are an illustrative demonstration, not a representative benchmark.

## Run and reproduce

From the repository root:

    pnpm --filter @full-self-browsing/lattice build
    node --test eval/refund/workflow.test.mjs eval/realworld/scripts/free-eval.test.mjs eval/realworld/scripts/live-observer.test.mjs
    OPENROUTER_KEY_FILE=/absolute/path/to/private/key node eval/refund/run.mjs
    node eval/refund/report.mjs

The live command requires committed measured code. It checks current catalog and endpoint prices, rejects paid models/fallbacks/extensions, shares the existing free-request ledger/lock and caps this cohort at 40 requests. The signing private key stays under .context/refund-live/; the public key is exported separately from the bundles. Account snapshots establish spend reconciliation.

The runner skips existing terminal rows. Interrupted rows remain failures rather than being retried. Changed code or fixtures cannot extend the frozen result set; use a separately identified study for changes. Preserve existing results rather than deleting them to obtain a better run.

## Boundaries

The prior rejected decision in the disputed-promise case is supplied synthetic backstory; the new review recommendations come from live models. Approval identities, delegated authority and payment outcomes are simulated, not actual human decisions or financial transactions.

Business policy is an input artifact, distinct from the execution policy committed by policyHash. A receipt verifies the issuer's recorded commitments, not source truth, remote model consumption, human authorization or complete business history. External case records need their own controls in production. The in-memory duplicate check demonstrates a rule within this harness; it is not a durable payment system.

Negative controls and the payment simulator are separate from the SDK's implementation. A signed incorrect answer can pass evidence verification while failing the decision score and being held by the application. A missing approval can leave the receipt valid while failing the case-record completeness check.

This task implements the demonstration specified in [the C2 research brief](../../paper/research/C2-REFUND-CASE.md). It does not run an Air Canada, Klarna, Zurich, FSB or Voyza deployment. Historical evaluation results are unchanged.
