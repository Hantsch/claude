---
name: backend-guidelines
description: "Architecture, layering, naming and code-style rules for modular ASP.NET Core backends. Use when: creating or editing files under any backend module project; adding a controller, service, domain model, repository or data model; introducing a new module/feature project; wiring module and controller registration in the API host; designing cross-module calls; naming lookup methods (Get vs Find); deciding where a type belongs (Api vs Service vs Data); adding enums, contracts or domain factories; reviewing backend code for layering, dependency or code-style violations. DO NOT USE FOR: frontend changes; infrastructure/Docker; role-matrix or permission changes."
---

<!-- tech-rules:managed <tech-rules-version> -->

# Backend Guidelines (Modular ASP.NET Core)

Project-agnostic rules for a modular ASP.NET Core backend organized as `*.Api` (host) + `*.Core`
(shared) + per-domain module project pairs (`*.<Module>` + `*.<Module>.Data`).

**Precedence:** a project's own `CLAUDE.md` / `AGENTS.md` wins over this skill where it states a
deliberate deviation. Record the deviation there rather than arguing with the rule in code review.

## Solution Structure

```
<Solution>.Api/             HTTP host only - composition root, no feature logic
<Solution>.Core/            Shared cross-cutting abstractions allowed across the backend
<Solution>.<Module>/        Domain module: controllers, contracts, services, domain models
<Solution>.<Module>.Data/   Persistence models + repositories for that module
```

Each domain is a **project pair**: domain project + data project. Domains stay isolated by
namespace and project boundaries.

### Optional layout: a separate Infrastructure project

Some solutions split runtime infrastructure (database client setup, authentication, request
context or tenancy middleware) out of the host into `<Solution>.Infrastructure/`, with a
request-scoped context abstraction such as `ISystemContext` in `*.Core` that exposes the current
tenant and user. That is a supported variant, not a second style to mix in: either the host owns
infrastructure wiring or the Infrastructure project does. When it exists, the dependency direction
extends to `*.Api -> *.Infrastructure -> *.Core`, and module projects may depend on the context
abstraction in `*.Core` but never on `*.Infrastructure`.

## Layer Rules

### Api Layer (inside module projects)

- Controllers live in **module projects**, never in the API host project. The host stays a
  composition root; a controller there would make the host own a feature.
- Request and response contracts live next to the controller inside the module project.
- Controllers call services directly.
- No MediatR. No commands/queries/handlers. No CQRS pattern for module use cases - the indirection
  buys nothing at module scale and hides the call graph.

### Service Layer

- Business logic lives in services.
- Domain models live in the service layer, not the data layer.
- Services orchestrate domain objects and repositories.
- Mapping logic belongs on the **main domain object**, not duplicated in services.
- Within the same domain hierarchy, neighboring types may reference each other when it improves
  readability.
- **Options / configuration classes are not services.** Strongly-typed configuration POCOs (e.g.
  `JwtOptions`, `GoogleOptions`) live in a dedicated `Options/` folder inside the module, not under
  `Services/`. Their namespace is `<Module>.Options`.
- **`Services/` is for service classes only.** Domain models, queue messages and value objects
  live in a `Models/` folder with namespace `<Module>.Models`. A folder that holds one kind of
  thing can be scanned; a folder that holds everything has to be read.

### Domain Model Rules

- The **main domain object** is the focus of the domain.
- It owns the constructors / factory-style initialization paths used by the flow.
- It supports initialization from the domain **create input** and from the **persistence
  document**.
- It exposes mapping methods back to the **persistence document** and to the **API response
  contract**.
- Services call these constructors and mapping methods instead of duplicating mapping logic.
- No persistence attributes on service-layer domain models - an attribute from the storage library
  is a data-layer dependency smuggled into the domain.

### Data Layer (`*.Data` projects)

- Data models are **persistence models only**.
- Repositories only handle read/write operations - no business logic.
- **Data projects must be independent.** Only `*.Core` is allowed as a `ProjectReference`.
- If a data project needs shared types, move them out so the data project stays independent.
- If it needs infrastructure-specific code, hide it behind a boundary that does not require
  referencing another project.

## Host Rules (`*.Api`)

- `*.Api` is the composition root. Keep it linear and readable; the `composition-root` skill
  describes the shape in detail.
- It registers infrastructure and module services, and loads controllers from module assemblies.
- It must not contain feature business logic.

## Module and Controller Registration

**No hand-written extension methods.** Registration happens through named static classes, so that
searching for a module name finds its wiring and F12 from the host jumps straight to it. Calling
extension methods the framework ships (`AddControllers`, `AddApplicationPart`, `UseAuthentication`)
is unavoidable and fine - the rule is about the ones you write.

- The host creates the shared MVC builder with a **single** `AddControllers()` call. A bootstrap
  helper (e.g. `ApiBootstrap`) returns that `IMvcBuilder`.
- Each module ships one `internal static class <Module>ModuleRegistration` with a single
  `Register` method that takes what it needs and returns nothing (or a value the host needs
  later):

```csharp
internal static class MembersModuleRegistration
{
    public static void Register(IServiceCollection services, IMvcBuilder mvcBuilder, IConfiguration configuration)
    {
        mvcBuilder.AddApplicationPart(typeof(MembersController).Assembly);

        services.AddScoped<IMemberService, MemberService>();
        services.AddScoped<IMemberRepository, MemberRepository>();
    }
}
```

- The host calls it by name:

```csharp
MembersModuleRegistration.Register(builder.Services, mvcBuilder, builder.Configuration);
```

- Each module registers its **own** controller assembly with `AddApplicationPart`. Controller
  registration stays **inside** the module's registration class - never in a central list in
  `Program.cs` or the bootstrap helper, which would have to be edited for every new module.

## Module Rules

- Cross-module business logic goes through **explicit service boundaries**, not direct data access
  into another module.
- Interfaces live in their own dedicated folder named `Interfaces` within the relevant layer or
  module.

## Expected Dependency Direction

```
*.Api             -> module projects, *.Core, *.Infrastructure (if it exists)
*.Infrastructure  -> *.Core
module project    -> its own *.Data project, *.Core
*.Data project    -> *.Core only
*.Core            -> no backend project references
```

Any reference that violates this direction is a bug.

## Method Naming Rules

`Get...` methods **must return a concrete item** and must throw when missing; they must not return
a nullable primary value. `Find...` methods are optional lookups and **may return `null`**. The
name alone then tells a caller whether a null check is required:

```csharp
Task<Member> GetBySlugAsync(string slug, CancellationToken cancellationToken);   // throws if missing
Task<Member?> FindBySlugAsync(string slug, CancellationToken cancellationToken); // null if missing
```

## Code Style Rules

Each of these is a taste decision that was made once so it stops being re-litigated per file. The
rationale is why it was picked, not a proof that the alternative is wrong.

- **Block namespaces only.** File-scoped namespaces are not allowed - the majority of the codebase
  is block-scoped and a mixed solution makes every diff a style discussion.
- **Classes only. No `record` or record-like types** for models, contracts or results, DTOs
  included. Value equality and the compact syntax are not worth having two kinds of type with two
  sets of mutation rules in the same solution.
- **No hand-written extension methods.** They read as idiomatic but hide the definition: searching
  for a name does not find the call site, and go-to-definition lands in a generic list. Write a
  named static class and call it explicitly.
- **Enums:** the first value must be `NotSet = 0`, so a default-constructed value is visibly
  "not set" instead of accidentally meaning the first real case.
- **Prefer `var`** when the type is obvious from the right-hand side.
- **`this.` everywhere** for class members (`this.field`, `this.Method()`) - it makes the
  member/local distinction visible without relying on editor colours.
- **One class per file.** The file name answers "where does this type live" without a search.
- **No expression-bodied methods.** Methods always use a block body (`{ ... }`), even one-liners,
  including overrides, static helpers and test helpers, so that adding a second statement is not
  a syntax change. This applies to methods only - properties, indexers and actual lambdas (LINQ
  predicates, callbacks) are unaffected.
- Short lambdas with short, obvious parameter names are fine when they improve readability.
- **Descriptive, consistent names.** No abbreviations for parameters, variables, fields or
  properties: `cancellationToken`, not `ct`.

There is a `Hantsch.CSharp.StyleCop` analyzer package in use in some solutions. Its rule set has
not been reconciled with this skill, so treat these rules as prose: if the analyzer disagrees, the
analyzer wins in that repository and the deviation belongs in the project's own docs.

## Tests

- Per feature: at least one xUnit **service test** and one **integration test** through
  `WebApplicationFactory` covering the main flow. The service test pins the logic, the integration
  test pins the wiring - a green service test says nothing about registration and routing.
- Integration tests run against the real host and an ephemeral database. Do not mock your own
  endpoints.
- **No Moq**, and no other mocking framework. Hand-written fakes only. See the `csharp-unittest`
  skill for the structure; it is load-bearing there, not a preference.
- Tests land with the code, in the same change.

## Forbidden Patterns

- No MediatR.
- No Moq or any other mocking framework - hand-written fakes.
- No command/query/handler pattern for module use cases.
- No hand-written extension methods (framework ones may be called).
- No controllers in the API host project.
- No business logic in repositories.
- No persistence attributes on service-layer domain models.
- No project references from data projects other than `*.Core`.
- No `record` types.

## Review Checklist

- [ ] Controller lives in a module project, not in `*.Api`
- [ ] Request/response contracts sit next to the controller
- [ ] Controller calls a service directly (no mediator/handler)
- [ ] Service contains the business logic; the domain object owns its mapping
- [ ] Data project references **only** `*.Core`
- [ ] Repository contains only read/write logic
- [ ] No persistence attributes on service-layer domain models
- [ ] Interfaces live in an `Interfaces/` folder
- [ ] Options / configuration POCOs live in `Options/`, not under `Services/`
- [ ] Service-layer domain models / messages / value objects live in `Models/`, not under `Services/`
- [ ] `Get*` throws on miss; `Find*` returns `null` on miss
- [ ] Module wiring is a named static `<Module>ModuleRegistration` class, not an extension method
- [ ] Module registers its own controller assembly via `AddApplicationPart`, inside that class
- [ ] Block namespace, one class per file, `this.` access, `var` where obvious, no records
- [ ] Enum starts with `NotSet = 0`
- [ ] No expression-bodied methods (`=>`) - methods use block bodies
- [ ] No abbreviated names (`ct`, `req`, `svc`)
- [ ] A service test and a `WebApplicationFactory` integration test ship with the feature
- [ ] No mocking framework anywhere in the test projects
