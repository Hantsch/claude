---
description: Installs or updates this project's house rules as project skills in .claude/skills/, detected from the tech stack, plus the managed pointer block in CLAUDE.md.
argument-hint: [check]
model: sonnet
effort: medium
---

Install (or update) the house rules in **this project**. Argument: **$1** — `check` means
**report only, change nothing**; empty means do the work.

Everything you write is in **English**.

## What this command owns

The plugin ships this one command plus the rules as **payload**. Setup copies the rules that
match the project's stack into the repository, so they belong to the repository: everyone who
clones it has them, with no plugin installed, no marketplace and no trust dialog. The plugin is
only needed to install or update them — that is this command.

Plugin-owned inside the project (refreshed on update, never hand-edited):

1. `.claude/skills/<name>/SKILL.md` — one folder per installed rule. In a monorepo a group may
   instead live under `<subdir>/.claude/skills/`, where it only loads once Claude touches a file
   in that subtree.
2. `.claude/tech-rules.lock` — version, installed groups and a hash per managed file, so an
   update can tell an untouched copy from one you edited.

User-owned, and only ever touched with an explicit yes:

3. The `tech-rules:managed` block in `CLAUDE.md` — the always-in-context pointer to the skills.
   Everything outside the two markers is none of your business.
4. The one-time files from `${CLAUDE_PLUGIN_ROOT}/templates/oneshot/` — code, copied once, then
   the project's forever.

It does **not** write `.claude/settings.json` (hooks execute code — the user decides), does not
touch `.gitignore`, and does not commit.

## The rule groups

| Group | Skills | Install when |
| --- | --- | --- |
| `all` | `karpathy` | always |
| `dotnet` | `backend-guidelines`, `composition-root`, `csharp-unittest`, `dotnet-review` | a `*.sln` or any `*.csproj` exists |
| `react` | `frontend-guidelines`, `design-tokens` | a `package.json` has `react` in `dependencies` or `devDependencies` |
| `electron` | `electron-arch`, `typed-ipc`, `ui-verify` | a `package.json` has `electron`, or an `electron-vite`/`electron-builder` config exists |

Read the groups from disk, never from this table alone: every folder under
`${CLAUDE_PLUGIN_ROOT}/templates/skills/` is a group, and every folder inside it is one skill
(`templates/skills/all/karpathy/SKILL.md` is the shape). A skill added to the plugin later needs
no change here.

**Install only the groups the project actually has.** This is not tidiness: skill *descriptions*
sit in the context of every session, and when the listing overflows its budget Claude Code starts
truncating them — which strips exactly the trigger sentences the rules are matched on. An Electron
app that also has a React renderer gets both groups; a .NET backend gets neither.

## Phase 1 — Survey (always, also in `check`)

Establish the current state cheaply — Glob/Grep and targeted reads, do not read whole skills:

1. **Plugin version:** read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` → this is the
   version you install.
2. **Lock:** does `.claude/tech-rules.lock` exist? If yes, read it: `tech-rules-version`,
   `groups` and `files` → this is an **update**, not a fresh install.
3. **Stack:** detect the groups per the table above. Note *where* each indicator lives: a
   `package.json` with `react` under `apps/web/` rather than at the root means the group may be
   installed nested (Phase 2). Report every detected group with the file that proved it.
4. **Managed files:** for each skill of each detected group, and for every file the lock lists,
   classify:
   - **untouched** — the lock has a hash for it and `git hash-object <path>` still matches;
   - **local** — the lock records it as `local` (you were told to keep it last time);
   - **modified/unknown** — hash differs, or there is no lock entry (that includes copies from
     the older per-stack plugins);
   - **orphaned** — the lock lists it but its group is no longer detected (the stack is gone).
   No git available → every existing file is **modified/unknown**.
5. **Name collisions and shadows**, all three cheap and all three silent failures otherwise:
   - A `.claude/skills/<name>/` or `.claude/commands/<name>.md` that is the project's own, not a
     copy of a rule (no `tech-rules:managed` marker, no lock entry) — the skill needs the name,
     so this is a collision, not an update.
   - `~/.claude/skills/<name>/` — a personal skill of the same name **wins over the project
     copy**, so the contributor's own version silently replaces the house rule. Report it.
   - An older per-stack plugin (`react`, `dotnet`, `electron` from any marketplace) still
     installed: its `/<plugin>:<skill>` and the project copy then both sit in the listing, twice
     the context and two things to drift. Report the `/plugin uninstall` line.
6. **CLAUDE.md:** does it exist, and does it carry `<!-- tech-rules:managed:start ... -->` /
   `<!-- tech-rules:managed:end -->`? Note the version in the start marker and whether the block
   content still matches what you would write now.
7. **One-time files:** for `electron`, do `scripts/launch.js`-style launcher and a JSON store
   already exist anywhere in the project? Only a missing file is ever offered.
8. **Gitignore safety** — two checks, opposite directions:
   - **Must not be ignored.** Run `git check-ignore -q .claude/skills` and the same for
     `.claude/tech-rules.lock` and any nested target from step 3. An ignored `.claude/` means the
     rules never reach anyone who clones the repo — which defeats this entire command. Say so
     loudly.
   - **Must be ignored.** Nothing to do here beyond mentioning a hit you happen to see; this
     command is not a repository audit.

If `$1` is `check`: report the findings as a short list (lock version vs plugin version, detected
groups with their evidence, managed files per class, collisions/shadows/duplicate plugins, state
of the `CLAUDE.md` block, gitignore verdict) and **stop**. Nothing is written.

## Phase 2 — Confirm (interview)

Ask with `AskUserQuestion`, bundled — at most 4 questions per call, and **only** for things you
could not determine or that are genuine decisions. On an update, ask only about what changed.

1. **Groups**, if the detection is ambiguous or a detected group looks wrong: which groups to
   install. Detected ones are the recommended answer.
2. **Placement**, only when a group's stack lives in a subdirectory: repo root
   (`.claude/skills/`, always loaded) or nested (`apps/web/.claude/skills/`, loaded once Claude
   touches that subtree). Recommend nested in a monorepo with several stacks, root otherwise.
3. **`CLAUDE.md` block**: may setup maintain a marked block there? Show the exact text first.
   A no is fine and changes nothing else — the skills work either way, the block only raises the
   odds that Claude reads the right one at the right time.
4. **One-time files** (`electron`, and only when the target is missing): copy the env-scrubbing
   launcher `templates/oneshot/launch.js` and/or the self-healing store
   `templates/oneshot/json-store.ts`? Name the target path in the question. Default no.

## Phase 3 — Install the skills

Source: every `SKILL.md` (with its folder) under
`${CLAUDE_PLUGIN_ROOT}/templates/skills/<group>/` for each confirmed group →
`<target>/.claude/skills/<skill-name>/SKILL.md`, where `<target>` is the repo root or the
confirmed subdirectory. Copy each file **verbatim**, with exactly one substitution:
`<tech-rules-version>` in the `<!-- tech-rules:managed ... -->` marker becomes the plugin version
from Phase 1. Never adapt a rule to the project — a deviation belongs in the project's
`CLAUDE.md` (see Phase 4), never in an edited copy of the rule.

Per file, decide by its class from Phase 1:

- **missing** → write it.
- **untouched** → overwrite silently (that is what an update is for).
- **local** → leave it, and ask once whether it should now be replaced after all.
- **modified/unknown** → **never overwrite unasked.** Show what differs — prefer
  `git diff --no-index -- <project file> <plugin payload file>`, and if the diff is longer than
  ~30 lines describe it instead of dumping it. Then ask with `AskUserQuestion` (bundle the files,
  max 4 per call): *replace with the plugin version* / *keep mine*. Where the local copy carries
  a deliberate project adaptation, say so explicitly — that adaptation belongs in `CLAUDE.md`,
  and you offer to move it there before replacing the file.
- **orphaned** → ask whether to delete it (the stack is gone) or keep it. Never delete unasked.
- **collision** (Phase 1 step 5, first bullet) → do not diff it, do not offer to replace it.
  Report it and stop for that file; one of the two has to be renamed, and anything else silently
  breaks the project's own skill.

Then write `.claude/tech-rules.lock`, UTF-8 without BOM, one entry per managed file —
`git hash-object <path>` of what is now on disk, or the literal `"local"` for a file the user
kept:

```json
{
  "tech-rules-version": "<plugin version>",
  "groups": ["all", "react"],
  "files": {
    ".claude/skills/karpathy/SKILL.md": "<sha>",
    "apps/web/.claude/skills/frontend-guidelines/SKILL.md": "local"
  }
}
```

Without git, write `"files": {}` and note in the report that drift detection is off, so the next
update will ask about every file.

## Phase 4 — The CLAUDE.md block

Only with the yes from Phase 2, and **only between the two markers**. If `CLAUDE.md` does not
exist, create it with nothing but a title and the block. If it exists, append the block once at
the end; on an update, replace the marked block in place and leave every other line untouched —
byte for byte, including a `## Notes` or house section of the user's own inside the file.

The block is a *pointer*, not a copy of the rules. It stays short, because it is in the context of
every single session:

```markdown
<!-- tech-rules:managed:start <plugin version> -->
## House rules

These rules live in this repository as project skills, so they apply to everyone who works here —
no plugin needed. Installed and updated with `/tech-rules:setup` (plugin `tech-rules@hantsch`).

| Read before | Skill |
| --- | --- |
| any code change | `/karpathy` |
| touching `<frontend path>` | `/frontend-guidelines`, `/design-tokens` |
| touching `<backend path>` | `/backend-guidelines`, `/composition-root`, `/csharp-unittest` |
| main / preload / renderer, IPC, `webPreferences` | `/electron-arch`, `/typed-ipc` |

Do not edit a skill to make it fit this project. A deviation is recorded **here**, with its
reason, and wins over the skill; a deviation without a reason is a violation that has been
written down.
<!-- tech-rules:managed:end -->
```

Only rows for skills actually installed, with the project's real paths from the survey. A nested
group says where it lives. Nothing else goes in the block.

## Phase 5 — The one-time files

Only with the yes from Phase 2, only when the target does not exist, and **never** on an update:
these are code, user-owned from the moment they land. Copy verbatim, carry no marker, get no lock
entry. Say in the report which target you wrote and, for the launcher, the `package.json` script
line the user may want (`"dev": "node scripts/launch.js electron-vite dev"`) — you do not edit
`package.json`.

## Phase 6 — Report

Short and complete:

- Lock: path, version (from → to on an update), installed groups with the evidence that detected
  them.
- Skills: installed / updated / kept / deleted, as short lists with their paths.
- `CLAUDE.md`: block written, updated, or declined.
- One-time files: written, skipped because present, or declined.
- **Collisions, personal-skill shadows and still-installed per-stack plugins** from Phase 1
  step 5, each with the one line that fixes it.
- **Gitignore verdict.** If `.claude/` is ignored, this is the first thing the user has to fix —
  nothing else in this report reaches the team otherwise.
- **What is enforced and what is not.** Say it plainly: skills and `CLAUDE.md` make Claude *aware*
  of the rules, they do not enforce them. Real enforcement is a lint rule, a test, or a
  `PostToolUse` hook in `.claude/settings.json`. If the project has a lint or typecheck script,
  offer the hook as a snippet the user can paste — you do not write that file.
- **Commit reminder:** `.claude/skills/`, `.claude/tech-rules.lock` and the `CLAUDE.md` block only
  reach the team once they are committed — name the paths, do not commit them yourself.
- Next step: nothing to run. The skills are live in this session; check with `/skills`.

## Rules

- **Do not commit, do not push.** Setup writes files; the user commits deliberately.
- **Never write `.claude/settings.json`**, and never anything in `CLAUDE.md` outside the two
  markers.
- **One copy of a rule.** The payload is the only source; the project copy is a copy. If a project
  needs something else, that is a deviation recorded in `CLAUDE.md`, not an edited skill.
- Idempotent: running setup twice in a row changes nothing the second time.
- If the project is not a git repository, say so and continue — only drift detection degrades
  (every existing file is then treated as modified, so you ask).
