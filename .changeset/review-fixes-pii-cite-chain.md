---
"@full-self-browsing/lattice": minor
"@full-self-browsing/lattice-cli": minor
---

Close the remaining review findings on PII detection, must-cite, crew receipt hashes, and chain truncation.

- `us-ssn` matches dashed, spaced, and undashed 9-digit forms, and skips a number that follows an identifier cue such as order, invoice, sku, or ref. `us-phone` matches a plain 10-digit run and skips a phone-shaped SKU the same way. `credit-card` requires a known card IIN in addition to Luhn, so an ISBN-13 and a `ref`-prefixed 16-digit reference are not flagged.
- `must-cite` accepts an inline `[name]` or `(name)` marker, finds a nested citations array, and rejects a citations-list entry when the prose's square-bracket citations name a different work.
- A crew-start receipt hashes the crew plan instead of storing a null output hash, and sets `chainClosure`. A closing receipt lists `chainMemberCids`. `verifyChain` rejects a dropped leaf on such a tree. Chains without that commitment still verify, and the result includes an advisory. `receiptVerifyAdvisories` and `lattice verify` / `lattice receipt verify-chain` warn when audience, nonce, expiry, or a raised `minVersion` were not checked. Those checks stay opt-in.
