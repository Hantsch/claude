# Plugin decomposition proposal — 2026-08-14

**What this is.** Phase 2 of the portfolio initiative: the proposed plugin cut for this
marketplace, distilled from the exploration findings in
[2026-08-14-portfolio-review.md](2026-08-14-portfolio-review.md). Three independent designs were
produced (lenses: lean/low-maintenance, composable-per-stack, ownership-mechanics-first) and
synthesized into this recommendation. Nothing has been built yet — this document is for review.
Decisions the user must make are collected in the last section; the skills cannot be authored
before decisions 1–5 are settled, because they encode the rulings.

**The one structural choice.** All three designs agree on content, sources, merge plans and
mechanisms almost verbatim. They differ only in plugin boundaries:

- *Lean*: one new plugin ("guidelines") holding all stack rules + the spec pipeline. Fewest
  release surfaces (3 changelogs total), but an Electron-only repo would carry .NET rules.
- *Per-stack* (recommended): one plugin per stack/concern. A repo enables exactly what fits it —
  which is the stated goal ("repository-specific install") taken literally. Cost: more
  README/CHANGELOG surfaces, each small and single-topic; releases are already automated.

The rest of this document describes the per-stack cut. The lean alternative is noted at the end.

## Recommended cut

| Plugin | Status | Wave | Mechanism | Contents |
| --- | --- | --- | --- | --- |
| common | extend | v1 | direct-ship | + karpathy skill, premortem command |
| dotnet | new | v1 | direct-ship | backend-guidelines, composition-root, csharp-unittest skills |
| react | new | v1 | direct-ship | frontend-guidelines, design-tokens (+ mobile-a11y) skills |
| electron | new | v1 | mixed | electron-arch + typed-ipc skills; launch.js + json-store one-time templates |
| spec-kit | new | v1 | direct-ship | code-analyse, feature-doc skills; implement-feature command |
| ai-scrum | extend | v1 | installer (unchanged) | harvest: concept format, gitignore check, systems/concepts ritual, version.md DoD profile knob |
| project-docs | new | v2 | direct-ship | claude-md, agents-md, project-brief commands; architecture-doc template; version-md skill |
| deploy | new | v2 | installer | deploy.sh (synthesized), deploy.yml, VERSION.md gate, compose example |
| llmwiki | new/repo | v2 | installer *or* template repo (decision 13) | de-branded llmwiki-template payload |

Three lifecycles, stated once and reused everywhere (this is the mechanics-lens contribution):

1. **Direct-ship** — content lives in the plugin, `/plugin update` is the whole update story,
   nothing plugin-owned ever sits in a consuming repo. Used for all rules/skills/commands. This
   is the direct cure for the portfolio's dominant disease: the same rule text committed 3–9
   times and drifting (karpathy ×8 encodings, frontend rules ×4, backend rules ×5).
2. **Installer** (ai-scrum's marker + lock convention, generalized into one documented
   convention with a `# <plugin>:managed` shell variant) — only where plugin-owned files must be
   committed and executed without the plugin present: ai-scrum workflow, deploy scripts, llmwiki
   scaffolding. Nothing else inherits installer complexity.
3. **One-time templates** — code copied into a repo once and user-owned forever (launch.js,
   json-store.ts, compose example). No markers; re-copying is a deliberate manual act.

Per-repo enablement: the user commits an `enabledPlugins` block in the repo's
`.claude/settings.json` themselves — plugin READMEs propose the snippet, never write it
(house rule).

## Plugin details

### common (extend, v1)

- **skill `karpathy`** — the four behavioral rules, from the canonical MIT-attributed
  `AI_Tool_Shed/skills/karpathy-guidelines/SKILL.md`; keep license + the "biases toward caution"
  caveat; optionally fold in MMO's "deliver iteratively" bullets. Becomes the ONLY copy; all 8
  other encodings retire during migration. Deliberately a skill, not an output style (styles are
  mutually exclusive with Briefing/KIS and don't reach subagents).
- **command `premortem`** — from `AI_Tool_Shed/skills/premortem` (already command-shaped:
  `user-invocable: true`, trailing `$ARGUMENTS`). Add a step 0 that gathers the plan context.
- v2: **command `secrets-scan`** (new authoring) — scan staged changes/source for credentials,
  connection strings, tokens-in-logs; motivated by the real leaked Mongo password in
  AlbionHelper and DiaryApp's token logging. Until then: run the built-in `/security-review`.

### dotnet (new, v1)

- **skill `backend-guidelines`** — base: `AI_Tool_Shed/skills/backend-guidelines` (already
  genericized; two byte-identical .github copies exist). Merge WatchedIt v2 additions
  (`Options/`/`Models/` folder rules, WebApplicationFactory integration tests) and VereinsApp's
  `.Infrastructure`/`ISystemContext` as an optional layout. Restore the silently-dropped no-Moq
  rule. Encode decisions 2/3/4 (namespaces, records, `this.`). Add one rationale sentence per
  taste rule.
- **skill `composition-root`** — from `AI_Tool_Shed/skills/backend-composition-root`; strip the
  provenance anecdote; rescope the extension-method ban per decision 1 so it stops contradicting
  backend-guidelines.
- **skill `csharp-unittest`** — near verbatim (cleanest skill in the set); couplings to
  code-analyse become "if available" phrasing.
- Deferred: StyleCop pairing (blocked on decision 10 — analyzer source not located).
  v2: a `review` command applying the 15-item checklist to diffs.

### react (new, v1)

- **skill `frontend-guidelines`** — base: `AI_Tool_Shed/skills/frontend-guidelines` (newest of 4
  copies; already has duplicate-JSX scan + the "host agents.md overrides the skill" precedence
  clause). Merge the three unmerged improvements: WatchedIt v2 (pages ≤150 lines, mandatory
  primitives, foreign-reference-resolver procedure), IrishFire's "similar component found —
  use as-is / extend / create new" ask-user protocol. Fix: i18n section becomes conditional
  (decision 11).
- **skill `design-tokens`** — distilled from hantsch-web-design-system (rgb-triplet custom
  properties + `token()` helper + role vocabulary — the deliberate extraction, canonical per
  decision) + second-brain's "raw palette class is a bug" / one-accent-per-screen rules
  (parameterized) + GC-APP's mobile-a11y DoD (touch targets per decision 5, safe-area, 16px
  anti-zoom, focus-visible, reduced-motion, no color-only info). Written as a *method*, not
  "the" canonical system (Gaston provenance repos are absent from this machine).

### electron (new, v1; ui-verify v2)

- **skill `electron-arch`** — layering + security in one checkable skill: pure `src/core`,
  main-only fs with `assertInside` path containment, narrow typed preload, security checklist
  (contextIsolation+sandbox, CSP header, permission-deny, zod at every boundary, http(s)-only
  openExternal, arg-array spawn, single-instance). Winning variant: q2-launcher (newest) +
  q2-config-manager's assertInside; drive-cleanup's generation retired.
- **skill `typed-ipc`** — q2-launcher's contract-first recipe (IpcInvokeMap/IpcEventMap,
  `as const satisfies` allowlists, `Exclude<>` exhaustiveness, boot-time
  assertContractFullyHandled) + second-brain's ipc-coverage meta-test.
- **templates `launch.js`, `json-store.ts`** — verbatim/genericized one-time copies
  (env-scrubbing launcher; atomic self-healing JSON store with quarantine + MIGRATIONS table).
- v2: **skill `ui-verify`** — second-brain's Playwright `_electron` harness
  (seed → shot → a11y, axe-core gate); the concrete implementation of ai-scrum's
  `live-smoke-required` flag. Needs genericizing of the vault/seed coupling.

### spec-kit (new, v1)

- **skill `code-analyse`** — near verbatim; `doc/analysis/` becomes a stated default; couplings
  soften to "if available".
- **skill `feature-doc`** — merge toolshed base with GC-APP twin; "exactly five files" becomes
  "five core files + declared extension docs" (cicd.md precedent); standardize `doc/feature/`;
  add backend-only/CLI guidance.
- **command `implement-feature`** — convert from Copilot `.prompt.md`; de-brand IrishFire names
  and the hardcoded stack; DELETE the inlined third encoding of the rule sets, reference the
  dotnet/react skills + project agents.md instead; registration step follows decision 1.

### ai-scrum (extend, v1 — harvest only)

- `/concept` output gains drive-cleanup's concept.md shape (in-scope / deliberately-not-in-v1 /
  permanent non-goals with rationale; tech-decision table; open points answered inline).
- `setup` gains the gitignore-safety check (second-brain's `vault/` incident) — v2 ok.
- docs-readme template gains MMO's systems/-vs-concepts git-mv promotion ritual.
- profile gains an optional `changelog-path` knob carrying the version.md DoD ("every
  user-facing change under `# Features` / `# Fixes`, short, punchy, a little funny"); /build and
  /sprint get the DoD bullet, active only when set.
- Extract `docs/installer-convention.md` (marker syntax incl. shell variant, lock schema, file
  classes, propose-never-write rules) so deploy/llmwiki reuse one convention.
- Verified: `/concept` already ships in 2.0.0; WatchedIt's cost-discipline wording is mostly
  absorbed — cross-check, fold in remainders.

### v2 wave

- **project-docs** — `claude-md` (house format: what-this-is / Language / one-command-to-run /
  Layout-as-invariants / rules-with-rationale, ~50 lines; user-invoked, diff-then-confirm),
  `agents-md` (agentsmd-project rework: karpathy becomes a pointer, monorepo assumption dropped,
  master direction per decision 7), `project-brief` (PROJECT.md), architecture-doc template,
  version-md skill. v2 because it needs genuine format unification, and generated files are
  user-owned (no markers by design).
- **deploy** — installer; WatchedIt deploy.sh as base + RpiHomeAccess BR-spec + GC-APP
  GIT_COMMIT-on-/health; VERSION.md gate extracted once (fixes the CI/script duplication).
  v2 because the three script generations were never diffed — synthesizing that diff is the
  plugin's first task; shipping one generation blindly would freeze the wrong one.
- **llmwiki** — de-brand Globestage everywhere; hooks are proposed (paste-ready snippet), never
  written. Plugin-vs-template-repo is decision 13.

## Prerequisite: validator + docs work (first commit of the effort)

Verified gap: `scripts/validate.ps1` has zero `skills/` handling and CLAUDE.md's completeness
rule omits skills. Before any v1 plugin ships:

1. Validate `plugins/*/skills/<name>/SKILL.md`: file exists (empty skill folders = hard error),
   frontmatter requires `description`, `name` (if present) must equal folder name, strict
   type-check on `user-invocable`/`disable-model-invocation` booleans (misspelled flags are
   silently ignored by Claude Code — same rationale as the output-style strictness).
2. Extend "at least one of" to commands/agents/output-styles/skills — in validate.ps1, CLAUDE.md
   authoring rules, and the repo-structure diagram.
3. Run the `${CLAUDE_PLUGIN_ROOT}` + bare-`templates/<path>` reference scans over SKILL.md too.
4. Generalize the managed-marker check from ai-scrum-specific to any installer plugin
   (marker `<!-- <plugin>:managed ... -->` + shell variant); distinguish managed payload from
   free-form one-time scaffold templates by directory.
5. All in PS 5.1 / ASCII / BOM-less per existing constraints.

## AI_Tool_Shed disposition (after v1 ships)

- `skills/` — all nine emigrate (see cut above); empty `agentsmd-techstack/` deleted now.
- `ai-scrum/` — delete (verified obsolete German ancestor of plugin 2.0.0; nothing generic lost).
- `prompts/implement-feature.prompt.md` — delete after conversion.
- `new project template/` — delete (drifted third copy of the rule sets; role replaced by
  skills + project-docs).
- `PROJECT.md` — delete (blank; template moves to project-docs).
- `llmwiki-template/` — stays until decision 13 executes.
- `features/` packs — keep as a feature-spec **library** (content, not tooling); LegalPages
  deliberately never genericized (lawyer-review risk).
- `openclaw/` — move to a separate ops repository (orthogonal to Claude tooling).
- End state per decision 12: pure feature-pack library, or archive read-only with inbox/ here as
  the only staging area.

## Migration of the 14 repos (ordered)

0. Marketplace: validator work; settle decisions 1–5; ship v1 plugins.
1. **WatchedIt** — delete `.github/skills/` (9-copy, one drifted — after confirming the drifted
   frontend copy has nothing unmerged) and `.github/prompts/`; `/ai-scrum:setup` replaces the
   German /refine+/build (dead Sim/Godot/Studio references); remove dead `ponytail` setting; trim
   agents.md files to project facts; fix the records self-contradiction per decision 3. Keep the
   Architect/Implementer/Reviewer trio local (revisit as ai-scrum harvest later).
2. **RpiHomeAccess** — delete all five `.github/<name>/SKILL.md` copies (byte-identical,
   undiscovered location) + the karpathy-only placeholder agents.md; enable dotnet+react+common.
3. **drive-cleanup** — delete `.github/frontend-guidelines/` + placeholder agents.md; enable
   react+electron+common.
4. **GC-APP** — `/ai-scrum:setup`; delete the unreferenced 11-agent persona pack and the stale
   CLAUDE.md twin (AGENTS.md stays master until project-docs regenerates); drop local
   feature-doc for spec-kit; keep the imported web-audit skill pack local.
5. **Hantsch-MMO** — `/ai-scrum:setup` with `doc-language: de`; keep its 5 project skills +
   .codex image skills; delete empty `.agents/`, `scheduled_tasks.lock`, dead ponytail setting.
6. **IrishFire-App** — delete the Copilot prompt; keep `update-roles` local; trim agents.md
   hierarchy to facts + pointers; enable dotnet+react+spec-kit+common.
7. **VereinsApp** — enable dotnet+common; record `.Infrastructure` variant + restored Moq ban as
   project deltas; StyleCop waits on decision 10.
8. **second-brain / q2-launcher / q2-config-manager** — enable electron+common (they are the
   source repos; their CLAUDE.md files stay — they ARE the house-format exemplars); `delegate`
   skill stays local.
9. **hantsch-web-design-system** — enable react+common; gets its first CLAUDE.md via
   project-docs (v2).
10. **AlbionHelper / DiaryApp** — no convention migration (pre-standard, rejected candidates);
    **rotate the leaked Mongo password now** and run a secrets pass regardless.
11. **AI_Tool_Shed** — execute disposition, last.

Rule throughout: every deleted copy is replaced by an enabled plugin or a one-line pointer,
never by nothing.

## Decisions for the user

Structural:

- **D-A. Plugin cut** — per-stack (5 new v1 plugins, recommended) vs lean (1 new "guidelines"
  plugin). Per-stack matches "install exactly what the repo needs"; lean minimizes release
  surfaces. All content is identical either way, so this is reversible later at the cost of a
  major version.
- **D-B. Approve the validator/CLAUDE.md scope change** (skills as first-class plugin content).
  Gate for everything. Recommended: yes, as the first commit.

Rule contradictions (encoded into the skills, must be settled first):

1. **Module registration** — composition-root bans extension methods; backend-guidelines
   mandates `Add<Module>Module` extensions. All three designs recommend the same hybrid:
   extensions ONLY as the module-boundary API (`Add<Module>Module` + `AddApplicationPart`),
   named static `Configuration/` classes for host-internal wiring; both skills state the
   boundary.
2. **Namespaces** — block (5 repos + skill) vs file-scoped (GC-APP). Recommended: block;
   verify against the StyleCop analyzer before finalizing (see 10).
3. **Records** — "never records" (skill + 3 repos) vs WatchedIt root's "records preferred for
   DTOs". Recommended: no-records; if a DTO exception is wanted, write it as an explicit
   exception.
4. **`this.` prefix** — mandatory (IrishFire lineage) vs absent (GC-APP). Recommended: keep
   mandatory (pure taste — one line either way).
5. **Touch targets** — 44px vs 40px (intra-GC-APP drift). Recommended: 44px minimum flat.
6. **Commit conventions** — scope, don't unify: Conventional Commits only where automation
   consumes it, story-ID on ai-scrum sprint branches, informal elsewhere; documented as a
   fill-in slot, no universal mandate.
7. **Master-file direction** — CLAUDE.md master + AGENTS.md one-line pointer (recommended;
   marketplace/MMO precedent), second-brain's prepend-summary as opt-in variant.
8. **Karpathy delivery** — skill in common + pointers from generated docs (recommended); any
   pasted block re-creates the 8-copy drift. Accepted cost: non-Claude agents (Codex/Copilot)
   only see the pointer.
9. **Moq** — reaffirm the ban portfolio-wide (load-bearing for csharp-unittest's method).
10. **Hantsch.CSharp.StyleCop 1.0.4** — source repo not in the portfolio; locate it before the
    dotnet skill claims analyzer parity (it may contradict 2–4). Until then: prose-only.
11. **i18n rule** — make conditional: "externalize strings via the project's i18n library; do
    not introduce one where none exists" (react-intl mandate currently contradicts q2-launcher's
    i18next and the toolshed's own no-i18n scaffold).
12. **AI_Tool_Shed end state** — feature-pack library (keep) vs archive read-only after
    emigration. Slight lean: archive; inbox/ here becomes the single staging area.
13. **llmwiki** — installer plugin (auto-updates schema/linter, reuses the convention) vs
    standalone de-branded template repository (scaffold-once, zero release overhead, no
    settings.json tension). Genuinely open; template repo is the cheaper start.
14. **Skill-location cleanup** — delete ALL repo-local copies of standard skills; genuinely
    project-specific skills live at `.claude/skills/` only; repos still using Copilot need an
    explicit exception note (`.github` discovery semantics were never confirmed).
