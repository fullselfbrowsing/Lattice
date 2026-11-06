---
type: quick
id: 261106-2fh
date: 2026-11-06
status: complete
baseline: 2a8bfef
records_commit: 092f455
stub_commit: 425ef89
---

# Author rewrite set up

Claude (Claude Code, Claude Opus 5.5) set up the rewrite at Lakshman's direction, after reading the C8 work and the pushed branch. No manuscript prose, inference, push, outside contact or change to frozen results.

## Delivered

- **Working branch (`092f455`, records only):** withdrew the editor-agreement advice in the C2 and C3 reviews with dated corrections, because the policy describes no exception route for article authors. Added the process-only [rewrite guide](../../../paper/research/AUTHOR-REWRITE.md). Updated the checklist (gate note, A1 writing approach, A7 instructions still unread, P5 prompt records and Methods) and README.
- **`author-rewrite` branch (`425ef89`, local):** 18 stubs replace the Section 3, 4, 5 and 7.7 narrative. Headings, labels, figures, tables and DR/DP names are kept. Worktree: `/Users/lakshman/conductor/workspaces/lattice/author-rewrite`.

## Decisions forced by the newer state

- The Nov 6 gate allows no placeholder in a core section, so stubs stay off `cursor/review-fixes-eval-708c`, which remains the complete gate copy.
- Another session shares the `columbia` worktree, so the branch has its own folder. It sits outside `.context` because the authors will hold uncommitted writing there.
- `C*-REFERENCE-DRAFT.md` files are labelled for author rewriting, but rewriting them repeats the problem. The guide says to keep them closed.

## Validation

- **Working branch:** `paper/main.tex` and `paper/main.pdf` unchanged since `2a8bfef`; 0 stubs; frozen 23/23 and protected 510/510 byte-identical; `git diff --check` and guide links pass.
- **Rewrite branch:** builds at 71 pages with 0 undefined references, 0 overfull boxes and the 7 existing underfull warnings. Exactly 18 stubs. Labels (22), table and figure blocks (5), inputs (16) and headings match the base. Text before Section 3, Sections 6–7.6, and Section 7.8 onward is byte-identical. Of 175 old sentences none remains, and the four passages share no 8-word run with the old prose. Pages 7 and 9 inspected.
- **Publication:** nothing pushed. `origin` still has `2a8bfef`, and `author-rewrite` is not on the remote.

## Author handoff

Four references leave the stub PDF until cited again (Kapoor 2023, Sonnenberg 2012, vom Brocke 2020, Walls 1992); they remain in `refs.bib`. Today: read JITCAR's instructions in a browser, complete the section inventory with Prof. Neouchi, make the go/no-go call and preserve the session logs. Prof. Neouchi's agreement is not yet recorded.
