---
name: composition-root
description: 'Keep backend application entry points (Program.cs, Startup.cs, main bootstrap files) small and readable by extracting DI registration and middleware/pipeline configuration into discoverable, explicit static classes - not extension methods. Use when the entry file becomes noisy with inline registration code, when asked to "clean up Program.cs", "refactor startup", "split bootstrap", "simplify backend entry point", or whenever DI/middleware wiring grows beyond a handful of lines in an ASP.NET Core / .NET host (or a comparable backend host in another language). Produces one static class per concern (e.g. MongoDbRegistration, HttpPipeline) under a Configuration/ folder, called by name from the entry point so go-to-definition jumps directly to the wiring. DO NOT USE FOR: frontend bootstrap, build tooling, or domain/business logic refactoring.'
---

# Backend Composition Root Cleanup

Project-agnostic skill for keeping the application entry point (the *composition root*) small,
linear and discoverable. Applies primarily to .NET `Program.cs` (minimal hosting), but the same
pattern works for any bootstrap file: `Startup.cs`, `main.ts`, `app.py`.

## When to Use

- The entry file mixes configuration reading, DI registration, middleware wiring and `Run()` in
  one long script.
- A new module/feature is being added and its registration would further bloat the entry file.
- Asked to "clean up", "refactor", "simplify" or "split" the bootstrap / startup / `Program.cs`.
- Reviewing a noisy `Program.cs` with section-comment banners (`// -- MongoDB --`).

Do **not** use for: changes to application logic, controllers, services or domain code. This skill
only restructures wiring code.

## Core Rules

1. **No hand-written extension methods on `IServiceCollection` / `WebApplication` - or anywhere
   else.** They look idiomatic but *hide* the registration: searching for "Mongo" does not find
   `AddMongoDb`, and go-to-definition from `builder.Services` jumps into a generic extension list.
   Discoverability beats idiom. Calling the extension methods the framework ships
   (`AddControllers`, `AddApplicationPart`, `UseRouting`) is unavoidable and fine - the ban is on
   the ones you write.
2. **One static class per concern, named for what it does.** `MongoDbRegistration`,
   `ImageStorageRegistration`, `CrossCuttingRegistration`, `HttpPipeline`,
   `AuthenticationRegistration`. The class name is what the reader sees in the entry file - pick
   names that make the entry file read like a table of contents.
3. **Single public method per class, named for the action.** `Register(...)` for DI wiring,
   `Configure(...)` for middleware/pipeline wiring. Multiple methods only when genuinely distinct
   concerns share infrastructure.
4. **Explicit static calls in the entry file.**
   `MongoDbRegistration.Register(builder.Services, builder.Configuration);` - not
   `builder.Services.AddMongoDb(...)`.
5. **Pass dependencies as parameters, return values out.** Need the storage root path after
   `Build()`? Return it from `Register`. Do *not* introduce static state, `out` parameters where a
   return value works, or service-locator lookups in the entry file.
6. **Keep the entry file linear and comment-free.** No section banners. If a call site needs a
   comment to explain it, the class name is wrong - rename the class.
7. **Folder: `Configuration/` next to the entry file.** `internal static class`, one file per
   class.
8. **Do not add abstractions you do not need.** No interfaces, no base classes, no "registrar"
   pattern. Plain static classes. A two-line concern may still deserve its own class for
   discoverability - but never invent ceremony.

## Where this meets module registration

In a modular solution, each domain module owns its own registration class
(`<Module>ModuleRegistration.Register(...)`), which also registers the module's controller assembly.
The host's job is to call those by name, in order, next to the infrastructure registrations. The
same rule applies on both sides of that boundary: named static classes, no authored extension
methods. See the `backend-guidelines` skill for the module side.

## Procedure

### Step 1 - Read the current entry file end-to-end

1. List every distinct concern in the file (config reading, database, storage, auth, MVC, OpenAPI,
   middleware, static files).
2. Note any values produced during registration that are needed later (e.g. a resolved path used
   by middleware after `Build()`).
3. Note any required-configuration helpers (`Require(key)`-style functions) - these typically
   inline into each registration class.

### Step 2 - Group concerns into classes

- **Own class** if it owns roughly three or more lines of setup, or represents a distinct subsystem
  (database, storage, auth, telemetry, messaging).
- **Stay inline in the entry file** if it is a single framework call (`AddControllers()`,
  `AddOpenApi()`, `Run()`).
- **Grouped under a single class** only if the items are genuinely the same concern (e.g.
  `TimeProvider` + `ReadinessService` + `ReadinessProbe` -> `CrossCuttingRegistration`).

Rule of thumb: the entry file ends up at 10-20 lines for a typical web API.

### Step 3 - Name each class

Pattern: `<Concern><Role>`, where `<Role>` is `Registration` for DI or `Pipeline` (or similarly
descriptive) for middleware.

Good: `MongoDbRegistration`, `ImageStorageRegistration`, `AuthenticationRegistration`,
`HttpPipeline`, `CrossCuttingRegistration`.

Bad: `Bootstrap`, `Setup`, `ServiceCollectionExtensions`, `DIConfig`, `Module1`.

### Step 4 - Define the method signature

```csharp
internal static class MongoDbRegistration
{
    public static void Register(IServiceCollection services, IConfiguration configuration) { ... }
}
```

When a value computed during registration is needed later in the entry file, return it:

```csharp
internal static class ImageStorageRegistration
{
    public static string Register(IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        // ...
        return storageRoot;
    }
}
```

Pipeline / middleware:

```csharp
internal static class HttpPipeline
{
    public static void Configure(WebApplication app, string storageRoot) { ... }
}
```

### Step 5 - Rewrite the entry file as a linear sequence

```csharp
using MyApp.Configuration;

var builder = WebApplication.CreateBuilder(args);

MongoDbRegistration.Register(builder.Services, builder.Configuration);
CrossCuttingRegistration.Register(builder.Services);
var storageRoot = ImageStorageRegistration.Register(builder.Services, builder.Configuration, builder.Environment);

var mvcBuilder = ApiBootstrap.CreateMvcBuilder(builder.Services);
MembersModuleRegistration.Register(builder.Services, mvcBuilder, builder.Configuration);
EventsModuleRegistration.Register(builder.Services, mvcBuilder, builder.Configuration);

var app = builder.Build();
HttpPipeline.Configure(app, storageRoot);
app.Run();
```

The entry file now reads top-to-bottom as a list of subsystems and modules. Every name is
searchable and navigable.

### Step 6 - Verify

1. Build the project - no compile errors.
2. Run the existing test suite - behavior is unchanged, only structure moved.
3. Re-read the entry file. Can a new contributor identify every subsystem from that file alone?

## Anti-Patterns

- **Authored extension methods (`services.AddMongoDb()`).** Hides the call behind a generic
  IntelliSense list.
- **A single `Bootstrap.Configure(builder)` class.** Moves the noise out of `Program.cs` into one
  giant file.
- **Static config classes with mutable state.** Registration classes must be pure functions of
  their parameters.
- **`out` parameters where a return value works.**
- **Section-banner comments in the entry file.** The class name *is* the section banner.
- **Premature abstraction.** No `IRegistrar` interface, no reflection-based auto-discovery.

## Output

- New folder `Configuration/` (or the equivalent next to the entry file).
- One `internal static class` per concern, one file each.
- Rewritten entry file: linear, 10-20 lines, no inline registration logic, no section comments.
- Build green, tests green.
