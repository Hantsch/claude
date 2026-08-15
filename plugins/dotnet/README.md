# dotnet

House rules for modular ASP.NET Core backends, as skills Claude reaches for on its own plus one
command you invoke. Nothing is written into your repository - the content lives in the plugin, so
`/plugin update` is the whole update story.

## What ships

| Item | Kind | What it does |
| --- | --- | --- |
| `skills/backend-guidelines/` | skill | Layering (`*.Api` / `*.Core` / `*.<Module>` / `*.<Module>.Data`), where a type belongs, module and controller registration, `Get*` vs `Find*`, code style with the rationale for each rule, required tests, review checklist. |
| `skills/composition-root/` | skill | Turns a noisy `Program.cs` into a 10-20 line table of contents: one named static class per concern under `Configuration/`, called explicitly. |
| `skills/csharp-unittest/` | skill | xUnit tests that a human can read: per-domain test projects, one file per use case under `Cases/<Subject>/<Action>/`, AAA without AAA comments, snake_case names, hand-written fakes. |
| `commands/review.md` | `/dotnet:review` | Applies all three to a diff (staged, branch or path) and reports violations by severity. |

## The rules that surprise people

These are deliberate and settled, not oversights:

- **No hand-written extension methods.** Not on `IServiceCollection`, not anywhere. They hide the
  definition from search and from go-to-definition. Module wiring is a named
  `<Module>ModuleRegistration.Register(...)` static class instead. Calling framework extensions
  (`AddControllers`, `AddApplicationPart`) is of course fine.
- **No `record` types**, DTOs included. One kind of type with one set of mutation rules beats value
  equality.
- **Block namespaces**, `this.` on every member access, block bodies for every method, no
  abbreviations - `cancellationToken`, not `ct`.
- **No mocking framework**, Moq included. Hand-written fakes force a real seam and stay debuggable;
  the whole test method in `csharp-unittest` is built on them.
- **No MediatR, no CQRS** for module use cases.

## Install

```
claude plugin install dotnet@hantsch --scope user
```

To enable it only in the repositories where it belongs, commit an `enabledPlugins` block in that
repository's `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "dotnet@hantsch": true
  }
}
```

The plugin never writes that file - proposing the snippet is as far as it goes.

## Project-specific deviations

A project's own `CLAUDE.md` / `AGENTS.md` wins where it states a deliberate deviation; record it
there and the skills will respect it. Known variants that are supported rather than deviations:

- a separate `*.Infrastructure` project with a request-scoped `ISystemContext` in `*.Core`
- the `*.Tests.<Domain>` test project naming pattern, where a solution already uses it

One exception: hand-written fakes are not negotiable per project. A repository that wants a mocking
framework needs a different testing skill, not an override.

There is a `Hantsch.CSharp.StyleCop` analyzer in use in some solutions whose rule set has not been
reconciled with these skills. Where the analyzer disagrees, the analyzer wins in that repository.
