# Changelog — react

All notable changes to this plugin. Versions follow [semver](https://semver.org/):
**major** = a project has to change something after updating, **minor** = new capability,
**patch** = wording/fix only.

Write every change under `## Unreleased` while you work. On merge to `main` the release
workflow promotes that section to the new version number — and refuses to release while it
is empty, so no version ever ships without notes.

## Unreleased

## 1.0.0 — 2026-08-14

First release. Merges the four diverging copies of the frontend rules into one, and distils the
design-token layer and the mobile accessibility rules into a second skill.

### Added

- Skill **frontend-guidelines** (`skills/frontend-guidelines/`) — Atomic Design layer map, the
  downward-only dependency direction, the layer decision flow, procedures for components, pages, data
  fetching, UI-kit components and translatable strings, mandatory primitives, the proactive duplicate
  scan, forbidden patterns and a completion checklist.
- Skill **design-tokens** (`skills/design-tokens/`) — the token wiring (bare `r g b` custom
  properties + a `token()` helper so opacity modifiers keep working, `darkMode: 'class'`), the role
  vocabulary, the "raw palette class is a bug" and "one accent per screen" rules, radius/elevation/
  spacing/motion tiers, and the accessibility floor.

### Merged into frontend-guidelines

The newest copy was the base; these had never made it back:

- Sub-folder categorisation once a layer exceeds ~8 files, with a generic default vocabulary
  (purpose-based for atoms and molecules, domain-based for organisms).
- Pages live in `pages/<feature>/` with a co-located test, compose only, and are capped at 150 lines.
- The foreign-reference resolver procedure — one resolver per reference type, the viewer handled
  inside it, no silent `?? "Unknown"` fallbacks, and the actor/observer test matrix.
- The mandatory-primitives table and the structural-only-`div` ban.
- The "similar component found — use as-is / extend / create new" ask-user protocol, and the
  precedence clause that a host repo's own docs override the skill.

### Rulings folded in

- **Touch targets are 44x44px flat**, resolving the 44-vs-40 drift inside one repository.
- **i18n became conditional**: externalize through the project's library, do not introduce one. The
  old react-intl mandate contradicted both an i18next project and a scaffold with no i18n at all.
