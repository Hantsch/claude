# Portfolio architecture review — phase 1 exploration report

**Date:** 2026-08-14
**What this is:** The consolidated exploration report of a full portfolio architecture review across the owner's repositories under `C:/dev/Hantsch`. It records the state of every project, the cross-repo convention landscape, and a deep dive into the AI_Tool_Shed staging repository. It deliberately contains **no plugin-decomposition recommendations** — those belong to a separate proposal document.
**How it was produced:** A 15-agent review: 13 per-project review agents (AlbionHelper and DiaryApp reviewed in one pass), one cross-repo convention-diff agent, one AI_Tool_Shed deep-dive agent, followed by a verification/critique pass whose corrections are folded into this report (see "Corrections from verification").
**Scope:** 14 projects (AlbionHelper, DiaryApp, drive-cleanup, GC-APP, Hantsch-MMO, hantsch-web-design-system, IrishFire-App, q2-config-manager, q2-launcher, RpiHomeAccess, second-brain, VereinsApp, WatchedIt, plus the AI_Tool_Shed staging repo) evaluated against the standards of the marketplace repository `C:/dev/Hantsch/claude`.

---

## Portfolio at a glance

| Project | Stack | Maturity | Overall health |
|---|---|---|---|
| AlbionHelper | .NET 9 + Mongo + NATS + CRA React | Abandoned experiment (~1.3k LOC) | Historical value only; leaked Mongo password, concurrency bugs, no tests |
| DiaryApp | Vite + React 19 + Google auth spikes | Abandoned PoC (~850 LOC) | Three parallel auth spikes, dead code, undeclared deps; pre-AI-tooling era |
| drive-cleanup | Electron 43 + React 18 + Tailwind 4 | Working v1, dormant | Polished secure Electron layout, but zero tests/CI and a misfiring generic skill |
| GC-APP | .NET 9 modular monolith + React 19 PWA | Production (v1.16.0, real users), paused | Strong architecture and workflow, but committed service-account key, stale/contradictory rule files, no CI gate |
| Hantsch-MMO | .NET 8 sim + Godot 4.7 + Electron Studio | Active large prototype (11 sprints) | Incubator of ai-scrum; exemplary discipline, but no CI, a 2311-line god-file, German/English split |
| hantsch-web-design-system | React 19 + Tailwind tokens, DesignSync | Young extraction (3 commits) | Excellent token system; no README/tests/CI, neutralization leftovers |
| IrishFire-App | .NET 9 modular monolith + React 18 PWA | Real v1.0.0 for a club, idle | Rule-abiding codebase and superb feature docs; zero tests, dead Storybook artifacts |
| q2-config-manager | Electron 33 + TS strict + Vitest | Discontinued one-day MVP, code donor | 106 green tests, source-cited engine facts; core layering rule violated by scanner.ts |
| q2-launcher | Electron 43 + React 19 + Zod | Brand-new MVP (3 commits, today) | Best-in-portfolio typed IPC + security posture; one test file, no CI, prefix-match path allowlist |
| RpiHomeAccess | Python GPIO + .NET 6/9 + React PWA | Production (real doors), active | Zero-trust design done right; live secrets committed, Flask dev server + weak HMAC compare on the Pi |
| second-brain | Electron 41 + React 19 + MiniSearch | Feature-complete v0.1.0, broken-as-cloned | Machinery-enforced boundaries and honest gates; src/core/vault/ lost to a gitignore bug, no CI |
| VereinsApp | .NET 9 multi-tenant + Next.js 15 Turborepo | Broken mid-rewrite prototype, dormant | Does not compile; workspace packages swallowed by .gitignore; strong rulebook, weak execution |
| WatchedIt | .NET 9 modular monolith + React 19 PWA | Production, actively developed | Best rules-follow-through and deploy pipeline; wrong-project command copies, stale AGENTS.md paths |
| AI_Tool_Shed | Markdown skill/template library | Staging repo, mixed vintage | Genuine canonical skill library with real duplications, contradictions, and a dead German ai-scrum ancestor |

---

## Per-project reviews

### 1. AlbionHelper + DiaryApp

**Purpose.** AlbionHelper (`C:/dev/Hantsch/AlbionHelper`) is a market-data helper for Albion Online: a NATS listener console app ingests live market orders into MongoDB Atlas, an ASP.NET Core API serves item/price/crafting queries, and a CRA React frontend shows per-city prices. DiaryApp (`C:/dev/Hantsch/DiaryApp`) is a Vite/React proof-of-concept for a diary stored in Google Sheets, mostly an exploration of three competing Google auth approaches.

**Architecture.** AlbionHelper uses the owner's early personal .NET layout: root `Ebro.Albion.sln` + `src/<Company>.<Product>.<Component>/` projects with a `.Common` shared library (embedded-JSON static data with typed loaders), a separate NATS listener worker, and composable Mongo filter builders in controllers. DiaryApp is a single Vite SPA with folder-per-component + co-located CSS, a Context provider + `useAppData` hook, an object-literal services layer, and central config — with three parallel auth implementations of which only the Firebase path is wired up.

**Strengths**
- Consistent early .NET solution convention (`Ebro.Albion.sln`, `src/Ebro.Albion.Common/`) that reappears in later projects.
- Ingest worker separated from the API, sharing models via the Common project.
- Embedded-resource static data with typed loaders (`src/Ebro.Albion.Common/StaticData/`).
- DiaryApp has a coherent React skeleton despite being a PoC (provider/hook, services layer, central config).

**Issues**
- **Secrets committed:** MongoDB Atlas username+password hardcoded in `src/Ebro.Albion.Common/StaticConfiguration.cs` and pushed to the public repo; DiaryApp commits Firebase config and Google OAuth ClientId (`diary-app/src/firebase/firebase.tsx`, `diary-app/src/app-config.ts`).
- Race conditions and lost updates in the listener: `Task.Run` per NATS message with read-modify-`ReplaceOne` and no concurrency control (`src/Ebro.Albion.MarketData.Listener/Program.cs`).
- No-op LINQ bug: `OrderByDescending(...)` results discarded (Program.cs lines 125/147), so the order-cap deletes arbitrary entries.
- Dead endpoint: `CraftCalulatorController` (typo'd class, route `api/.calculate`) computes profit and returns `""`.
- Broken duplicate `ProjectReference` in `src/Ebro.Albion/Ebro.Albion.csproj`; hardcoded `http://localhost:5011` in `client_app/src/pages/ItemOverview.tsx:32`.
- DiaryApp: undeclared `axios` dependency (`src/services/Google/GoogleService.tsx`), OAuth tokens logged to console (`GoogleDrive.service.tsx:3`), three dead auth spike trees, stray root package.json/lockfile.
- Only test is the CRA default asserting "learn react" against a rewritten App — guaranteed to fail.

**AI setup.** None in either repo — no CLAUDE.md, AGENTS.md, `.claude/`, or `.github/`. Both predate the owner's AI tooling; AI involvement was pasted ChatGPT output (emoji-annotated code, commit "changed itemdetails layout to chatGPT mockup"). They document the pre-standard baseline everything since has improved on.

### 2. GC-APP

**Purpose.** Club-management PWA for a real club: meeting operations (planning, polls, attendance, protocol, fines/Kassa, media with Drive backup), member lifecycle with role/permission admin, push notifications, statutes. German-first UI (de/en/ru), deployed at gc.e-bro.at on Hetzner. ~27.5k LOC C# + ~37k LOC TS, changelog at v1.16.0, real users; active until July 2026.

**Architecture.** Backend is a domain-modular monolith: 13 domains under `src/backend/domains/<Domain>/`, each an Application/Service/Data project triad with explicit Document→Record mappers; `GCApp.Api/Program.cs` is a thin 176-line composition root; permission-policy authorization enforced at controllers AND re-checked in services. Functional tests boot the real pipeline via WebApplicationFactory. Frontend is Atomic Design with per-domain API clients over a shared core, CSS token system, German-literal i18n dictionaries. Single-container Docker deploy with GIT_COMMIT baked into `/health`, GH Actions on a self-hosted Hetzner runner.

**Strengths**
- Disciplined per-domain Application/Service/Data triads with a genuinely thin composition root.
- Defense-in-depth authorization (`MembersController.cs` policies + `MembershipService.cs` re-checks) with audit logging.
- Persisted-data compatibility doctrine written down and actionable (`src/backend/AGENTS.md` §1-3: never renumber persisted enums, migration-first).
- Spec-driven requirements workflow actually used in-repo (`docs/requirements/NNN-*.md`, `.claude/commands/refine.md` + `build.md` with model-cost routing) — the generation-1 ancestor of the ai-scrum plugin.
- Measurable frontend standards (44px touch targets, safe-area insets, `:focus-visible`-only rings) as checkable DoD items.

**Issues**
- **Committed secret:** `src/backend/google/service-account.json` is git-tracked with a real Google service-account private key — while README instructs never to commit such credentials. Needs revocation and history purge.
- Root `CLAUDE.md` is stale and directly contradicts the AGENTS.md files (inline-SVG vs lucide-react, single api client vs per-domain clients, App.css vs per-page CSS) — two competing rule masters.
- `/refine` and `/build` copied from the Godot project unadapted: `.claude/commands/build.md` verifies with `dotnet build Hantsch.sln` (real solution: `src/backend/GCApp.sln`) and points at MMO skill names; `docs/requirements/_TEMPLATE.md` still says "Godot-Spielprobe".
- The localization "hard rule" in `src/frontend/AGENTS.md` diverged from the implementation: `src/frontend/src/i18n/translations.ts` uses German literal keys with silent fallback; `src/pages/TicketsPage.tsx` has zero `t()` calls.
- AI-config dilution: 11 unmodified third-party SuperClaude agents in `.claude/agents/` and an imported web-quality skill pack bury the two project-authored assets.
- No CI quality gate before production: `.github/workflows/deploy.yml` deploys every push to main with no build/test/lint job.
- CLAUDE.md/AGENTS.md near-duplicate rule sets maintained twice and drifting (44px vs 40px touch targets).
- Thin frontend tests: 2 vitest files + 2 e2e specs for ~37k LOC.

**AI setup.** Extensive and multi-layered: root CLAUDE.md + root/backend/frontend AGENTS.md, German `/refine` (opus) + `/build` (sonnet) commands over `docs/requirements/`, an imported agent/skill zoo plus one home-grown skill (`feature-doc`), Copilot `.github/agents/`, PROJECT.md AI brief, and deploy workflows. Partly home-grown gold, partly unpruned imports; a prime `/ai-scrum:setup` migration target.

### 3. Hantsch-MMO

**Purpose.** Open-world RPG prototype (working titles Idralon/BlackIndia): a deterministic, Godot-free 2D C# simulation (`Game.Sim`, ~24.9k LOC, 599 tests) rendered by a 2.5D Godot 4.7 client, plus an Electron/React content-authoring Studio bridged to the real sim via SimHost. 11 completed sprints, 62+ done stories; active until 2026-07-25. This repo is the incubator and live proof of the ai-scrum plugin.

**Architecture.** Strict one-way "Input → Sim → Render" layering: commands as data objects, fixed-tick `World.Step()`, seeded RNG, zero `using Godot` in the sim. `Sim3D` is the ONLY 2D↔3D seam; collision is authored, never derived from meshes. Actors are pure data + non-referencing components; content is data-driven catalogs; ability tuning parameters are `[Range]`-attributed ctor params from which a Roslyn source generator derives Studio forms and registries. Determinism tested by running two same-seed worlds in lockstep for 5000 ticks asserting bit-identical state (`Game.Sim.Tests/WorldDeterminismTests.cs`).

**Strengths**
- Anti-drift single-source discipline: AGENTS.md is explicitly only a pointer to CLAUDE.md; `docs/ROADMAP.md` is the one status source; status tables banned in `docs/README.md` after drifting twice.
- The complete file-based scrum workflow (`.claude/commands/{concept,roadmap,refine,build,sprint}.md`) with cost engineering (per-deliverable opus escalation with one-sentence risk rationale) and a clean-agent review protocol (spec+diff only, PASS/FAIL per criterion, ≤3 fix cycles).
- Acceptance honesty codified: "acceptance = UI" and "done ≠ live-verified" for headless agents.
- Five high-quality native skills with USE WHEN triggers, decision tables, and anti-pattern lists, plus a CLAUDE.md routing table.
- Determinism/long-run/save-roundtrip test suite of rare quality.

**Issues**
- No CI whatsoever — the 0-warnings/599-green gate exists only as convention inside agent commands (no `.github/` directory).
- `Game.Sim/Simulation/World.cs` is a 2311-line god-file (~20 `HandleX` command routers) in tension with the project's own orchestrator-only rule (`.claude/skills/sim-component-architecture/SKILL.md`).
- Language inconsistency: commands/CLAUDE.md/docs German, skills English, code-is-English adopted only 2026-07-25 so XML docs are still largely German — conflicts with the marketplace "English everywhere" rule when extracting.
- `.claude/commands/*` is a diverged fork of the published ai-scrum plugin — no managed markers or lock, Hantsch-specific hardcodes; improvements will silently drift apart.
- Stale environment pins: `.claude/settings.json` allowlists Godot 4.6.3 while CLAUDE.md says 4.7, and enables an undocumented plugin `ponytail@ponytail` (verified dead — see Corrections).
- Commit-message discipline only holds when the orchestrator commits ("more polish", "final 3d polish" outside `/sprint`).
- Heavy retained legacy: frozen `Game.Client/` (95 files), `docs/godot-3d-ai-asset-factory/` (19 German work packages), empty `.agents/` and `tmp/`.

**AI setup.** The richest in the portfolio: 22.5 kB German CLAUDE.md master (working-method §3, binding architecture rules §4, skill routing §5, acceptance procedure §6 incl. godot-ai MCP visual acceptance, decision log §9), pointer AGENTS.md, five German commands, five English skills, `.codex/` config + three image-generation skills with Python validators, and a full docs convention (requirements/sprints templates, done/INDEX.md, systems/ vs concepts/ promotion).

### 4. IrishFire-App

**Purpose.** Club-management PWA for an Austrian Irish-dance club (German UI): Google sign-in, events with RSVP and recurrence, SignalR chat, club overview and role admin, multi-channel notifications, statutes with audit log, in-app changelog. `frontend/version.md` declares v1.0.0 shipped 2026-05-07; ~7.9k LOC C# + ~16.7k LOC TS built in a 5-day burst, idle since.

**Architecture.** Backend is a rule-enforced modular monolith: `IrishFire.Api` is composition root only (Program.cs is 12 lines); six domains as `IrishFire.<Domain>` + `.Data` project pairs, module self-registration via `AddApplicationPart`, domain objects own all mapping (Create/FromDocument/ToDocument/ToDto), Get-throws/Find-nullable naming, `project/role-matrix.json` as single source of truth generating 4 code artifacts. Frontend is Atomic Design with per-domain TanStack Query services, each with a handcrafted `.mock.ts` sibling swapped in via Vite `resolve.alias` for a full backend-free mock mode. Every feature has a portable 5-file spec under `doc/feature/<Feature>/`.

**Strengths**
- Documentation-first feature workflow: 5-file spec sets (README/spec/api/frontend/integration) with numbered business rules and stack-agnostic porting guides.
- The code actually obeys its `backend/agents.md` rulebook (verified in `backend/IrishFire.Chat`, `backend/IrishFire.Members`).
- Single-source-of-truth codegen with a documented regeneration skill (`.github/skills/update-roles/SKILL.md`).
- Full-fidelity mock mode incl. mock OAuth and role switching (`frontend/vite.config.ts`).
- Sound auth security for a hobby project: refresh-token rotation with SHA-256 hashing, HttpOnly cookies, permission-claim policies, gitignored local secrets.

**Issues**
- Zero automated tests anywhere for a ~24k LOC v1.0.0 in real use; no CI (`.github/` has only prompts/ and skills/).
- `frontend/agents.md` materially out of sync: mandates shadcn/ui and Storybook, neither installed; MUI 9 is actually used and never mentioned.
- ~40 `.stories.tsx` files are dead artifacts: `@storybook/react` is not a dependency, no `.storybook/` config, excluded from type-checking (e.g. `frontend/src/atoms/Button.stories.tsx`).
- Root `agents.md` stale versus the update-roles skill (wrong MOCK_ROLE_MAP location, missing generated files).
- Mandated 5-template page system not implemented (`frontend/src/templates/` has 3 of 5; pages embed layout markup, e.g. `frontend/src/pages/AccountPage.tsx`).
- Service layer coupled to HTTP (`BadHttpRequestException` thrown in `backend/IrishFire.Chat/Services/ChatService.cs`); N+1 unread-count loop in the same file; magic status strings in `ChatChannel.cs`.
- Oversized files against its own discipline (`EventsService.cs` 722 lines, `CreateEventModal.tsx` 762 lines).
- Informal mixed German/English commits ("app pollish", "chat done ish"); German identifiers leak inconsistently (`VereinsuebersichtPage.tsx`).

**AI setup.** No CLAUDE.md or `.claude/` — tooled for GitHub Copilot: root/backend/frontend `agents.md` (incl. the distinctive "Check before creating" duplicate-component protocol and the version.md DoD rule), `.github/prompts/implement-feature.prompt.md` (5-step spec-driven workflow), `.github/skills/update-roles/SKILL.md`, and (per verification) `.github/prompts/` also feeds the AI_Tool_Shed lineage.

### 5. RpiHomeAccess

**Purpose.** Self-hosted door access control ("EBRO Door Access System"): Raspberry Pi actors drive relays via GPIO, a LAN .NET 6 "door brain" validates codes, and a public admin PWA + .NET 9 modular API on a Hetzner VPS manages sites/codes/users and opens doors remotely via a zero-trust outbound relay — the Pi dials out over WSS and all verification (allowlist, nonce, freshness, ECDSA signature) happens in the LAN, so a compromised VPS still cannot open a door. Production on real doors; revived AI-assisted in June 2026 (9 written plan phases executed in ~3 days).

**Architecture.** Trust-tiered topology documented as C4 in `docs/concept.md`. The .NET 9 API is a textbook modular monolith (Api host + Core + six module pairs); `Program.cs` is 33 lines calling explicit static registration classes — exactly implementing the repo's own `backend-composition-root` skill. Frontend is strict Atomic Design with 31 co-located `messages.ts` i18n files and a fully backendless mock mode. Security chain: non-extractable WebCrypto P-256 device key in IndexedDB → canonical signing payload → VPS forwards without verifying → LAN `CommandVerifier` checks everything, unit-tested for every rejection reason. Deploy: BR-numbered spec → 277-line safe-mode `deploy.sh` with health-gated rollout + auto-rollback → injection-guarded CI env rendering.

**Strengths**
- Spec-to-implementation traceability: BR-01..BR-10 in `docs/features/app-deployment/spec.md` cited by number in `deploy.sh` and the workflow.
- Zero-trust design done properly and tested (`src/ManagementAPI/.../CommandVerifierTests.cs`: replay, forgery, staleness, unknown device, expiry).
- Exceptional deploy script: 13 numbered steps, port preflight, previous-image capture, automatic rollback, secret hygiene.
- Docs as a system: concept + spec + 9-phase implementation plan with sign-off protocol, executed as committed ("phase N implemented").
- CI secret handling above hobby grade (owner-only .env, umask 077, newline injection guard, shredded in `always()`).

**Issues**
- **Committed live secrets:** real Mongo Atlas connection string with credentials and a real-format Google OAuth ClientSecret in `src/management-app/api/Ebro.DoorAccess.ManagementApp.Api/appsettings.json`; same URI hardcoded in the Seed program. README calls them "test placeholders" but they are working credentials.
- `src/AccessClient/access_api.py`: prints CLIENT_SECRET to stdout at startup (line 27), non-constant-time HMAC compare (`sig != signature`, line 100), CORS `*` on the door-open API (line 44), accepts future timestamps (line 86), runs Flask dev server in production (line 147).
- No unit tests for the entire .NET 9 management-app API and no unit-test runner in the web app; single Playwright spec needs a manually started API.
- No CI quality gate — only the deploy workflow.
- Code violates its own backend-guidelines skill (`record` types in `InMemorySessionStore.cs:8`, `ISessionStore.cs:3`; Options files misplaced).
- Relay wire contracts hand-duplicated across both solutions (`Relay/Contracts/` vs `RelayAgent/Contracts/`) — drift breaks door opening silently.
- Root `agents.md` is a verbatim copy of `.github/karpathy-guidelines/SKILL.md` — two copies to keep in sync.
- Two dead frontends (Angular 8 `v1/door-app`, CRA `src/door-management-ui`) kept in-tree; `docs/konzept-app-tueroeffnung.md` is German among English docs.

**AI setup.** No CLAUDE.md or `.claude/`. Root Karpathy-derived `agents.md` plus **five** Agent-Skill files at `.github/<name>/SKILL.md` (backend-composition-root, backend-guidelines, frontend-guidelines, karpathy-guidelines, premortem) — verified byte-identical to the AI_Tool_Shed canonical copies (the conventions diff originally missed these; corrected). Plus the phase-gated implementation plan that functioned as an AI-execution artifact.

### 6. VereinsApp

**Purpose.** Multi-tenant club-management platform: ASP.NET Core + MongoDB with database-per-tenant isolation, Next.js 15 frontend shell rendering tenant-enabled feature modules with per-tenant branding. Auth0 planned. Prototype, dormant, and committed in a broken mid-rewrite state (~1.8k LOC C# + ~620 LOC TS; 17 commits, real code on `dev`).

**Architecture.** Monorepo backend/frontend/infra. Backend: composition-root-only host with per-concern Bootstrap classes, domain+data project pairs, module self-registration via `AddApplicationPart`, domain-object-owns-mapping, structural tenant isolation (`MongoDbContext` derives `vereinsapp_tenant_<slug>` DB from `ISystemContext`), well-guarded DEBUG-only DevImpersonation middleware. Frontend: Turborepo workspace with a module-manifest registry pattern (feature packages export `ModuleManifest`, shell filters by tenant-enabled keys), shared strict eslint/tsconfig tooling packages.

**Strengths**
- `backend/agents.md` is an exceptionally concrete, machine-enforceable architecture rulebook (dependency table, forbidden patterns, Get/Find contract).
- Hierarchical agents.md pattern (root overview delegating to per-component rulebooks).
- Composition-root and module self-registration discipline in the code that exists.
- DevImpersonation middleware: `#if DEBUG` + env check + config opt-in + loud warning + `X-Dev-Warning` header.
- Own C# style codified twice: prose rules plus the `Hantsch.CSharp.StyleCop` 1.0.4 analyzer in every csproj.

**Issues**
- **Repo does not compile:** `backend/VereinsApp.sln:12` references a deleted `VereinsApp.User` project and `Program.cs:20` calls a nonexistent `AddUserModule` — broken state was committed and merged.
- **`.gitignore:27` `packages/`** (meant for NuGet) also swallows `frontend/packages/`, so the `@vereinsapp/ui|types|config` workspace packages are absent from git — a fresh clone cannot `pnpm install`. (Same failure class as second-brain's vault loss.)
- DI lifecycle bug: `InfrastructureBootstrap.cs:53-59` scoped `ISystemContext` factory throws because `SystemContextMiddleware.InvokeAsync` method-injects repositories resolved before the accessor is set — every non-impersonated request throws.
- `SystemContextMiddleware.cs:98-101` silently returns an empty 200 for requests without a `sub` claim; the anonymous tenant-config endpoint is unreachable (`/api/tenants` missing from the exclusion list at line 17).
- Frontend module routing is dead code: `[...moduleSegments]/page.tsx:22` calls `getEnabledManifests([])` with a hardcoded empty array; `:id` route params compared by string equality.
- Next.js middleware sets `x-tenant-slug` on response instead of request headers (`middleware.ts:12-17`), so `layout.tsx` always falls back to "default".
- FE/BE contract drift with no shared source (`member-list.tsx` renders fields the backend never sends); FluentValidation registered but never executed; cursor pagination without `.Sort()` (`MemberRepository.cs:25-42`); likely insert failure from an empty-string `[BsonId]` ObjectId.
- Docs/code drift everywhere: README and both agents.md describe a pre-refactor layout incl. an empty-husk `VereinsApp.Infrastructure`; `infra/docker/Dockerfile.api:13` copies a nonexistent csproj.
- Zero tests, zero CI; informal commits ("save changes", "final swoop").

**AI setup.** No CLAUDE.md, no `.claude/`, no workflows. Root + backend `agents.md` (English, the substantive artifact), and on the unmerged remote branch `copilot/setup-agend-orchestration` a German 181-line planner agent (`.github/agents/planner.md`) with task-brief templates — a direct ancestor of the ai-scrum planning ideas — plus stub backend/frontend agents.

### 7. WatchedIt

**Purpose.** Personal movie/series watch-journal web app (watched titles, watch logs, watchlists, series trackers, friends, ratings; TMDB/OMDB/TVmaze metadata; Google sign-in), deployed at watchedit.e-bro.at. Production and actively developed: ~27k LOC C# in 31 projects + ~19.6k LOC TS, 153 backend test files + 17 integration suites, 212 commits Feb–Jul 2026, working tree touched today. Forked/renamed from an earlier "life_assistant" project.

**Architecture.** Modular monolith with per-domain project pairs (`RoKa.WatchedIt.<Module>` + `.Data`), a pure 33-line composition root using explicit static registration classes (deliberately not extension methods, per the composition-root skill), one module per Mongo collection with cross-module reads via reader interfaces, Get/Find semantics enforced. Tests follow `Cases/<Subject>/<Action>_Tests.cs` with hand-written fakes; integration tests run against throwaway Mongo. Frontend: Atomic Design with mandated sub-folder taxonomy, the incident-derived foreign-reference resolver (`frontend/src/lib/userDisplay.ts`), co-located page tests. Deploy: VERSION.md-gated `deploy.sh` (412 lines) with health-gated rollout, rollback, BuildKit-secret npm token.

**Strengths**
- Exceptional layered AI-rules architecture (root AGENTS.md → backend/frontend agents.md → 9 project-agnostic `.github/skills`) with specific, testable rules.
- Documented conventions actually implemented (Program.cs matches the skill; test layout matches the convention; frontend tree matches the schema).
- Rules encode learned incidents (`docs/deployment-architecture.md` postmortems → invariants; the "With Unknown" bug → resolver pattern with perspective-matrix tests).
- Robust deploy pipeline: VERSION.md gate, port preflight, sequential health-gated rollout, automatic rollback, secret scrubbing (`env -u`).
- Strong test culture with "tests land with the code" as a hard rule.

**Issues**
- `.claude/commands/build.md`/`refine.md` copied unadapted from the Godot project: reference `dotnet build Hantsch.sln`, "Godot-Spielprobe", and MMO skills — an agent following them runs wrong commands (`docs/requirements/README.md` and `_TEMPLATE.md` carry the same leftovers).
- `.github/prompts/implement-feature.prompt.md` belongs to IrishFire entirely (IrishFire.* projects, shadcn, Storybook) — contradicting this repo's layout.
- Contradictory backend rules: root `AGENTS.md:30` "records preferred" vs `backend/agents.md` "No records" — opposite instructions in one repo.
- Stale paths throughout the rule files: AGENTS.md mandates `v2/backend/` and forbids `v1/` — neither exists; backend/agents.md links outside the repo and lists 4 of 10 modules.
- Three overlapping feature workflows coexist (AGENTS.md slice chain → docs/features/, /refine+/build → docs/requirements/, implement-feature → doc/feature/) with an ID collision (`001-improved-series-lookup.md` id:000 vs `001-serien-episodes.md`).
- Code violates its own hard rules: `OverviewPage.tsx` is 220 lines (limit ≤150), holds page state, uses a default export.
- Build artifacts committed (`frontend/eslint-out.txt`, `tsconfig.tsbuildinfo`); ghost bin/obj-only project folders; stale life_assistant `.env.example`.
- `VERSION.md` (1.1.0, 2026-03-26) months behind shipped features; its validation logic duplicated verbatim in deploy.yml and deploy.sh.
- Root clutter incl. `commands_prompts.txt` (private notes committed) and the dead `ponytail@ponytail` plugin setting.

**AI setup.** No CLAUDE.md. Root AGENTS.md defines an Architect/Implementer/Reviewer agent chain over `docs/features/` slices; deep backend (145 lines) and frontend (323 lines) agents.md; `.github/agents/` Copilot agent trio; **nine** `.github/skills/` — a verbatim copy of the AI_Tool_Shed library except `frontend-guidelines`, which is the only drifted copy; German `/refine`+`/build` (whitespace-identical to GC-APP's); deploy workflow; and a prompt scratchpad with a reusable "create CLAUDE.md" prompt.

### 8. drive-cleanup

**Purpose.** Windows desktop tool ("Drive Cleaner", concept name "DriveLens") that scans a drive/folder and visualizes disk usage: per-category composition bar (incl. 9 gaming-platform categories), installed-game detection, drill-down tree, reveal-in-Explorer. v1 deliberately read-only. ~2.2k LOC TS/TSX, 10 commits (concept + v1 in June 2026), dormant.

**Architecture.** Textbook secure Electron separation, planned in `docs/concept.md` and implemented as designed: main (lifecycle/window/ipc/scan controller) → utility-process scan worker (bounded concurrency pools, progress throttling, tree pruning) → 24-line typed contextBridge preload → shared contract layer (`src/shared/ipc.ts` channel consts + `DriveCleanerApi` interface, discriminated-union worker messages) → renderer with a Zustand phase state machine. Data-driven category catalogue in `src/shared/categories.ts`. `docs/prototypes/` holds 5 named HTML design directions + gallery + `final.html` whose tokens the shipped UI reproduces.

**Strengths**
- Typed cross-process IPC contract as single source of truth (`src/shared/ipc.ts`, `types.ts`).
- Data-driven, extensible category system — adding a category is a data edit.
- Outstanding why-comments (LIFO pop() rationale in `walk.ts`, late-event guards in `scanStore.ts`).
- Concept-first and design-exploration workflows visible in artifacts and commit history.
- Electron security best practices (contextIsolation on, nodeIntegration off, external links denied).

**Issues**
- No automated tests despite existing test logic: `bench/categorize-check.ts`, `games-check.ts`, `e2e.ts` are assertion scripts with exit codes but nothing runs them; Vitest promised in the concept, absent.
- No CI at all — `.github/` contains only `frontend-guidelines/SKILL.md`.
- `agents.md` is purely generic Karpathy rules with zero project facts (no commands, no architecture map).
- The frontend-guidelines skill contradicts the actual codebase (mandates Atomic Design, named exports, react-intl, no global stores — app uses screen-grouped components, a default export in `App.tsx`, hardcoded English, Zustand) and the agents.md declares no overrides, so the skill misfires in its own repo.
- Skill in a non-standard location: `.github/frontend-guidelines/SKILL.md` is neither `.claude/skills/` nor a GitHub-recognized path (see skill-location taxonomy in Corrections).
- Worker-crash hang: `scan-controller.ts` 'exit' handler only nulls the reference — a dead worker leaves the UI stuck in "scanning" forever.
- Case-sensitive broken link (`README.md:7` → `docs/Concept.md` vs actual `concept.md`); duplicated pruning constants in `walk.ts` vs `aggregate.ts`; `sandbox: false` without justification; unresolved naming drift (drive-cleanup / drive-cleaner / DriveLens); German prototypes vs English concept.

**AI setup.** Two artifacts: the generic 63-line Karpathy `agents.md` (byte-identical to RpiHomeAccess's and the AI_Tool_Shed template copy) and the `.github/frontend-guidelines/SKILL.md` copy (verified byte-identical to the AI_Tool_Shed canonical; the conventions diff originally recorded "none" here — corrected). No CLAUDE.md, `.claude/`, or workflows.

### 9. q2-config-manager

**Purpose.** Electron desktop app for managing Quake 2 config files: player profiles, binding/alias generation, validation against the exact behavior of three engines (R1Q2, Q2PRO, vanilla 3.20) with every engine claim source-cited from engine C code, and non-destructive cleanup via quarantine. ~9.6k LOC, exactly 2 commits (one-day MVP, 2026-08-14), 106 passing tests. Explicitly DISCONTINUED — functionality being integrated into q2-launcher; now a knowledge/code donor.

**Architecture.** Four-layer Electron layout with a documented trust boundary: `src/core/` domain logic (faithful `COM_Parse`/`COM_Compress` ports with citations, data-driven `SettingDef.byEngine` cvar catalogue with mandatory `source` fields, rule-engine validator emitting id/level/title/detail/fix findings); `src/main/index.ts` owns all IPC with `assertInside()` path guards, backup-before-write and timestamped quarantine; narrow typed contextBridge preload; React renderer with a single useReducer store. Dual node/web tsconfig split keeps DOM types out of main-process code.

**Strengths**
- Exceptional rationale-dense documentation: every core module opens with WHY + engine source citations (`src/core/engines.ts:12-58`, `parser.ts:1-16`).
- Per-engine divergences as data, mechanically turned into validator findings incl. quieter portability warnings (`src/core/validator.ts:309-399`).
- Strong behavior-oriented tests: line-by-line port verification, serializer split invariants, importer round-trips; synthetic-fixture + skip-guarded real-installation pattern (`test/scanner.test.ts`).
- Security-conscious main process (path guard on every IPC path, filename allowlist, contextIsolation).
- Non-destructive-by-design file operations, stated and tested.

**Issues**
- Documented layering invariant violated: CLAUDE.md/README say "src/main is the only place that touches the filesystem; src/core is pure" — but `src/core/scanner.ts:10-12` imports `node:fs/promises`/`node:crypto` and does all installation scanning, so the stated rule cannot be trusted as a review criterion.
- DRY violation across the parser boundary: `src/main/index.ts:171` re-implements exec-reference extraction with an ad-hoc regex diverging from the real tokenizer.
- Dead dependency: `electron-updater` is the only runtime dependency and is never imported.
- Build artifacts committed: both `.tsbuildinfo` files tracked; `.gitignore` does not exclude them.
- `sandbox: false` (`src/main/index.ts:25`) undocumented, unlike every other security decision in the file.
- No lint/format and no CI for a repo full of hand-maintained data tables.
- Personal absolute path in tests (`test/scanner.test.ts:177`: `C:\Users\darkp\Desktop\q2 roli`).

**AI setup.** A 52-line CLAUDE.md in the owner's house format: project identity, "Repo language: English" (incl. UI strings; Quake terminology never translated), "Engine facts must be source-cited" (file+symbol, never forums), "Where engine differences belong" (data not prose), commands (incl. the `scripts/launch.js` ELECTRON_RUN_AS_NODE workaround) and layout invariants. `.claude/settings.local.json` sets `outputStyle: common:Briefing` — the repo dogfoods the owner's own common plugin. No commands/agents/skills/workflows.

### 10. q2-launcher

**Purpose.** Modern Windows-first Quake II launcher around the r1q2 client: installation management (add/detect/validate/repair guidance), detection of 8 engine variants, correctness-guaranteed command-line building and launching with playtime tracking. Config/downloads/mods/assets are scaffolded as visible "planned modules" — explicitly "step 1: the shell". 3 commits, all 2026-08-14; ~10k LOC; v0.1.0; serious early product with excellent docs.

**Architecture.** Three-process Electron with a shared contract layer: `src/shared/ipc.ts` declares every channel with req/res types plus runtime allowlists and compile-time exhaustiveness guards; main derives a typed `handle()` wrapper that crashes boot on missing handlers (`assertContractFullyHandled`); preload enforces the allowlist at runtime. Main is DI-composed (`createAppContext`, no singletons). Crash-safe `JsonStore` (atomic tmp→rename, .bak, corruption quarantine surfaced as a user toast). Feature seam: all future modules ride one `module:invoke` envelope channel so the security surface never grows. Security: contextIsolation+sandbox, CSP response header, denied permissions, zod on every renderer payload, spawn without shell.

**Strengths**
- Contract-first typed IPC done end to end — drift fails the build or crashes boot; the strongest realization of the owner's Electron standard.
- Defense-in-depth security posture matching its own README claims.
- Outstanding why-comment discipline (r1q2 tokenizer rules from C source in `launch-plan.ts`; CSS layer-priority rationale in `styles/index.css`).
- Docs as decision records: `docs/ARCHITECTURE.md` trade-offs, `docs/ROADMAP.md` explicit non-goals and verify-while-implementing flags.
- Crash-safe persistence treating data loss as a UX event; zero-binary-asset design system with a committed icon-generator script.

**Issues**
- Test coverage does not match the testability investment: exactly one test file (`src/main/services/launch-plan.test.ts`) despite test helpers shipped in `json-store.ts` and `win-registry.ts`.
- No CI at all (no `.github/`), though typecheck/format/test are one npm script each.
- Path allowlist uses raw string prefix matching: `isAllowedRevealTarget` (`src/main/ipc/app.ts:67-71`) does `startsWith(root)` without a separator boundary — `C:\Quake2-evil\` passes for root `C:\Quake2`.
- Per-handler zod validation is opt-in and inconsistent (`installations:inspectPath`, `app:revealPath` use manual typeof checks); ROADMAP itself flags the fix.
- `absolutePathSchema` comment overstates its guarantee (relative paths pass, `src/main/lib/schemas.ts:148-152`).
- Renderer duplicates main-side orchestration (`useLauncher.validateAll` vs main's `installations.validateAll()`); a module-level mutable `subscribed` flag contradicts the stated no-module-state principle.
- No lint layer (documented TS 7 constraint; alternatives not evaluated); `tmp/` not gitignored.

**AI setup.** 54-line CLAUDE.md in the compact house format (What this is / Language / Stack / Layout / Key rules with file paths), delegating depth to ARCHITECTURE.md and ROADMAP.md. `.claude/settings.local.json` sets `outputStyle: common:Briefing`. No commands, agents, skills, or workflows.

### 11. second-brain

**Purpose.** Local-first, file-based "second brain" Electron app ("Guston"): a portable Markdown+YAML vault (inbox, journal, projects, areas, Karpathy-style knowledge wikis, sources) that the app files, indexes (MiniSearch, no DB) and answers from with citations. LLMs optional via an own gateway; every LLM feature has an honest no-model state. Also reads Claude Code/Codex session files. ~63k LOC in src, 128 test files, built 2026-08-10..14 — feature-complete v0.1.0 but **broken as cloned**.

**Architecture.** Strict machinery-enforced layering Renderer → Preload → Main → Core → files: ESLint bans `electron` imports in `src/core`; `src/shared/ipc.ts` (675 lines) is the single typed contract; the preload is a 68-line allowlist bridge; a typed handler registry plus `tests/main/ipc-coverage.test.ts` fails on unhandled channels or placeholder handlers detected by source scanning. DI-first core (injectable fetch/sleep/now in the LLM gateway). UI acceptance is executable: `scripts/shot.mjs` drives the built app on a seeded vault with measured gates (clickability, pixel visibility, density budgets); `scripts/a11y.mjs` fails on serious axe findings.

**Strengths**
- Boundary rules enforced by machinery, not prose — the ipc-coverage meta-test even bans the helper that could create a placeholder.
- Deterministic DI-first core with fakes making the mandatory "with fake provider AND with no model" test pair cheap.
- UI acceptance as executable gates, not vibes.
- Honest failure reporting as culture (`docs/sprints/S01/sprint.md` documents the vault blocker with exact counts; story 002 says "verified by tests, NOT live smoke").
- Token-economics-aware workflow: ai-scrum 2.0.0 cleanly installed, plus the `delegate` skill offloading mechanical work to a local Qwen3-Coder-30B with anti-exploration work orders.

**Issues**
- **CRITICAL data loss:** `src/core/vault/` was never committed — `.gitignore`'s unanchored `vault/` matched it for the repo's whole life; 108 files import `@core/vault`, so a fresh clone has 199 type errors and 84/128 failing test files. Sources exist only on the authoring machine (fix commit 4926aad anchored the pattern but could not restore them).
- No CI whatsoever — a fresh-checkout `npm run verify` workflow would have caught the missing directory on the first push.
- Language convention vs reality: CLAUDE.md mandates English, but ~223 files under src/ plus scripts/configs still carry German comments.
- Hardcoded German user-facing strings bypass i18n outside the renderer (`src/core/llm/gateway.ts:131,219`, `src/preload/index.ts:21-36`) and surface in an English UI.
- The shot harness is hard-coupled to German UI text (getByText('brauchen ein Modell') etc.) — switching UI language breaks the mandatory live-smoke gate.
- Misleading mandatory reading: the Gaston README CLAUDE.md points to is a generic handoff bundle with zero token guidance.
- Product identity drift (guston vs second-brain artifact names); stale ai-scrum profile note claiming German docs; CLAUDE.md's directory map lists the nonexistent vault directory; `scripts/shot.mjs` is a 1167-line monolith exempted from the repo's own 300-line rule.

**AI setup.** Extensive and mostly excellent: an 8.5KB English CLAUDE.md (product invariants, seven non-negotiable guardrails, Gaston design rules, `npm run verify` quality gate, mandatory test list, provenance section naming five neighbor repos); a deliberately short AGENTS.md prepend; **ai-scrum 2.0.0 installed with zero drift** (managed markers + `.claude/ai-scrum.lock` consistent) with the `.claude/ai-scrum.md` project profile; the `delegate` skill + `.opencode/impl-prompt.md` local-model setup; full docs scaffolding. The reference consumer of the plugin.

### 12. hantsch-web-design-system

**Purpose.** Generic, app-neutral React component library (22 components) with a semantic Tailwind token system for light/dark themes, harvested from WatchedIt and deliberately neutralized. Consumption is NOT npm: the DesignSync toolchain compiles the barrel into a browser-global bundle plus per-component docs uploaded to a claude.ai/design project so AI agents elsewhere can build UIs with these exact components. ~1.4k LOC, 3 commits (2026-07-04/05); the full pipeline has run green.

**Architecture.** Four layers: committed source (atoms/molecules with functional subgroups, hand-written barrel with documented rationale, zustand theme store, ~40 semantic tokens declared twice for :root/.dark); committed sync state (`.design-sync/config.json` with componentSrcMap and provider chain, `conventions.md` agent cheat sheet, `NOTES.md` operational memory, 13 preview stories); gitignored staged Anthropic tooling (`.ds-sync/`); gitignored generated bundle (`ds-bundle/`). `docs/design-system.md` is the committed guideline doc.

**Strengths**
- Exemplary semantic token system: `token()` helper + rgb-triplet CSS variables make dark mode a variable swap while preserving Tailwind alpha modifiers; rationale written into the files.
- Outstanding why-comments (iOS anti-zoom hack, hand-written barrel rationale, pre-paint script contract).
- `docs/design-system.md` is dense and testable (spacing table, motion rules, a11y rules, per-category visual contracts).
- `.design-sync/NOTES.md` is disciplined operational memory (provider chain marked load-bearing, quirks triaged with evidence, excluded-components policy).
- Neutralization discipline mostly held (renamed storage key, null avatar URLs, written re-add criteria).

**Issues**
- No root README, no CLAUDE.md, no docs entry point — a fresh clone's only orientation is NOTES.md.
- Zero quality gates: no tests, lint, CI, or even a typecheck script despite a strict noEmit tsconfig.
- Not consumable as a library (private, no main/exports/types; react as hard dependency; @dnd-kit dev/prod split wrong) — the only reuse channel is the claude.ai/design bundle.
- "App-neutral" violated by leftovers: `LegalConsentNote.tsx` hardcodes /terms, /privacy and a Google Sign-In sentence; `LanguageSelect.tsx` references a nonexistent backend service.
- Docs promise behavior the code lacks: overlays should "dismiss on Escape/backdrop and trap focus" but `ConfirmDialog.tsx` does none of it.
- The library breaks its own token rules (`bg-slate-900/50` scrim, `text-white` instead of `text-accent-on`, `!important` fights against Button's variant API).
- Component registry maintained by hand in three places (barrel, componentSrcMap, previews) with no consistency check — NOTES.md's own top-listed risk, unautomated.
- Dead cross-repo references (themeStore JSDoc describing a nonexistent index.html; stale WatchedIt render hashes in the cache).

**AI setup.** No CLAUDE.md/AGENTS.md/workflows. All AI artifacts belong to the DesignSync workflow: `config.json`, the `conventions.md` cheat sheet ("never hand-pick a raw slate-* class", role→class table, "Where the truth lives" pointers), `NOTES.md`, and preview stories; the `.ds-sync/` machinery is Anthropic's, not owner-authored.

### 13. AI_Tool_Shed

**Purpose.** The staging/library repo for the owner's reusable AI-tooling material: nine skills (the canonical guideline library), a German first-generation ai-scrum command set, the llmwiki-template repository, a "new project template" agents.md hierarchy, the implement-feature prompt, feature-spec packs, and openclaw server-ops material. Assessed in detail in the "AI_Tool_Shed assessment" section below; inventory highlights here.

**State.** `PROJECT.md` is an unfilled blank template; `skills/agentsmd-techstack/` is an empty folder (a planned tenth skill never written); `ai-scrum/` (German, 2026-07-22, 4 commands, no roadmap) is a superseded ancestor of the shipped plugin 2.0.0; `new project template/backend/agents.md` still hardcodes `IrishFire.*` names; `openclaw/` (untouched since 2026-05-03) is deployment infrastructure orthogonal to Claude Code content. The nine-skill library is the canonical source that RpiHomeAccess, drive-cleanup and WatchedIt carry copies of (verified byte-identical except WatchedIt's drifted frontend-guidelines).

---

## Cross-cutting findings

Synthesized from the cross-repo convention diff (14 projects + the marketplace repo), corrected per verification.

### Drift lineages — the same personal standard, copied and diverged

1. **Karpathy Guidelines — 8 encodings** (corrected count). The four-rule behavioral block (Think Before Coding / Simplicity First / Surgical Changes / Goal-Driven Execution) exists as: three byte-identical `agents.md` copies (`drive-cleanup/agents.md`, `RpiHomeAccess/agents.md`, `AI_Tool_Shed/new project template/agents.md`), three byte-identical skill copies (`AI_Tool_Shed/skills/karpathy-guidelines/SKILL.md`, `WatchedIt/.github/skills/`, `RpiHomeAccess/.github/karpathy-guidelines/`), an appended block in `GC-APP/AGENTS.md` (drops the closing sentence), and a German evolved paraphrase in `Hantsch-MMO/CLAUDE.md` §3.1-3.6. The skill version (attribution, MIT, tradeoff caveat) is the best form; the bare agents.md copies are the drift-prone one. It is also embedded verbatim inside `agentsmd-project`'s template — no sync mechanism anywhere.
2. **Modular ASP.NET backend rules — 5 repos + skill.** Composition-root-only host, module/data project pairs, data→Core-only dependency, no MediatR/Moq, block namespaces, classes-not-records, `this.`, NotSet=0 enums, Get-throws/Find-nullable. Lineage: `IrishFire-App/backend/agents.md` == byte-identical == `AI_Tool_Shed/new project template/backend/agents.md` (never genericized) → `VereinsApp/backend/agents.md` (drifted: adds `.Infrastructure`, drops the Moq ban) → canonical `AI_Tool_Shed/skills/backend-guidelines/SKILL.md` (copies in WatchedIt and RpiHomeAccess) → `WatchedIt/backend/agents.md` (newest full rewrite). `GC-APP/src/backend/AGENTS.md` is a separate lineage (file-scoped namespaces, sealed classes) — see contradictions.
3. **Atomic Design frontend rules — 5 repos + skill, three-way drift.** Template → IrishFire (adds the "Proactive duplicate scan", folded back nowhere) → GC-APP (CSS token prefixes, 44px touch, safe-area rules) → WatchedIt v2 (322 lines, most evolved: sub-folder taxonomy, mandatory primitives, pages ≤150 lines). The canonical `AI_Tool_Shed/skills/frontend-guidelines/SKILL.md` is newest but is missing both IrishFire's duplicate-scan rule and WatchedIt's page-limit/primitive rules. Byte-identical copies sit in RpiHomeAccess and drive-cleanup; WatchedIt's `.github/skills` copy is the only drifted one (corrected).
4. **Electron IPC discipline — 3 generations, never extracted.** drive-cleanup (typed shared contract + worker isolation) → q2-config-manager (pure core / main-only fs / assertInside path guards — though core violates it) → q2-launcher + second-brain (contract-first maps with compile-time exhaustiveness, boot-time completeness assertion, ipc-coverage meta-test). q2-launcher's wording (2026-08-14) is the newest statement of the standard; no shared artifact exists.
5. **Deploy scripts — 3 generations, never diffed until verification.** `GC-APP/deploy.sh` (31 lines, git reset + compose up) → `RpiHomeAccess/src/management-app/deploy/deploy.sh` (277 lines, BR-numbered safe mode, health-gated rollout, auto-rollback) → `WatchedIt/deploy.sh` (412 lines, adds the VERSION.md gate). The injection-guarded CI env rendering appears in both RpiHomeAccess and WatchedIt (likely copy lineage). No review established a canonical generation; flagged as an unreviewed lineage.
6. **version.md Definition-of-Done** — the four bullets ("every user-facing change into the current version entry… short, punchy, and a little funny") verbatim in `GC-APP/AGENTS.md` §4 and `IrishFire-App/agents.md`; WatchedIt has a root VERSION.md but dropped the rule. Direct ancestor of the marketplace repo's `## Unreleased` changelog discipline.
7. **Design-token discipline** — "raw palette class is a bug" in three forms: second-brain (Gaston, `bg-slate-800` is a bug, one accent per screen), hantsch-web-design-system (`conventions.md` semantic-token table), GC-APP (CSS token prefixes, never hardcode spacing/z-index).
8. **Never-trust-the-client** — GC-APP ("never trust client-provided privilege headers", ×3 files), Hantsch-MMO §10, q2-launcher/q2-config-manager ("renderer paths are never trusted"). Four repos, one security value.
9. Also recurring: the identical dotnet/npm/python permission allowlist + `ponytail@ponytail` in WatchedIt and MMO settings; `outputStyle: common:Briefing` in q2-launcher, q2-config-manager and the marketplace repo; the AGENTS.md↔CLAUDE.md pointer pattern resolved three different ways (MMO: CLAUDE.md master; llmwiki: AGENTS.md master; second-brain: short prepend summary) with GC-APP as the cautionary tale of maintaining both.

### The 10 contradictions

1. **C# namespaces:** IrishFire/VereinsApp/WatchedIt-backend/template + backend-guidelines skill mandate block namespaces; `GC-APP/CLAUDE.md` + backend AGENTS.md say "use file-scoped namespaces when practical".
2. **Records, inside one repo:** `WatchedIt/AGENTS.md` L30 "records preferred" vs `WatchedIt/backend/agents.md` L110 "Do not use records".
3. **`this.` prefix:** mandatory in the IrishFire lineage; absent/contrary in GC-APP style.
4. **Moq:** "No Moq" in IrishFire/template/WatchedIt — silently dropped in the VereinsApp variant; GC-APP says nothing.
5. **Touch targets, inside GC-APP:** CLAUDE.md "44×44px minimum" vs `src/frontend/AGENTS.md` "minimum 40px, preferred 44px".
6. **Ask-first vs implement-first, inside GC-APP/AGENTS.md:** "Implement first, then explain" coexists with the imported Karpathy "if unclear, stop and ask".
7. **Repo language:** MMO's German CLAUDE.md and the German GC-APP/WatchedIt/MMO commands vs the newest standard (marketplace "English everywhere", second-brain, q2-*, ai-scrum 2.0.0 with `doc-language` as a profile knob — the knob is the resolution; the German copies are legacy).
8. **UI localization:** q2-config-manager "English UI, never translated" vs q2-launcher "i18n keys, never prose" vs GC-APP "de/en/ru per commit" vs second-brain "UI and document language independently configurable" — genuinely per-product, but each is written as a universal rule.
9. **Skill references + leaked project names:** GC-APP and WatchedIt `/build` commands instruct subagents to read `.github/skills/*/SKILL.md` "C#, Sim, Godot, Studio" — MMO's skills; GC-APP has no `.github/skills` at all. Superseded by the ai-scrum 2.0.0 profile's "context to read before coding" list — the correct fix.
10. **Master-file direction:** MMO says CLAUDE.md is master; llmwiki says AGENTS.md is (its CLAUDE.md is literally the 9-byte string `AGENTS.md`). Shared tooling must not assume one direction.

### Stale/empty AI files

- AlbionHelper, DiaryApp: no AI artifacts at all; hantsch-web-design-system: no CLAUDE/AGENTS.
- `Hantsch-MMO/.agents/` empty; `.claude/scheduled_tasks.lock` runtime artifact in the tree.
- `AI_Tool_Shed/skills/agentsmd-techstack/` empty skill folder; `AI_Tool_Shed/PROJECT.md` blank template; `AI_Tool_Shed/ai-scrum/` German staging superseded by plugin 2.0.0.
- `GC-APP/CLAUDE.md` (2026-03-04): stale older twin of AGENTS.md, with the "clerify" typo AGENTS.md fixed; `GC-APP/.claude/agents/` 11 generic personas untouched since March, referenced by nothing.
- GC-APP + WatchedIt `/build` commands: reference nonexistent or wrong-project skills — superseded but still installed.
- `AI_Tool_Shed/new project template/backend/agents.md`: still hardcodes `IrishFire.*`.
- `drive-cleanup/agents.md`, `RpiHomeAccess/agents.md`: generic Karpathy block only, zero project facts — placeholders.
- `second-brain/.claude/ai-scrum.md` Notes cite a German-docs convention CLAUDE.md no longer contains.

### Workflow lineage (ai-scrum)

GC-APP `/refine`+`/build` ≈ WatchedIt `/refine`+`/build` (whitespace-identical) → AI_Tool_Shed staging (adds `/concept`, `/sprint`) → Hantsch-MMO (all five commands, project-hardened) → **ai-scrum plugin 2.0.0** (English, genericized via profile + managed markers + lock) → second-brain (clean install, zero drift). Every pre-plugin copy is a superseded ancestor; GC-APP, WatchedIt and MMO are `/ai-scrum:setup` migration candidates.

---

## AI_Tool_Shed assessment

### Per-skill verdicts

| Skill | Scope | Verdict |
|---|---|---|
| agentsmd-project | Universal (assumes backend/frontend monorepo) | Strong 5-step re-sync procedure with verify-from-source discipline; defect: embeds the full Karpathy text verbatim into every generated AGENTS.md (a third copy) and contradicts its own "orientation only" rule |
| backend-composition-root | .NET-specific | Excellent craft (numbered rules, target-shape code, anti-patterns); leaks a provenance anecdote; **directly contradicts backend-guidelines** on extension methods |
| backend-guidelines | .NET-specific + personal C# house style | Very prescriptive, internally consistent, well generalized; opinionated style rules presented as absolutes without rationale; review-checklist makes it usable for reviews |
| code-analyse | Universal | The most sophisticated of the set (ambiguity triggers, file#line citation mandate, richest frontmatter); hardcodes `doc/analysis/` and couples by name to csharp-unittest/feature-doc |
| csharp-unittest | C#-specific | Excellent: precise `Cases/<Subject>/<Action>` scheme, hand-written-fakes rule, never-bend-production-code cardinal rule, best anti-pattern list; no significant defects |
| feature-doc | Universal method, fullstack-web assumption | Strong 5-file templates and quality checklist; its "exactly five files" rule already contradicted by its own app-deployment output (adds cicd.md); output path inconsistent (doc/feature/ vs features/) |
| frontend-guidelines | React/TS-specific, parameterized | The most mature guideline file, with an explicit host-agents.md precedence rule; defect: mandates react-intl unconditionally, conflicting with the Tool Shed's own i18n-free scaffold |
| karpathy-guidelines | Universal | Concise, only skill with a license; but it is prose guidance with no trigger action — CLAUDE.md/output-style material, and the most-duplicated artifact in the portfolio |
| premortem | Universal (non-engineering) | Good compact ritual with fixed output format, already command-like (`user-invocable: true`, `$ARGUMENTS`); lacks a context-gathering step and a when-not-to-use section |

All nine have valid name+description frontmatter; none has a version field.

### The three strands

There genuinely is a coherent standard, organized as: (1) a **spec-driven delivery pipeline** — concept → requirement → refine → build → sprint on one side, code-analyse → feature-doc → implement-feature on the other, with deliberately shared artifact formats (use-case titles lift into test file names; feature packs feed the implement prompt); (2) a **layered rule system** — universal behavioral rules (karpathy) → stack guidelines (backend/frontend/csharp-unittest/composition-root) → project instantiation (agents.md hierarchy), with precedence declared once (frontend-guidelines: host agents.md overrides the skill); (3) a **consistent testing philosophy** — blackbox, observable outcomes, hand-written fakes, never bend production code — repeated compatibly across three files.

### Duplications, contradictions, gaps

- **Duplications:** the Karpathy text verbatim in three Tool Shed places (skill, agentsmd-project template, project-template root) with no sync mechanism — plus the portfolio copies (8 encodings total); the backend and frontend rule sets each exist three times inside the Tool Shed alone (generic skill, hardcoded project template, condensed summary inside implement-feature.prompt.md) and the templates lag the skills; the Tool Shed ai-scrum is a dead German ancestor of the shipped plugin (verdict: delete or archive; the plugin lost nothing of generic value).
- **Contradictions:** backend-composition-root bans registration extension methods while backend-guidelines and the prompt mandate `Add<Module>Module` extensions — opposite instructions for the same file; the project template's root agents.md (Karpathy only) contradicts agentsmd-project's root template (full orientation doc); feature-doc's "exactly five files" vs app-deployment's six; frontend-guidelines' unconditional react-intl vs an i18n-free scaffold; output paths disagree (doc/feature/ vs features/); Tool Shed standardizes on AGENTS.md while the plugin repo standardizes on CLAUDE.md; mixed language (ai-scrum German, everything else English).
- **Gaps:** no versioning anywhere (no version fields, changelogs, manifests — the marketplace requires all three); no declared taxonomy separating universal / stack-specific / project-specific material (several "project-agnostic" files still leak project names: implement-feature's IrishFire names, llmwiki's Globestage branding, ai-scrum's Hantsch remnants); shared fragments are pasted instead of referenced from one canonical source; the Copilot-format prompt is not a Claude command; no validator for skill frontmatter/paths equivalent to `validate.ps1`.
- **llmwiki-template** is prime material — a complete, high-quality Karpathy-LLM-wiki implementation with a deterministic `protect-raw.mjs` PreToolUse hook wired for both Copilot and Claude and three well-formed skills — but it is a project instance ("Globestage" hardcoded throughout), not a template.
- **openclaw/** is server-ops for self-hosted agent instances — entirely orthogonal to Claude Code workflow content; keep/move as a separate ops repo.

---

## Corrections from verification

The critique pass verified the collected findings against the repositories. Corrections already folded into this report, kept visible here because they change decisions downstream:

1. **RpiHomeAccess and drive-cleanup DO have `.github` skill copies** (the conventions-diff inventory originally said "none"). Verified by md5: `RpiHomeAccess/.github/` holds five SKILL.md skills and `drive-cleanup/.github/frontend-guidelines/SKILL.md` exists, all byte-identical to the AI_Tool_Shed canonicals; **WatchedIt's `frontend-guidelines` is the only drifted copy**. Corrected duplication counts: karpathy 8 total encodings, frontend-guidelines ×4 (3 identical + 1 drifted), backend-guidelines/composition-root/premortem ×3 identical each. The IrishFire inventory row also omitted `.github/prompts/implement-feature.prompt.md`.
2. **`/concept` DOES exist in the ai-scrum plugin.** The MMO review's claim that the /concept interview command "has no plugin counterpart" is false — `C:/dev/Hantsch/claude/plugins/ai-scrum/templates/workflow/commands/concept.md` exists (verified). MMO's genuinely unextracted items are narrower: the skill-routing table, the systems/-vs-concepts promotion ritual, and the MCP visual-acceptance procedure.
3. **The marketplace validator has no skills support.** `scripts/validate.ps1` in `C:/dev/Hantsch/claude` contains zero handling for `skills/` (grep-verified), and CLAUDE.md's rule is "a plugin needs at least one of commands/, agents/, output-styles/". Since nearly every reusable candidate in this portfolio is a **skill**, the marketplace currently cannot validate or even ship skills-only plugins — validator/manifest work is a precondition for any decomposition. Also unreviewed: `plugins/ai-scrum/commands/setup.md` (the 201-line managed-marker installer) and the release workflow; and the `common` plugin contains a second output style (`kis.md`) no review mentioned.
4. **Five provenance repos named in second-brain's CLAUDE.md do not exist in the portfolio** (verified absent: `../ai-diary`, `../ai-assisted-knowledge-tool`, `../godot-RAG`, `../yougrab`, `../claude-control`). second-brain harvested the Gaston design system, the Karpathy-wiki schema (llmwiki ancestor) and the Claude-session reader from them; without those repos the design-token lineage (WatchedIt → hantsch-web-design-system vs ai-diary → Gaston) and the llmwiki ancestry are unverifiable — no single token system should be claimed as "the" canonical one. Similarly, the `Hantsch.CSharp.StyleCop` 1.0.4 analyzer's source repo was never located, so pairing prose rules with it is unactionable and it may contradict the GC-APP file-scoped-namespace lineage.
5. **`ponytail@ponytail` is a dead setting.** Enabled in WatchedIt and Hantsch-MMO `.claude/settings.json`, it resolves to nothing on this machine (no such plugin installed or in any marketplace) — not hidden reusable material, just a setting to remove.
6. **Skill-location taxonomy needs one decision, not per-repo notes.** Three competing layouts exist: `.github/<name>/SKILL.md` (RpiHomeAccess, drive-cleanup — likely not auto-discovered by any tool), `.github/skills/<name>/` (WatchedIt, IrishFire), and `.claude/skills/<name>/` (GC-APP, MMO, second-brain). Migration planning requires the discovery-semantics answer (which locations Claude Code and Copilot actually load).
7. **The deploy-script lineage was never reviewed as such.** GC-APP (31 lines) → RpiHomeAccess (277 lines, BR-numbered safe mode) → WatchedIt (412 lines, VERSION.md gate) are three generations of one artifact, and the injection-guarded CI env rendering in RpiHomeAccess and WatchedIt is likely copy lineage — no canonical generation was established. Related synthesis gaps: commit/branching conventions contradict each other across marketplace (Conventional Commits) / ai-scrum (story-ID prefixes) / app repos (informal), and frontend/TS testing has no standard anywhere (the only testing skill is C#-only).
8. Minor: `AI_Tool_Shed/skills/agentsmd-techstack/` is an empty folder omitted from the deep dive's skill list; q2-launcher and q2-config-manager were reviewed on their commit day (2026-08-14), so findings reflect an hours-old snapshot.

---

*End of phase-1 exploration report. Plugin-decomposition recommendations follow in a separate proposal document.*
