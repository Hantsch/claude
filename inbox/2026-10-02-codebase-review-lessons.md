# What a whole-codebase review says about the harness — lessons from q2-launcher after 31 sprints

*Draft, 2026-10-02. Not shipped by any plugin. Source: the q2-launcher review of 2026-10-01
(`docs/reviews/2026-10-01-codebase-review.md` in that repo, 75 findings F01–F75, stories 199–231).*

## 1. Summary

q2-launcher ran 31 sprints and 197 stories on ai-scrum 4.x and tech-rules without a code or
architecture review. The review found the project healthy where the house rules cover it (typed
shell IPC, sandboxed renderer, pure shared layer, atomic persistence, fast unit suite, token
discipline) and structurally weak in five places. Three of the five trace back to the harness
itself, not to the project:

1. **The harness encourages mirroring by copy.** `refine.md` tells the planner to name "the file
   to mirror" per deliverable; `build.md` tells the implementer to start from the listed files and
   search only for what is missing; the duplicate scan in `frontend-guidelines` looks at
   "surrounding JSX" within one edit. The project shows the result: "Mirrors X exactly" glues 36
   copies of a read-on-mount hook, 12 name dialogs, 9 job lifecycles, 11 row parsers next to the
   helper written for them, 6 fetch wrappers. Copies have drifted into bugs (a containment check,
   an Enter-key double submit, a category default, a sort sentinel).
2. **`typed-ipc` stops at the shell channel.** `electron-arch` prescribes a module bus
   (`{ moduleId, type, payload }`) and says nothing about typing it. The project built the bus as
   described; it now carries 138 of 188 handlers (73 % of the IPC surface) as string names, cast
   results and a doubly wrapped `Outcome<Outcome<T>>`.
3. **"Pre-existing" is a dead end.** `sprint.md` phase 2b reports a pre-existing gate failure
   "not bisected, not fixed here" and stops. Four flows stayed red for five sprints; "pre-existing"
   appears 60 times across the reviews; the roadmap lists them three times; every gate paid ~10
   minutes of attribution for the same four. No quarantine, no ageing, no promotion rule.

Two smaller harness-caused patterns: 4,800 story-number references in source (deliverable and
review-round ids in comments, "Reversed by story 079 (was …)"), and test files that are
story-chronological append logs with a private fixture harness per file, both consequences of
"the test belongs to the deliverable" plus "do not survey the repo" without a convention for where
tests and fixtures live.

## 2. Evidence, per pattern

| Pattern | Measured in q2-launcher | Harness text that produced it |
| --- | --- | --- |
| Copy-mirroring | `let cancelled = false` 36x in 26 renderer files; `[submitting, setSubmitting]` in 29 files; 9 job files re-implement AbortController + settled IIFE + 4 identical closures; `parseXRow` 8x beside `parseForgivingRows` (whose comment says it exists to stop exactly this); 3 `isInsideDir` copies disagreeing on the trailing-separator rule | `refine.md` step 4: "plus the file to mirror, where it follows an existing pattern"; `build.md` step 3: "start from those files instead of surveying the repo"; `deliverable-hard.md`: "A wide survey is the most expensive thing you can do here" |
| Untyped module bus | 138 bus handlers vs 50 shell channels; 125 hand-chosen `callModule<T>` generics; registry wraps every return in `ok()` so handlers returning `Outcome` yield `Outcome<Outcome<T>>`, flattened four different ways; a shipped user-facing crash recorded in `replays/client.ts` | `electron-arch` "Adding a feature": envelope described, typing absent; `typed-ipc`: shell map only |
| Pre-existing gate failures | 4 flows red S27–S31; 132/136 flows in 49 min + ~10 min attribution per gate; root causes written down in S27 and never acted on | `sprint.md` 2b.3 "Pre-existing: … reported as pre-existing, not bisected, not fixed here"; `roadmap.md` has no ageing rule for follow-ups |
| Shell owns module state | `lib/schemas.ts` 1,655 lines, 55 commits (13 % of all commits); every module since story 071 edited 3 shell files + 2 shell tests; 4 read-await-write races from whole-section setters | `electron-arch` step 3: module "never touches the state file directly", with no module-owned alternative offered |
| Half a lifecycle | `disposeAll()` has no production caller; `before-quit` fires `settle()` unawaited; modules keep module-level `let` singletons to make a static `dispose()` reachable | `electron-arch` has persistence rules but no shutdown order; the module shape has `setup`, `dispose` is optional and nothing says who calls it |
| Story ids in code | 4,780 `story NNN` references in non-test source; 55 % comment share in the largest files; "story-045 review round 2, finding 4" as a comment form; `[diag187]` log lines in production | D-numbered deliverables and review findings are the only names an agent has for what it does; no comment convention anywhere in the harness |
| Tests as append logs | `round-trip.test.ts` 3,613 lines, 36 of 38 describes named after stories; 7 ControlsTab test files each with 120–280 lines of private fixture/mount preamble; `makeInstallation` in 10 test files | `build.md`: "If the named test file does not exist yet, it creates it next to the project's existing ones and follows their shape"; no profile key points at shared test support |
| Gate regressions from brittle flows | every S27–S31 gate bisect had the shape "flow asserts another story's incidental detail" (fixture ordinal, Tab count, literal cvar value, stage pixel geometry) | `ui-verify` Flows section says how to write a flow, not what it may assert |
| Fixture drift | `scripts/lib/fixture.mjs` 5,737 lines, 97 "Mirrors src/…" comments, `STATE_SCHEMA_VERSION` 1 vs 5 in src; `waitForScan` copied into 22 flows, UDP responders into 15 | `ui-verify` fixture section: "generate it, do not point at the developer's data", nothing on validating it against the real loader; `lib/` exists in the shape but no rule routes shared steps there |
| Docs lag | CLAUDE.md said modules "scaffolded but not implemented" at 0.6.0; 3 concepts still "Draft, no stories yet" with their phases done; 4 shipped modules without a systems doc | `docs-readme.md`/`roadmap.md` have the concept→systems rule, but it is one sentence inside `check` and never fired; no story step touches a systems doc |
| Deviation table bloat | 15 of 17 CLAUDE.md deviation rows are the same 44px rule, ~550 characters each, read by every agent on every task | `design-tokens`: "44 flat, no per-component exception"; `ui-verify` contradicts it ("a mouse-driven desktop app … has no such floor"); the managed block says "a deviation is recorded here" without saying at which granularity |
| No architecture review | 31 sprints, 0 reviews; each sprint review sees only its sprint | no ritual in ai-scrum for it |

## 3. Root causes, ranked

1. **Cost discipline without a reuse rule.** Every lever that cut agent cost (lean prompts, no
   survey, mirror a named file, 35-call budget) also cut the chance an agent finds the existing
   helper. Reuse needs its own instruction and its own review item, or it loses to the budget.
2. **Skills describe shapes, not their checks.** `electron-arch` says "it is checkable, so check
   it" and ships no check; `typed-ipc` ships the coverage test for shell channels and nothing for
   the bus it co-prescribes. What has a test held (shell IPC, shared purity); what had prose did
   not (module boundaries, state ownership, lifecycle).
3. **Findings have no ageing path.** Review → "Follow-ups worth doing" → nothing. Pre-existing →
   review text → nothing. Unfixed review findings → review text → nothing. Each is correct locally
   and accumulates globally.
4. **The agent's only vocabulary is the story.** Without a comment or test-naming convention,
   `D3`/`AC7`/"review round 2" is what it writes.

## 4. Proposals

### A. ai-scrum command text (payload in `templates/workflow/`)

- **A1 — `refine.md` step 4, the mirror instruction.** Replace "plus the file to mirror, where it
  follows an existing pattern" with: "plus the file to mirror **or the helper to reuse**. Count
  before you name a mirror: if the shape already exists twice, the D first extracts the shared
  helper (name its target path) and then uses it; a third copy is a refine error, not an
  implementation choice." Add to the size cap paragraph: "a D that says 'mirror X' for a shape X
  itself mirrors is cut wrong."
- **A2 — `build.md` step 3, the deliverable prompt.** Add two instructions: "If the D names a
  helper to reuse, use it; if you find yourself copying more than ~10 lines from the file to
  mirror, stop and return `PARTIAL: shared shape — <file>:<lines> exists in <n> places` so refine
  can cut an extraction D." And: "Comments state the invariant or the non-obvious why. A story
  pointer is a trailing `(story 042)` at most; never deliverable or criterion ids (`D3`, `AC7`),
  never review-round or 'used to be' narrative."
- **A3 — `build.md` step 6, review assignment.** Add (e) "copied shapes: a block the diff adds
  that already exists elsewhere in the tree (search for its distinctive line) is a finding, with
  the existing location" and extend (d) with "comments that narrate story or review history
  instead of stating an invariant". Same two lines in `story-review-hard.md`.
- **A4 — `build.md` step 3 and `deliverable-hard.md`, tests.** "Tests go into the file and
  `describe` named after the behaviour, never after the story (`describe('story 045')` is
  rejected in review). Use the project's shared test support (profile key `test-support`, below)
  before writing a fixture, builder or fake of your own; if none fits, say so in the return."
- **A5 — `sprint.md` phase 2b step 3, pre-existing and flaky.** After the verdict: "A
  `pre-existing` or `flaky` test is written into the project's quarantine list (profile key
  `e2e-quarantine`) with the sprint, the test and the one-line cause from the attribution agent,
  and gets one line under the roadmap's follow-ups. The gate counts quarantined tests as expected
  failures and reports an unexpected pass. A test still quarantined two sprints later is a story
  at the next `/roadmap plan`, not a follow-up." Step 5's record names the quarantine entries.
- **A6 — `roadmap.md` mode `check`, ageing.** New step between 3 and 4: "Age the follow-ups: a
  line older than three sprints (by its source link) is promoted to a story draft or deleted with
  the reason in the report; a quarantine entry older than two sprints likewise. List concepts
  whose phase or milestones are all `done` and move each to `systems-path` now (`git mv`, status
  line), naming them in the report — do not leave this to judgement."
- **A7 — `sprint.md` phase 3, unfixed review findings.** "Every deliberately unfixed review
  finding becomes a follow-up line (small, no decision) or a story draft (anything else) in this
  step; the review's findings section links to them and carries no list of its own. Measured: S29
  ~15 and S30 ~25 unfixed items that never left the review."
- **A8 — a systems-doc touch.** `refine.md` step 4: "If the story changes a system that has a
  doc under `systems-path`, one D updates that doc (or the D that changes the behaviour does);
  `/build`'s review checks it under (c)." `roadmap.md` check lists systems docs older than their
  module's last story commit.
- **A9 — an architecture review ritual.** Either a new mode `/roadmap review` or a command
  `/common:architecture-review`: runs at a phase end or on demand, dispatches one reviewer per
  dimension (layering/security, IPC contract, services, each module, renderer state, tests and
  tooling, docs and process, cross-module duplication, robustness), dedupes, verifies each
  finding with one refuter and one value judge, writes `docs/reviews/<date>-codebase-review.md`
  (verdict, story map, findings table with verification level) and one story draft per
  confirmed cluster. The q2-launcher run is the template; its one operational lesson is a cap of
  about 40 verify agents per invocation — a 164-agent fan-out hit the session limit and then the
  weekly limit. Phase ends are the trigger because the sprint review structurally cannot see
  across sprints.

### B. ai-scrum templates and profile

- **B1 — `requirement.md`:** add `## Decisions (Sprint)` after `## Open Questions` with a
  one-line placeholder ("filled by `/sprint`'s clarification round and by refine inside a
  sprint"). 176 of 195 done stories carry the section at agent-chosen positions.
- **B2 — `sprint.md` template:** add `## Regression gate` (phase 2b step 5 says "append the
  section if missing"; make it present).
- **B3 — `requirement.md` and `requirements-readme.md`:** the example test paths
  (`tests/e2e/<flow>.spec.ts`, `tests/core/<module>.test.ts`) read as the convention. Replace
  with placeholders the setup fills from the profile (`<e2e-story example>`, `<test example>`),
  or label them "examples; your paths are in `.claude/ai-scrum.md`".
- **B4 — `project-profile.md`:** two keys under `## Verify`/`## Conventions`:
  `test-support: <paths to shared fixtures, builders, fakes — pasted into every deliverable prompt; none>`
  and `e2e-quarantine: <path of the expected-failure list the e2e-all runner reads; none>`.
  `setup.md` asks for both with "none" as default.
- **B5 — `roadmap.md` template:** the follow-ups section's rule line gains "lines older than
  three sprints are promoted or removed by `/roadmap check`".

### C. tech-rules skills (payload in `templates/skills/`)

- **C1 — `typed-ipc`: "The module bus is a contract too".** New section after §6: per-module
  handler map in the shared layer shaped like `IpcInvokeMap` (`'news.get': { req: void; res:
  NewsFeed }` plus an events branch); `defineModule<H>(id)` in main whose `handle` derives
  payload, schema and result from the map; `createModuleClient<H>(id)` in the renderer; the
  registry **passes a handler's own `Outcome` through** and wraps only plain values (one
  envelope, never `Outcome<Outcome<T>>`); a coverage test per module (registered set equals the
  map, every handler has a renderer caller or a flow-only allowlist entry); the module-id enum
  derived from the manifest list. Review checklist: "+ a bus handler is typed from its module's
  map; no `callModule<T>` cast".
- **C2 — `electron-arch`: "Adding a feature" grows two steps and a shutdown rule.** Step
  "Persisted state — the module registers its section (schema, forgiving parse, defaults) with
  the shell's store at setup; the shell file holds shell state only; a slice is changed through
  a section mutator, never read-spread-set across an `await`." Step "Lifecycle — setup registers
  its disposers; the shell's `before-quit` calls `preventDefault()`, awaits dispose + every
  store's `settle()` under a bounded timeout, then quits. No module-level mutable state to make
  a static `dispose` reachable." Checklist items for both.
- **C3 — `electron-arch`: the layering test.** Give "it is checkable, so check it" a shape: one
  test walking the tree (shared imports no `node:`/`electron`/DOM; renderer no `electron`/`node:`;
  `modules/<a>` imports nothing from `modules/<b>` outside an allowlist that names the deciding
  story; shell files import only the module index/registry; no `electron` import and no
  `process.env` read under `modules/`). Name `oxlint` as a TS-version-independent linter with
  `no-restricted-imports` for the same rules. Checklist: "the layering test exists and the
  allowlist has no entry without a story reference".
- **C4 — `ui-verify`: what a flow may assert, quarantine, fixture parity, shared steps.** Flows
  section: "A flow asserts user-visible outcomes and `data-testid`s; never literal config values,
  element counts, fixture ordinals or pixel geometry — those are other stories' implementation
  details and the gate's most common false red." Runner: "`flows` reads an expected-failure list
  (`{ flow, reason, story, since }`), reports expected fail / unexpected pass, exits 0 only when
  every non-quarantined flow is green." Fixture: "a test loads every fixture variant through the
  app's real state loader and fails on a migration warning or a dropped row; constants the
  fixture shares with the app are imported, not retyped." Shape: "shared steps live in `lib/`;
  a helper declared in more than three flows is a finding."
- **C5 — `design-tokens`: the floor for desktop-only apps.** After the touch-target rule: "A
  mouse-and-keyboard-only desktop app records **one** project-wide deviation naming its own
  floor (e.g. 28 px dense controls, 24 px in-row selects) and the surfaces below it, not one
  row per control. `ui-verify`'s accessibility gate reads that floor from the stylesheet." This
  also removes the contradiction between the two skills.
- **C6 — `frontend-guidelines`: an Electron-renderer section or group.** The skill assumes
  Atomic Design folders, a server-state library, pages/templates and Storybook; in an Electron
  renderer organised as shell + modules none of that applied, so its data-fetching and
  primitives rules never bound. Either a short "In an Electron renderer" section (main-owned
  data through one query hook over the IPC client; mandatory primitives `NameDialog`,
  `ConfirmDialog`, `Tabs`, one `ErrorBoundary`; placement rule inside a module: view + tabs at
  root, `components/`, `dialogs/`, `hooks/`, React-free `lib/`; state rule: main-owned → query
  hook or mirror store, cross-view → module store, subtree → context) or a separate
  `electron/renderer-guidelines` skill that `setup` installs instead of `react/frontend-guidelines`
  when it detects Electron.
- **C7 — `tech-rules` managed block wording.** "A deviation is recorded here, with its reason"
  → add "one row per rule deviated from, listing the places; never one row per control".

## 5. What would change

- A new list panel in a module costs one hook import instead of 40 lines; the third copy of a
  shape is a refine finding before it is written (A1–A3).
- A renamed bus handler or changed result shape is a compile error, not a click-time failure
  (C1).
- A gate failure is red once: the second time it is either quarantined with an owner and an
  expiry or a story (A5, A6, C4).
- A module can be added without editing the shell's schema file, and the app flushes on quit
  (C2).
- An agent reading a comment learns the rule, not the sprint it came from (A2, A3).
- The project gets a review every phase instead of every 31 sprints (A9).

## 6. Caveats

- Evidence is one project. The copy-mirroring and pre-existing patterns are the ones most
  likely to generalise, because they follow from command text that applies to every consuming
  repo; the bus and state findings depend on a project having built the module bus the skill
  describes.
- F15–F75 of the source review were verified by the reviewers and hand spot-checks only; the
  adversarial verify pass covered F01–F09, F13, F14 before hitting usage limits. Counts quoted
  here from that range are approximate.
- A1–A4 add instructions to prompts that were deliberately slimmed for cost (see
  `docs/reviews/2026-09-29-sprint-token-followup.md`). Each is one or two sentences; the
  trade-off should be measured the same way the token levers were.
