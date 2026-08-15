# react

House rules for React + TypeScript frontends, as two skills Claude reaches for on its own. Nothing
is written into your repository - the content lives in the plugin, so `/plugin update` is the whole
update story.

## What ships

| Item | Kind | What it does |
| --- | --- | --- |
| `skills/frontend-guidelines/` | skill | Atomic Design layering with a hard downward-only dependency direction, sub-folder categorisation once a layer grows, page rules (feature subfolder, 150-line limit, compose only), the foreign-reference resolver, mandatory primitives, the duplicate scan, and a completion checklist. |
| `skills/design-tokens/` | skill | Semantic token layer as a method: bare `r g b` custom properties + a `token()` helper, the role vocabulary, one accent per screen, and the mobile accessibility floor (44px targets, safe areas, focus-visible, reduced motion). |

## The rules that surprise people

- **Lower layers never import from `pages/`.** Not even a type. `ReturnType<typeof usePageHook>` as
  a prop type is the same violation with extra steps.
- **Pages compose only, hard limit 150 lines**, and they live in `pages/<feature>/`, never directly
  under `pages/`. Interactive state belongs in an organism or a hook.
- **A raw palette class is a bug.** `bg-slate-100` and `#1f2937` in application code do not flip with
  the theme. Raw values live in the custom-property block and nowhere else.
- **One accent per screen.** A second accent removes emphasis rather than adding it.
- **44x44px touch targets, flat.** No per-component exception.
- **Before creating a component, Claude asks.** If a similar one exists you get
  "use as-is / extend / create new (justify)?" rather than a third variant.
- **i18n is conditional.** Strings are externalized through the library the project already uses; the
  skill will not introduce one where none exists.

## Install

```
claude plugin install react@hantsch --scope user
```

To enable it only in the repositories where it belongs, commit an `enabledPlugins` block in that
repository's `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "react@hantsch": true
  }
}
```

The plugin never writes that file - proposing the snippet is as far as it goes.

## Project-specific deviations

A project's own `CLAUDE.md` / `AGENTS.md` / `agents.md` wins where it states a deliberate deviation -
paths, libraries, template names, an extra sub-folder category. Record it there rather than arguing
with the rule in review.

`design-tokens` is deliberately written as a method rather than a fixed palette: the role names and
the wiring are the standard, the colour values are the project's. A repository that already has a
token layer extends that one - two token layers side by side is the failure this skill exists to
prevent.
