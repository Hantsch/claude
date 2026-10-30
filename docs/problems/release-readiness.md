# Release readiness — "releasable: yes", then the PR goes red

*Living problem record, opened 2026-10-30. Not shipped by any plugin. Add to it every time a PR
or a release of a project that runs ai-scrum goes red, or a fix commit is needed between a
sprint's end and its release (§8).*

**Status:** open — C1–C6, C8, C9 built into ai-scrum (`/release-check`, under `## Unreleased`, not yet
released) · **Incidents:** 9 (I1–I9) · **Last:** I9, 2026-10-30, claude-control (resolved) ·
**Next:** release ai-scrum, `/ai-scrum:setup` in the projects (§6), then count green cycles (§1)

## 1. The problem

ai-scrum 4.8.0 promises that a sprint ends releasable: the first line of the final report is
`releasable: yes | NO`, and `yes` is read as "open the PR, it goes green, merge, it releases".
In practice the PR or the release is red more often than not, and every time on a different
gate. So each fix feels like progress, and the next release fails anyway.

The question this record answers over time: **which mechanisms make "green at the end of the
sprint" differ from "green on GitHub", and which of them are closed?**

**Solved when** five consecutive sprint → PR → release cycles, in projects with an automatic
release workflow, are green on the PR's first run and release without a fix commit in between,
and every `releasable: yes` in that window was right. From ai-scrum 4.10.0 the count comes from
each project's `/release-check` record line (`record: <n> green cycles in a row · <m> missed`,
printed at every sprint start, C9) — read it there instead of reconstructing it.

## 2. Incident log

Oldest first; append new rows at the bottom. Mechanisms: §3.

| # | Date | Where | What went red | Sprint verdict before | Mech. | Resolved by |
| --- | --- | --- | --- | --- | --- | --- |
| I1 | 08-19 … 10-29 | this repo | Notes outside `## Unreleased`, caught by the pre-push `check-notes.ps1`, moved by hand 5×: `31d4268`, `5e7c655`, `95278e5` ("after auto-merge misplaced Unreleased notes"), `d2c5169` (into released tech-rules 2.0.1), `0d9dafd` | — | M4 | hand repairs |
| I2 | 09-08 | claude-control PR #4 ([validate](https://github.com/Hantsch/claude-control/actions/runs/34211781445), [release](https://github.com/Hantsch/claude-control/actions/runs/34212095191)) | Check release notes; merged 2.5 min after the red run, then the release's own notes check | none (hand commit "updated readme") | M5, M2, M6 | `7cfec42` notes → PR #5 → 1.1.1 (09-22) |
| I3 | 09-26 | q2-launcher, two PR runs | Green locally, red on GitHub: the PR ran on the merge with main, which held the `release: x.y.z` commit ("tag vX already exists"), plus steps no local check ran | — | M1, M2 | q2-launcher `scripts/verify-release.mjs` (its header is the source) |
| I4 | 09-30 | q2-launcher | Tests green locally, red on the runner, whose TEMP is an 8.3 short path | — | M3 | `runnerEnv()` in the same script |
| I5 | 10-27 | q2-launcher, between the S35 review `c419397f` and PR #22 | Fix commit `6b7318e` "Release gate fixes: prettier format, packaged-app ui:verify skips dev-only screens, ping accuracy test tolerates scheduler outliers" | ? | M2, M3 (from the subject only) | `6b7318e` |
| I6 | 10-29 | q2-launcher PR, head `fca1c8e` ([ci](https://github.com/Hantsch/q2-launcher/actions/runs/40878523867)) | `tech-debt.test.mjs`: roadmap follow-up list 11 > 10 lines — a sprint doc edit broke a test | ? | M7 | `36d107f`; same shape as the case cited in ai-scrum 4.8.0 phase 4 |
| I7 | 10-29 | q2-launcher PR #24 → [release](https://github.com/Hantsch/q2-launcher/actions/runs/40886812877) | Release step "Package the unpacked Windows app" | ? | not classified (the log needs a token) | `52d7ea9` "release fix" |
| I8 | 10-30 | claude-control PR #6, head `5778747` ([validate](https://github.com/Hantsch/claude-control/actions/runs/41051446781), [release](https://github.com/Hantsch/claude-control/actions/runs/41051628005)) | Test, N5: `expected 2061 to be less than 2000`; merged 40 s after the red run, release red the same way (2053 ms) | S06: `releasable: yes · a21373f · build + full test + typecheck` | M3, M2, M6 | S07/023 moved the budgets to the perf lane; S06 still unreleased on main |
| I9 | 10-30 | claude-control PR dev→main, head `e70e7af` ([validate](https://github.com/Hantsch/claude-control/actions/runs/41064355449)) | Check release notes: "'## Unreleased' in CHANGELOG.md is empty … would release 1.1.2 (patch), but the notes are not ready" | S07: `releasable: yes · e70e7af · npm run build && npm run typecheck && npm test` | M1, M2, M4, M5 | `3499fed` merged origin/main into dev, `612487d` moved the notes; PR #7 [green](https://github.com/Hantsch/claude-control/actions/runs/41069375210) → [release](https://github.com/Hantsch/claude-control/actions/runs/41070172479) v1.1.2 — a **patch** for S06's features (M5) |

All dates 2026. Window: claude-control's whole CI history (7 PRs to main, 3 red); q2-launcher
only from 2026-10-27 (the API's last 100 runs) plus what its script's header records.

## 3. Mechanisms

**M1 — The check runs on the branch; GitHub runs on the merge.** A PR's checks run on
`merge(dev → main)`, the release on main after it. After every release main carries a bot commit
(version bump, `## Unreleased` promoted) that nothing brings back to dev: the profile marks main
"never merge", `/sprint` says merging is the user's job, and the user does not know it is due.
From then on dev is a different tree. Measured on I9: `check-notes.ps1` on dev says *"would
release 1.1.1 (patch) — notes are ready"* although v1.1.1 is tagged (dev still has
package.json 1.1.0 and the shipped 1.1.1 notes under `## Unreleased`); on the merge tree it
gives exactly the red of I9 (§7). Phase 4 anticipates "a base branch that has moved on", but only
a project's own `release-verify` can notice it — the `none` fallback never does.
*Status: open in ai-scrum; closed locally in q2-launcher; tech-rules `/release-prep` merges with
the release branch too, but claude-control does not install tech-rules and `/sprint` never calls it.*

**M2 — The check runs fewer steps than GitHub, and still says "yes".** With `release-verify:
none`, phase 4 runs build + test + typecheck on HEAD. claude-control's PR lane also runs
`check-notes.ps1` and `npm run package`; its release lane runs the plan and `ci-release.ps1`.
Both claude-control verdicts said in parentheses that they ran the stand-in, and printed
`releasable: yes` anyway. 3 of the 4 projects on ai-scrum ≥ 4.8.0 have `release-verify: none`.
*Status: open.*

**M3 — The check runs on the dev machine; GitHub on `windows-latest`.** Slower CPU (N5: 2061 and
2053 ms against a 2000 ms budget), TEMP as an 8.3 short path, `TZ`, `CI=true`.
*Status: partly closed — wall-clock asserts are out of ai-scrum's gates (`ecf384b`) and out of
claude-control's blocking suite (S07/023); the runner environment is emulated only in q2-launcher.*

**M4 — Release notes land outside `## Unreleased`.** `/build` step 9b, `/sprint` phase 3 step 4
and the profile template all say: append under `# Features` / `# Fixes` of the **current
version section**. That is the `version.md` style (GC-APP, tnt_dnd: `# 1.22.2` / `# Fixes`). In a
Keep-a-Changelog file whose `## Unreleased` a release script promotes (claude-control,
q2-launcher, this repo) it is wrong — and on a dev that lacks the release commit (M1) "current"
is the version already shipped: S06's six stories (016, 017, 018, 020, 021, 022) wrote into
`## 1.1.0` and left `## Unreleased` empty. Since PR #6 that is on main too: its `## 1.1.0` lists
six features 1.1.0 never had. Contributing: git's three-way merge files notes wherever the hunk
fits (`95278e5`), and this repo's `scripts/release.ps1` keeps the
`<!-- Add your changes here … -->` placeholder in every promoted section — 18 released sections
across the four plugin changelogs now invite an entry. (claude-control's copy of the script
already strips it — a fix that never travelled back.) *Status: open.*

**M5 — The bump comes from commit subjects ai-scrum does not write.** `plan-release.ps1`
derives the level from Conventional-Commit types; `/sprint` commits `NNN: …` and `SNN: …`, which
count as plain → patch. A test-and-docs-only sprint (S07) therefore "releases" and demands notes,
and a feature sprint (S06) ships as 1.1.2 instead of 1.2.0. Neither is visible from the sprint.
*Status: open.*

**M6 — A red PR can be merged.** claude-control's main has no protection and no required check
(GitHub API: `protected: false`). PR #4 was merged 2.5 min after its red run, PR #6 40 s after;
both releases then failed on main, which now holds S06 unreleased (no v1.1.2) with misfiled
notes. `CLAUDE.md`'s lane table says the PR lane blocks the merge — nothing enforces it.
*Status: open; a GitHub setting, the user's call.*

**M7 — The verified commit is not the final one.** The gate ran before the review commit, whose
roadmap edit then broke a test (I6). *Status: closed by ai-scrum 4.8.0 phase 4 (runs last,
commits nothing after a green run). Necessary, not sufficient: I8 and I9 came after it.*

## 4. Why the fixes so far did not stick

Each fix closed the mechanism of the latest incident, in the project where it happened.

| Date | Fix | Closes | Reaches |
| --- | --- | --- | --- |
| 08-19 … 10-29 | notes moved into `## Unreleased` by hand, 5× | one instance of M4 each | this repo |
| ~09-26 | q2-launcher `verify-release.mjs`: merge tree, every blocking CI step, runner env, drift test | M1, M2, M3 | q2-launcher only |
| 10-27 | ai-scrum `ecf384b`: wall-clock asserts out of the gates | M3 (timing) | ai-scrum projects, from their next refine |
| 10-27 | tech-rules `/release-prep`: clean worktree, merge with the release branch, CI conditions, GO/NO-GO | M1, M2, M3 — when someone runs it | projects with tech-rules — not claude-control; `/sprint` does not call it |
| 10-29 | ai-scrum 4.8.0: phase 4 + `release-verify` key | M7; M1–M3 only with a real key | 1 of 4 projects on ≥ 4.8.0 has one |
| 10-30 | claude-control S07: N4/N5 to the perf lane, release lane tests only a due release, lanes in `CLAUDE.md` | M3 for N4/N5 | claude-control |
| 10-30 | ai-scrum `/release-check` + `/sprint` phase 0/4 + `changelog-style` + `Change type:` + `commit-style` (unreleased) | M1, M2, M4, M5 in ai-scrum; M3 partly (CI env, short TEMP — not runner speed) | every ai-scrum project, from its next `/ai-scrum:setup`, with no tech-rules |

The pattern (before the last row): the answer to M1–M3 exists three times — q2-launcher's script, tech-rules'
`/release-prep`, ai-scrum's phase-4 hook — none wired to the others, and the one that runs by
default (phase 4 with `none`) is the weakest and the only one that says "yes". M4 and M5 were
never named, so each recurrence looked new. Fixes also travel in neither direction (the
placeholder strip in M4). Hence this record: classify a new incident against M1–M7 first, fix
second.

## 5. Countermeasures

| # | Countermeasure | Closes | Where | Status |
| --- | --- | --- | --- | --- |
| C1 | With `release-verify: none`, phase 4 reports `releasable: UNVERIFIED — ran <steps> on HEAD; the PR runs <steps> on the merge with <branch>` instead of `yes` | M2 (the false yes) | ai-scrum `sprint.md` | done (unreleased) — `release-verify: none` yields `UNVERIFIED`; the new default is `auto` |
| C2 | Sprint start and phase 4 refuse when `origin/<release branch>` has non-merge commits the work branch lacks: `NO — main has the release commit <sha> · merge origin/main into <branch-base>`. At sprint start this runs before any story writes notes. Needs the release branch as a fact (new profile key, or the release workflow's `on.push.branches`) | M1, M4 (stale "current") | ai-scrum `sprint.md` phases 1 + 4, profile, setup | done (unreleased), as automation: phase 0 and phase 4 run `/release-check` part B and **merge** `origin/<release-branch>` into the work branch when conflict-free (a conflict stops the sprint); `/release-check` alone reports `NO — missing release-branch commits`. New key `release-branch` |
| C3 | Changelog shape as a profile fact (`changelog-style: unreleased \| version-section`; setup detects a `## Unreleased` heading). `/build` 9b and the `/sprint` sweep follow it, and the sweep fails when the sprint's changelog diff touches anything but the Unreleased block | M4 | ai-scrum `build.md`, `sprint.md`, profile template, setup | done (unreleased) — the reference for "published" is a section's text **at its tag** (on the release branch without one): a branch that *restores* a damaged section is fine, damage already on the release branch is a warning, damage by the branch is NO |
| C4 | A real release check by default: the merge tree, every blocking PR and release step, CI conditions (the method of `/release-prep` and q2-launcher's script), so `none` stops being the default | M1, M2, M3 | ai-scrum, without tech-rules (decided 2026-10-30) | done (unreleased): `/release-check` — merge in a `clone --shared` (not a worktree: shared refs), clean install, step list derived from the merged tree's workflows on every run, publish steps replaced by `release-plan` + `release-dry-run`, `not local` named, one background run. `release-verify: auto` is the default |
| C5 | Commit subjects carry the bump, opt-in (`commit-style: conventional`): story commits typed from the story (`feat(022): …`, `fix(…)`, `test(023): …`), bookkeeping `docs(S07): …` | M5 | ai-scrum `sprint.md`, `build.md`, profile | done (unreleased) — `Change type:` in every story's Done section drives the bump check; `commit-style: conventional` types the subjects; setup recommends it where the release reads commit types |
| C6 | Setup recommends a required status check on the release branch (the PR lane's job) — a proposal, the plugin never changes repository settings | M6 | ai-scrum or tech-rules setup | done (unreleased) — ai-scrum setup checks protection via `gh api` and recommends a required status check; never changes it |
| C7 | This repo's `release.ps1` replaces heading *and* body on promotion (as claude-control's does), and the 18 stray placeholders go | M4 (here) | `scripts/release.ps1` | proposed — not part of this change (`scripts/`, this repo only) |
| C8 | The plan's completeness is checked by a script, not trusted to the agent: every `run:` line of every push/pull_request workflow must be named in `plan.md` by `file:line`; a missing one is re-planned once, then `UNVERIFIED` (F3b). Tested on claude-control: a plan without `validate.yml:42` (check-notes — I9's step) is caught | an agent's plan silently dropping a step (M2 again, one level up) | ai-scrum `release-check.md` | done (unreleased); GitHub Actions only — other CI is warning W5 |
| C9 | Every verdict leaves a record in `.git/ai-scrum/release-checks.jsonl`; the next run (every sprint start) finds where that tree went on the release branch, reads the PR and release runs from the GitHub API and reports `green cycle` / **`missed`** (yes → red, with an incident row for §2) / `not confirmed` (NO → green) / `superseded`. Tested against PR #7: the dev run's NO on `612487d` resolves to merge `154ddee`, validate and release green → `not confirmed` | a wrong verdict going unnoticed; the §1 count done by hand | ai-scrum `release-check.md` B7, `sprint.md` phase 0 | done (unreleased) |

## 6. Open

**I9 — unblocking claude-control's PR**
1. Done, `3499fed`: `origin/main` merged into `dev` — brings `chore(release): 1.1.1` (`b492451`).
2. Done, `612487d`: S06's six bullets moved from `## 1.1.0` to `## Unreleased`; 1.1.0 and 1.0.0
   are byte-identical to what v1.1.0 shipped again.
3. Done, 2026-10-30: both lanes on the simulated PR merge, in a throwaway worktree with
   `npm ci`, `CI=true`, `TZ=UTC`, no tokens — PR lane: typecheck, test (587/587),
   check-notes ("would release 1.1.2 (patch) — notes are ready"), package; release lane:
   `ci-release.ps1 -DryRun` (plan, tests, promote, EXE + sums, dry-run commit/tag/push/release).
   Differences from the runner: Node 25 instead of 22, Windows PowerShell 5.1 instead of pwsh 7.
4. Done: `dev` pushed, PR #7 green, merged (`154ddee`), released as v1.1.2 (`2c4b390`).
5. Not done: the bump — S06's features shipped as a patch (M5). From now on caught before the PR
   by `/release-check` B6 (`Change type:`) and avoided by `commit-style: conventional`.
6. **User:** required check on main (C6).
7. main again carries a release commit dev lacks (`2c4b390 chore(release): 1.1.2`): the next
   sprint's phase 0 merges it — the first live test of C2.

**Acceptance of `/release-check` (2026-10-30)** — throwaway clones of claude-control, an origin
mirror with `main = 0f1bdb8` (the base of both PRs), the profile as setup would write it
(`release-plan: pwsh -File scripts/plan-release.ps1`, `release-dry-run: … ci-release.ps1 -DryRun`,
`changelog-style: unreleased`). The plan (F3) was derived by a fresh agent from the document
alone: PR lane = validate.yml (npm ci, typecheck, test, check-notes, package), release lane =
release.yml (plan, dry run); perf.yml in neither lane; nothing `not local`.
- **I9 replay, dev = `e70e7af`:** `releasable: NO — missing release-branch commits: b492451
  chore(release): 1.1.1 [skip ci] · merge origin/main into dev`; also NO — notes: `## Unreleased`
  empty in the merge state; also NO — Check release notes (PR, GitHub's exact message: "would
  release 1.1.2 (patch), but the notes are not ready"); also NO — release dry run ("RELEASE
  BLOCKED: '## Unreleased' … is empty"); also NO — Test: `pipeline.test.ts` › cold-start tree
  (N5 premise) timed out, green alone in 1 s (flaky). W4: `## 1.1.0` on origin/main differs from
  v1.1.0 (the six misfiled bullets). Matches GitHub's red run 41064355449.
- **dev = `612487d` (pushed as PR #7):** steps 1–6 green — npm ci, typecheck, test 587/587,
  check-notes ("notes are ready"), package, plan (1.1.2, patch). Step 7, the release dry run:
  `ciRelease.test.ts` › "a tag whose release creation failed is published by re-running the job"
  timed out (18.2 s > 15 s) inside the release's own `npm test`, green alone in 9.6 s (flaky) →
  `releasable: NO — Release dry run: flaky timeout · give the test headroom or make it
  deterministic`. GitHub's PR and release runs were green this time. **Not the `yes` the
  acceptance asked for** — deliberately: a blocking step that went red once is not proven green,
  and I8 was exactly such a test going red on the runner. Warnings: Node 25 here vs 22 pinned,
  pwsh → Windows PowerShell 5.1; bump check skipped (12 stories without `Change type:`).
- Open risk (M3): claude-control has at least two load-sensitive tests in blocking steps
  (`ciRelease.test.ts` 15 s timeout, `pipeline.test.ts` N5 premise). A sprint's phase 4 hands
  them to its fix step; until then `/release-check` reports NO whenever one of them trips.

**Decisions that shape the countermeasures**
- C4, **decided 2026-10-30:** ai-scrum guarantees that a sprint ends releasable — phase 4 proves
  that the PR and the release will pass — on its own, without tech-rules. tech-rules stays
  guidelines for *how* things are built.
- C2, **decided 2026-10-30:** automation in ai-scrum — `/sprint` merges `origin/<release-branch>`
  into the work branch when conflict-free (phase 0, and before phase 4's check), never into a
  protected branch, never pushed; a conflict stops the sprint. Reason: sprints run unattended,
  and a stop at phase 0 waits until someone comes back.
- C5, **decided 2026-10-30:** a profile key, but setup *recommends* `conventional` where the
  release derives the bump from commit types (claude-control, this repo), `plain` elsewhere. It
  changes future subjects, not history.
- Flaky in a blocking step, **decided 2026-10-30:** NO, not a warning (unlike `/release-prep`'s
  "GO with warnings"). Revisit if it produces chronic NOs that nobody fixes.
- **Proposal, not done — tech-rules `/release-prep`:** keep it as the "everything" run (perf,
  advisory platforms, all flows, a report file), but let its phase 0 steps 5–6 (merge + CI
  conditions) defer to `.claude/commands/release-check.md` when a project has it, and align the
  vocabulary (`GO` / `NO-GO` ↔ `yes` / `NO` / `UNVERIFIED`). Without ai-scrum it keeps its own
  method. tech-rules stays untouched until that is decided.

## 7. Reproduce

In a project with ai-scrum: `/release-check` (all of it) or `/release-check base` (seconds).
By hand — what GitHub checks on a PR from `dev` to `main`, the merge, not `dev` (git ≥ 2.38):

```bash
git fetch origin
git log --oneline --no-merges dev..origin/main      # commits dev lacks, e.g. the release commit
tree=$(git merge-tree --write-tree origin/main dev)  # non-zero exit = the PR would conflict
commit=$(git commit-tree "$tree" -p origin/main -p dev -m "PR merge simulation")
git worktree add --detach ../pr-merge "$commit"
(cd ../pr-merge && pwsh -File scripts/check-notes.ps1)   # or any step of the PR lane
git worktree remove --force ../pr-merge
```

Nothing is referenced or committed; the simulated commit is garbage-collected.

## 8. Adding an incident

A project on ai-scrum ≥ 4.10.0 finds most of them itself: a `missed` in a sprint's first line or
its `review.md` carries the row ready to paste. Then:

1. A row in §2: date, project and run/PR/commit, the failing step's message verbatim, the
   sprint's `releasable:` line if there was one, the mechanisms.
2. No mechanism fits → a new M8 in §3 with its evidence.
3. A fix shipped → a row in §4 and the status in §5. A countermeasure that should have
   prevented the incident and did not → say so in its status.
4. Update the header: count, last incident, next step.

Evidence without a token, for public repos: `api.github.com/repos/<owner>/<repo>/actions/runs`,
`…/actions/runs/<id>/jobs` (failing step), `…/check-runs/<job id>/annotations` (the message).
The sprint verdict is never in the repository (phase 4 step 5) — it is in the session transcript
under `~/.claude/projects/<project>/`.
