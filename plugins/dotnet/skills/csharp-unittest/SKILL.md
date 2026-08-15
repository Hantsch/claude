---
name: csharp-unittest
description: 'Write or review C# unit tests for any project. Use when adding a new xUnit/NUnit/MSTest unit test, covering a new use case for a domain, restructuring existing tests, or asked to "write a test", "add unit test", "cover this use case with a test", "test this service". Enforces: per-domain test projects, one file per use case, AAA structure, descriptive snake_case test names, hand-written fakes (no mocking frameworks), blackbox testing of behavior (never modify production code to satisfy a test), and human-verifiable assertions.'
---

# C# Unit Test Authoring

Project-agnostic skill for producing C# unit tests that are easy for a human to read, verify, and copy as templates for new use cases. xUnit is preferred; NUnit/MSTest are acceptable when the repository already uses them.

## When to Use

- Adding a unit test for any service / domain logic in a C# project.
- A new use case is introduced and needs coverage.
- Restructuring or splitting existing test files that bundle multiple use cases.
- Reviewing a proposed test for readability and structural compliance.

Do **not** use for: integration tests against real infrastructure, HTTP-level end-to-end tests, UI tests. The `backend-guidelines` skill, if available, covers the `WebApplicationFactory` integration test that ships alongside these unit tests.

A project's own `CLAUDE.md` / `AGENTS.md` wins where it states a deliberate deviation — with one exception: rule 3 below. Hand-written fakes are what makes the rest of this method work, so a repository that wants a mocking framework needs a different testing skill, not an exception in this one.

## Core Rules

1. **Blackbox testing only.** Tests verify the *use case* and the *observable behavior* of the public API of the unit under test. Never reach into private state, never assert on internal call sequences when the resulting state is observable, never couple a test to an implementation detail that could legitimately change.
2. **Never modify production code to make a test pass** If a test fails:
   - First, confirm the test correctly expresses the use case.
   - If yes and the code is wrong → ask for confirmation.
   - If the code is correct and the test only fails because of an inconvenient API shape → the *test* must adapt (construct inputs differently, use a fake) — do not loosen visibility, add test-only constructors, expose internals, or insert hooks into production code purely to satisfy the test.
   - `InternalsVisibleTo`, widening `internal` → `public`, widening `protected` → `internal`, new "for testing" overloads, virtualizing members solely for mocking: all forbidden as a means to satisfy a test.
3. **No mocking frameworks.** No `Moq`, `NSubstitute`, `FakeItEasy`, `JustMock`. Use hand-written fakes / stubs / test doubles. Hand-written fakes force a clean seam, are debuggable, and make the test readable without DSL knowledge.
4. **One test project per domain.** Tests for a domain live in a dedicated project. Default naming pattern: `<RootNamespace>.<Domain>.Tests` (e.g. `Acme.Billing.Tests`, `Acme.Invoicing.Tests`). The alternative pattern `<RootNamespace>.Tests.<Domain>` (e.g. `Acme.Tests.Billing`) is only acceptable when a project with that pattern already exists in the solution — in that case, stay consistent with it. Do not pile cross-domain tests into a generic catch-all test project.
5. **One file per use case, grouped by subject and action under `Cases/`.** File name encodes the use case: `<Action>_<Scenario>_Tests.cs` (e.g. `CreateInvoice_ForSingleLineItem_Tests.cs`). Each file contains the test methods that verify a single behavior, not an entire service surface. Test files must be grouped into per-action subfolders inside a per-subject subfolder of `Cases/`, where the *subject* is the unit under test (the class / controller / service whose behavior the file verifies) — e.g. `Cases/InvoiceService/CreateInvoice/`, `Cases/MoviesController/DeleteMovie/`. Do not pile loose test files into the project root, directly under `Cases/`, or directly under a subject folder.
6. **AAA structure, no AAA comments.** Arrange / Act / Assert visually separated by blank lines. The structure itself must make the intent obvious; if a comment feels necessary, restructure instead.
7. **Descriptive snake_case test names.** `Solo_watch_creates_single_entry_for_owner` reads as a sentence stating the expected behavior. No `Test_`, `Should_`, `Given_When_Then_` prefixes.
8. **Framework: xUnit preferred.** `[Fact]` for single cases, `[Theory]` + `[InlineData]` for parameterized variants of the *same* use case. If the repository already uses NUnit/MSTest, follow that framework but keep every other rule.
9. **Assertions verify observable outcomes.** Prefer asserting on the resulting state (returned value, repository contents, raised event, thrown exception) over inspecting that a method was called.

## Procedure

### Step 1 — Understand the use case before touching anything

1. Read the public API of the unit under test (signatures, return types, documented behavior).
2. State the use case in one sentence: *"When &lt;preconditions&gt;, &lt;action&gt; should &lt;observable outcome&gt;."*
3. Identify the **observable seams**: return value, mutated collaborator state, raised events, thrown exceptions.
4. If you cannot describe the use case without referring to private fields or implementation steps → the test target is wrong; pick a higher-level observable behavior.

### Step 2 — Locate or create the domain test project

1. Identify the domain of the code under test.
2. Look for an existing test project for that domain. The preferred naming pattern is `*.<Domain>.Tests`; the alternative `*.Tests.<Domain>` is acceptable only if a project using that pattern already exists in the solution (then keep using it for consistency).
3. If none exists, create one mirroring the conventions of any existing test project in the solution:
   - Same target framework as the production project.
   - Reference *only* the production project(s) under test plus the test framework packages.
   - Add the new project to the solution file.

Do not add new domain use cases to a generic catch-all `*.Tests` project if a domain-specific one exists or can reasonably be created.

### Step 3 — Name the use case and the file

Pick the use case as `<Action>_<Scenario>`:

- **Action** = method or behavior under test (`CreateInvoice`, `DeleteOrder`, `ValidateCoupon`).
- **Scenario** = the specific condition being verified (`ForSingleLineItem`, `RejectsExpiredCoupon`, `IsIdempotent`).

File name: `<Action>_<Scenario>_Tests.cs`.
Folder: place the file under `Cases/<Subject>/<Action>/` inside the domain test project, where `<Subject>` is the class under test (e.g. `InvoiceService`, `MoviesController`). All files for the same subject + action live together; the project root, `Cases/`, and any subject folder must not contain loose test files.
Namespace: mirror the folder structure — `<RootTestNamespace>.Cases.<Subject>.<Action>`.
Class name: identical to file name (without `.cs`).

Example layout:

```
Acme.Billing.Tests/
├── Cases/
│   ├── InvoiceService/
│   │   ├── CreateInvoice/
│   │   │   ├── CreateInvoice_ForSingleLineItem_Tests.cs
│   │   │   └── CreateInvoice_RejectsExpiredCoupon_Tests.cs
│   │   └── DeleteOrder/
│   │       └── DeleteOrder_CascadesLineItems_Tests.cs
│   └── InvoicesController/
│       └── CreateInvoice/
│           └── CreateInvoice_ReturnsCreatedAtAction_Tests.cs
├── Fakes/
└── Helpers/
```

Multiple unrelated scenarios for the same subject + action → multiple files in the same `Cases/<Subject>/<Action>/` folder, not multiple test classes in one file.

### Step 4 — Set up fakes and helpers

- Hand-written fakes live in a `Fakes/` folder. They expose plain accessors (e.g. `Get(...)`, `TryGet(...)`, `All()`) used directly in `Assert`.
- Reusable construction logic lives in a `Helpers/` (or `Builders/`) folder.
- Reuse existing fakes/helpers before creating new ones. A new fake is justified only when no existing one models the collaborator.
- Fakes must be deterministic: no real I/O, no `Task.Delay`, no `DateTime.Now`/`DateTime.UtcNow` inside the fake — inject clocks or pass fixed timestamps from the test.
- A fake must implement the same public interface or abstract base as the real collaborator. If no seam exists and one would require widening visibility purely for the test → see Core Rule #2; design the test around the public API instead, or introduce a *legitimate* seam (an interface used by production composition, not test-only).

### Step 5 — Write the test methods

Template (xUnit):

```csharp
[Fact]
public async Task <Subject>_<observable_outcome>()
{
    var repo = new FakeOrderRepository();
    var service = OrderTestHelpers.CreateService(repo);

    await service.PlaceOrderAsync("order-1", "customer-1",
        new PlaceOrderRequest(items: [new("sku-1", 2)]));

    var order = Assert.Single(repo.All());
    Assert.Equal("order-1", order.Id);
    Assert.Equal(OrderStatus.Placed, order.Status);
}
```

Conventions:

- Blank lines (not `// Arrange/Act/Assert` comments) separate the three sections.
- Inline literal IDs (`"order-1"`, `"customer-1"`) when they aid readability; lift to `private static readonly` fields only when reused across many tests in the same file.
- Prefer expressive assertions: `Assert.Single`, `Assert.Equal`, `Assert.Null`, `Assert.Empty`, `Assert.All`, `Assert.Throws<T>` over manual boolean checks.
- One logical assertion per behavior. Multiple `Assert` calls are fine when they describe one outcome (e.g. all fields of the created entity).
- Async test methods return `Task` and use `async`/`await`; never `.Result` or `.Wait()`.
- Test data is constructed in the Arrange block, not pulled from external files unless the use case genuinely is about file content.

### Step 6 — Validate

Run only the affected project, then the full solution:

```powershell
dotnet test <path-to-domain-test-project.csproj>
dotnet test <path-to-solution.sln>
```

Verify checklist:

- [ ] File name = class name = `<Action>_<Scenario>_Tests`
- [ ] File lives under `Cases/<Subject>/<Action>/`, not in the project root, directly under `Cases/`, or directly under the subject folder
- [ ] Namespace mirrors the folder path (`...Cases.<Subject>.<Action>`)
- [ ] Lives in the correct domain test project (not a catch-all)
- [ ] No mocking framework references; only hand-written fakes
- [ ] AAA visually separated, no AAA comments
- [ ] Test method names read as sentences in snake_case
- [ ] Assertions check observable outcomes, not interactions
- [ ] **No production code was modified to make the test pass** (unless fixing a real bug surfaced by the test)
- [ ] **No visibility was widened, no test-only constructors/overloads/`InternalsVisibleTo` added for the sake of the test**
- [ ] All tests pass

## Anti-patterns

- ❌ Changing `private` to `internal` + adding `InternalsVisibleTo` so a test can reach into internals.
- ❌ Adding a `// for testing` constructor, factory, setter, or virtual member to production code.
- ❌ Asserting `mock.Verify(x => x.DoThing(...))`-style call-recording when the resulting state is observable.
- ❌ Using `Mock<IRepository>` from a mocking framework instead of a hand-written fake.
- ❌ One giant `OrderServiceTests.cs` covering place / cancel / refund / ship in one class.
- ❌ Adding new domain tests to a generic `*.Tests` project when a domain-specific project exists or could exist.
- ❌ Dropping test files into the project root, directly under `Cases/`, or directly under a subject folder, instead of grouping them under `Cases/<Subject>/<Action>/`.
- ❌ Mixing tests for different subjects (e.g. a service and its controller) under the same action folder.
- ❌ Test names like `Test1`, `CreateWorks`, `ShouldReturnTrue`, `GivenXWhenYThenZ`.
- ❌ `// Arrange`, `// Act`, `// Assert` comments compensating for unclear structure.
- ❌ Sharing mutable fixtures across tests (use a fresh fake per test method).
- ❌ Tests that pass today only because of an internal implementation choice (e.g. asserting iteration order when none is contractually guaranteed).
