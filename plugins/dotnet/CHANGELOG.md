# Changelog — dotnet

All notable changes to this plugin. Versions follow [semver](https://semver.org/):
**major** = a project has to change something after updating, **minor** = new capability,
**patch** = wording/fix only.

Write every change under `## Unreleased` while you work. On merge to `main` the release
workflow promotes that section to the new version number — and refuses to release while it
is empty, so no version ever ships without notes.

## Unreleased

## 1.0.0 — 2026-08-14

First release. Consolidates the backend rule sets that had been copied into five repositories and
had started to contradict each other.

### Added

- Skill **backend-guidelines** (`skills/backend-guidelines/`) — layering for modular ASP.NET Core
  (`*.Api` / `*.Core` / `*.<Module>` / `*.<Module>.Data`), type placement including the `Options/`,
  `Models/` and `Interfaces/` folder rules, module and controller registration, expected dependency
  direction, `Get*` vs `Find*`, code style, required tests, review checklist.
- Skill **composition-root** (`skills/composition-root/`) — one named static class per concern under
  `Configuration/`, explicit calls from the entry file, target shape of 10-20 lines.
- Skill **csharp-unittest** (`skills/csharp-unittest/`) — per-domain test projects, one file per use
  case under `Cases/<Subject>/<Action>/`, AAA without comments, snake_case names, hand-written fakes,
  and the rule that production code is never changed to make a test pass.
- Command **`/dotnet:review`** (`commands/review.md`) — applies the three skills to a diff (staged,
  branch or path) and reports findings as bug / rule / note.

### Rulings folded in

The five contradictions between the old copies were settled once and encoded here:

- **Extension methods are banned outright**, not just in the composition root. The two old skills
  disagreed — one banned them, the other mandated `Add<Module>Module`. Module wiring is now a named
  `<Module>ModuleRegistration` static class that registers its own controller assembly.
- **Block namespaces**, against the one repository using file-scoped.
- **No `record` types at all**, against the one repository preferring records for DTOs.
- **`this.` stays mandatory.**
- **The Moq ban is restored** — it had been silently dropped from the shared copy — and reaffirmed
  as non-overridable, because `csharp-unittest` is built on hand-written fakes.

### Not claimed

`Hantsch.CSharp.StyleCop` parity: the analyzer's source is not available, so these rules are prose
and the analyzer wins where it disagrees.
