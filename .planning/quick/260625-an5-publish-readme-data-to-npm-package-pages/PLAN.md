---
status: complete
created: 2026-06-25
task: Publish README data to npm package pages for runtime and CLI packages
---

# Publish README Data To npm Package Pages

## Plan

- Add package-local README files for `@full-self-browsing/lattice` and `@full-self-browsing/lattice-cli`, copied from `origin/main:README.md`.
- Rewrite package-local README asset and docs links to GitHub URLs that render correctly on npm.
- Include `README.md` explicitly in both publishable package `files` arrays.
- Extend the tarball audit gate so each publishable package must pack a non-empty `package/README.md`.
- Verify both package builds and dry-run package contents.
