# Sprint token follow-up — 2026-09-29

**What this is.** The first measurement of the changes recorded in
[2026-09-25-sprint-token-analysis.md](2026-09-25-sprint-token-analysis.md), taken from the four
sprints that ran on the new workflow: q2-launcher S26, S27, S28 and q2-community S5. Same method
as the original analysis (session and subagent transcripts, usage de-duplicated by message id,
list prices). Output quality is **not** assessed here; that waits until the sprints in flight are
through.

Caveats: agent roles are classified heuristically from the first prompt, so totals are reliable and
per-role splits approximate. Sprint size varies (4 to 15 stories), so fixed costs per sprint are
spread unevenly; compare per story, and read the community comparison with that in mind (S1-S4
had 4-5 stories each, S5 has 13).

## Cost per story

Orchestrator included.

| Sprint | Stories | Agents | Total | Per story | Opus share (subagents) |
| --- | --- | --- | --- | --- | --- |
| launcher S22-S24 (old) | 12 | 116 | $281 | $23 | 42-62 % |
| community S1 (old) | 4 | 28 | $35 | $9 | 63 % |
| community S2 (old) | 5 | 45 | $83 | $17 | 62 % |
| community S3 (old) | 4 | 52 | $97 | $24 | 66 % |
| community S4 (old) | 4 | 37 | $106 | $27 | 58 % |
| **launcher S26** | 15 | 122 | $220 | **$15** | 50 % |
| **launcher S27** | 9 | 105 | $214 | **$24** | 41 % |
| **launcher S28** | 10 | 90 | $117 | **$12** | 74 % |
| **community S5** | 13 | 128 | $140 | **$11** | 73 % |

| Comparison | Before | After | Change |
| --- | --- | --- | --- |
| launcher (S22-S24 vs S26-S28) | $23 / story | $16 / story | about -31 % |
| community (S1-S4 vs S5) | $20 / story | $11 / story | about -46 % |
| both projects together | $21.5 / story | $14.7 / story | about -32 % |

Against the more expensive sprints of the original table (second-brain, Frontend-Scotty) the
saving would be about 58 %, but that compares different projects and is the weaker number. The
defensible range is **30-45 % less cost per story**.

## What each lever did

| Lever | Result |
| --- | --- |
| Two-stage review | Default reviews (Sonnet) cost $11 for 18 reviews in S26, $4 for 13 in S28, $12 for 23 in S5, about $0.50-0.60 each; before, an Opus review cost about $8. Second-stage reviews: none in S26 and S28, one in S27 (157), one in community S5 (030). |
| Hard-deliverable budget | Holds (at most one per story), but 21 % of deliverables in S28 (7 of 33), 14 % in S5 (6 of 44), against 11 % in S26/S27. In S28 Opus is $37 of $50 deliverable spend. |
| Turn budget | Improved after S27, no `PARTIAL` seen anywhere. Deliverable agents above 40 calls: S26 12 of 55 ($27, max 97), S27 17 of 52 ($49, max 127), S28 4 of 39 ($21, max 70), S5 2 of 66 ($8, max 49). |
| Build orchestrator diet | Verification agents on Sonnet; the sprint orchestrator costs $3 in S28 and S5 (S26 $33 at 482k peak context, S27 $20 at 330k). |
| Tier record | Filled in all four `review.md` files; usable as the standing metric. |
| Phase 1a up front | Not measured here. |

## What did not move

- **Refine is now the largest single item and runs entirely on Opus:** S26 $66 (35 %), S27 $54
  (28 %), S28 $37 (32 %), community S5 $62 (44 %). It is the reason the Opus share is 73-74 % in
  S28 and S5 even though review is cheap.
- **Gate agents in S27:** 13 agents, $34, up to 123 calls each (two regressions attributed and
  fixed). Not visible in the original analysis.
- **Hard-deliverable share is drifting up again** in S28 and S5 (see above).

## Quality signals so far (not a quality assessment)

- S27 story 157: the second-stage review found three real problems the default review had passed
  (a read error indistinguishable from "no sidecar", a non-null-assertion crash on a scan-swap
  race, two of three rollback paths untested).
- Community S5 story 030: the second-stage review returned FAIL and found what the default review
  missed (a second seam via a separate `STUDIO_REPO_ROOT` next to the existing
  `STUDIO_E2E_REPO_ROOT`, plus a Windows-specific issue).
- S26 and S28: the regressions were found by the gate, not by review.

## Candidate next steps, pending the quality check

1. Refine on Sonnet for stories without a hard marker (largest remaining block).
2. Check the S28 hard-deliverable rate against the refine prompt: 7 of 10 stories used the budget.
3. Gate: budget and context limit for fix agents.
4. Enforce the turn budget with a hard limit in the deliverable prompt; `PARTIAL` never fires.

## Method

Unchanged from the original analysis; sessions were selected by `<command-name>/sprint` and
`command-args` (launcher: 26, 27, 28; community: 1-5).
