---
description: Review a .NET diff against the backend house rules - layering, dependency direction, naming, code style and test coverage.
argument-hint: [staged | branch | <path>]  (default: staged)
---

# Backend review

Apply the house rules to changed C# code and report violations. Rules, verbatim:
`${CLAUDE_PLUGIN_ROOT}/skills/backend-guidelines/SKILL.md`, plus
`${CLAUDE_PLUGIN_ROOT}/skills/composition-root/SKILL.md` for anything that touches the entry file
and `${CLAUDE_PLUGIN_ROOT}/skills/csharp-unittest/SKILL.md` for test files. Read them before
judging; do not review from memory.

## Scope

`$ARGUMENTS` selects the diff; default to `staged`.

| Argument | What to review |
| --- | --- |
| `staged` | `git diff --cached` |
| `branch` | `git diff` against the merge base with the default branch |
| a path | every `*.cs` file under it, changed or not |

Review the changed code, not the whole file - but read enough of each file around a change to judge
layering and naming. A project's own `CLAUDE.md` / `AGENTS.md` overrides the skills where it states
a deviation; check for one before reporting a violation, and never report the deviation itself as a
finding.

## Checks

Work through the review checklist at the end of `backend-guidelines`, then these, which need more
than a single file to see:

1. **Dependency direction** - every new `ProjectReference` against the expected direction. A data
   project referencing anything but `*.Core` is a bug, not a preference.
2. **Type placement** - does each new type sit in the right layer and the right folder
   (`Options/`, `Models/`, `Interfaces/`, contracts next to the controller)?
3. **Cross-module access** - a module reaching into another module's data instead of its service.
4. **Registration** - new services, modules and controller assemblies wired through a named static
   registration class, not an authored extension method and not a central list in `Program.cs`.
5. **Test coverage of the change** - a service test and a `WebApplicationFactory` integration test
   for each new feature flow, and no mocking framework in either.

## Report

Group findings by severity, most severe first:

- **Bug** - violates dependency direction, leaks persistence into the domain, business logic in a
  repository or in the host, missing tests for a new flow.
- **Rule** - a layering, placement, naming or style rule broken with no recorded deviation.
- **Note** - something the rules do not cover but that will hurt: a shape that will not extend, a
  name that lies about what the method does.

One line per finding: `path:line` - what rule - what to do instead. No code dumps; quote at most
the offending line. If nothing is wrong, say so in one line and name the rules you checked, so the
green result means something.
