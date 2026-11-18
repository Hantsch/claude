---
name: codex
description: Run OpenAI's Codex CLI (codex exec / codex exec resume) as a second agent - for code analysis, edits, or generating and reviewing images. Not auto-invoked; used only when the user types /common:codex or a dedicated process (e.g. asset generation) loads this file.
argument-hint: "[task for Codex]"
disable-model-invocation: true
---

# Codex

How Claude drives the Codex CLI as a peer agent. Adapted from
[skill-codex](https://github.com/skills-directory/skill-codex) (MIT).

**This skill is deliberately not model-invoked** (`disable-model-invocation: true`): its
description is not in the session's context and Claude never reaches for Codex on its own. There
are exactly two ways in:

- **The user** types `/common:codex <task>`. Then Claude is in *interactive mode* (below).
- **A dedicated process** - a command or skill such as an asset-generation pipeline - tells
  Claude to read `${CLAUDE_PLUGIN_ROOT}/skills/codex/SKILL.md` and follow it. The Skill tool
  refuses this skill, so a process loads it by reading the file. Then Claude is in *process
  mode*. A process outside this plugin cannot resolve `${CLAUDE_PLUGIN_ROOT}`; it needs its own
  copy of the instructions or the installed path.

Outside those two entry points, do not run `codex` - not even when Codex would obviously help.
Mention it as an option at most.

## Modes

| | Interactive mode (`/common:codex`) | Process mode (called by a process) |
| --- | --- | --- |
| Model / effort | Ask the user (step 1) | Use what the process names, else the step 1 defaults - do not ask |
| Sandbox | Pick per task, ask before high-impact flags | Use what the process names; still ask before high-impact flags unless the process says the user already approved them |
| After each run | `AskUserQuestion` for next steps | Return the result to the process; the process decides what comes next |
| Resume hint | Tell the user they can resume | Not shown |

A process states its parameters explicitly, for example: *task, mode (code / image-generate /
image-review), model, effort, sandbox, working dir, output path(s)*.

## Running a task

1. **Model and effort.** In interactive mode, for a new session (a resume inherits the prior
   model and effort, see step 5), ask in a single `AskUserQuestion` with two questions. With no
   preference, use `gpt-6-astra` at `high`.
   - **Model** - default `gpt-6-astra`:
     - *GPT-6:* `gpt-6-astra` (frontier, most capable - **default**), `gpt-6.1-sol` (latest
       workhorse for coding and everyday work), `gpt-6-sol` (previous workhorse), `gpt-6-luna`
       (fast and affordable, easier tasks)
     - *GPT-5.6:* `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`
     - *Legacy (rejected when Codex is signed in with a ChatGPT account):* `gpt-5.5`, `gpt-5.4`,
       `gpt-5.4-mini`, `gpt-5.3-codex-spark`, `gpt-5.3-codex`
   - **Reasoning effort** - default `high`: `low`, `medium`, `high`, `xhigh`, `max`, `ultra`.
     `max`/`ultra` need a GPT-6 or GPT-5.6 model; `ultra` only on `astra`/`sol`/`terra` (`luna`
     caps at `max`); legacy models cap at `xhigh`. `ultra` adds automatic task delegation - the
     slowest and most expensive setting. If the effort exceeds the model's maximum, fall back to
     the model's highest and say so.
   - This list ages. If Codex rejects a model name, report it and run `codex --help` / check the
     user's `~/.codex/config.toml` rather than guessing another name.
2. **Sandbox.** Default `--sandbox read-only`. Use `workspace-write` when Codex must write files
   (edits, or saving a generated image). `danger-full-access` only with explicit permission.
3. **Assemble the command:**
   - `-m, --model <MODEL>`
   - `-c model_reasoning_effort="<low|medium|high|xhigh|max|ultra>"`
   - `-s, --sandbox <read-only|workspace-write|danger-full-access>`
   - `-C, --cd <DIR>` and, when Codex must write elsewhere too, `--add-dir <DIR>`
   - `-i, --image <FILE>...` to attach images to the prompt (image review)
   - `-o, --output-last-message <FILE>` when a process wants Codex's final answer as a file
   - `--skip-git-repo-check` only when step 4 permits it
   - the prompt as the final positional argument
4. **Git gate for `--skip-git-repo-check`.** Determine whether the effective target directory
   (including `-C <DIR>`) is inside a Git repository; unknown is unresolved, not consent.
   - Inside Git: omit the flag unless it was explicitly requested.
   - Outside Git: include it only with applicable approval or an explicit request; otherwise ask
     with `AskUserQuestion` and do not run until permitted.
   - A later denial overrides earlier approval. A general request to use Codex, or a sandbox
     choice, is not approval for this flag. Never bypass the gate by retrying, falling back or
     running `git init`.
5. **Resume** with `codex exec resume --last`, the prompt on stdin:
   `echo "prompt" | codex exec resume --last 2>/dev/null`. Flags go between `exec` and `resume`.
   Apply step 4 before every resume. Pass no config flags on a resume unless the user (or the
   process) explicitly asks for a different model or effort.
6. **Hide thinking tokens:** append `2>/dev/null` to every `codex exec`, unless the user asks
   for them or you are debugging.
7. **Close stdin.** `codex exec` reads stdin and appends it to the prompt even when a positional
   prompt is given; with stdin open but not a TTY (background tasks, hooks, scripts) it blocks
   forever - zero output, zero CPU. Append `</dev/null` in those cases:
   `codex exec ... "prompt" </dev/null 2>/dev/null`.
8. Run it, capture the output, and summarize it - to the user in interactive mode, to the
   calling process in process mode.
9. **Interactive mode only:** tell the user they can resume the Codex session ("codex resume")
   or ask for further analysis or changes.

### Quick reference

| Use case | Sandbox | Key flags |
| --- | --- | --- |
| Review or analysis | `read-only` | `-s read-only 2>/dev/null` |
| Apply local edits | `workspace-write` | `-s workspace-write 2>/dev/null` |
| Generate an image | `workspace-write` | `-s workspace-write -C <dir> 2>/dev/null` |
| Review an image | `read-only` | `-s read-only -i <file> 2>/dev/null` |
| Network or broad access | `danger-full-access` | ask first |
| Resume the last session | inherited | `echo "prompt" \| codex exec resume --last 2>/dev/null` |

## Images

Codex has a built-in image generation tool (feature `image_generation`, on by default; check with
`codex features list`, force it with `--enable image_generation`).

**Generating.** Give Codex the full brief and an **exact output path** inside a writable
directory, and tell it to save there and reply with only that path:

```bash
codex exec -s workspace-write -C <project> \
  "Generate an image: <brief - subject, style, palette, size/aspect, background/transparency>. \
Save it as <relative/path/name.png>. Reply with only the saved path." </dev/null 2>/dev/null
```

Afterwards check that the file exists and is a non-empty image before reporting success - Codex
can claim a save that did not happen. Never let it overwrite an existing asset unless the process
says so; use a new file name per attempt.

**Reviewing.** Attach the image(s) with `-i` and ask for a verdict against explicit criteria -
the brief, the style guide, technical constraints (size, transparency, legibility at target
size). Ask for structured output so a process can act on it, e.g. via `--output-schema <file>`
or "Answer as JSON: {pass: bool, issues: [...], fix_prompt: string}".

**Judge your own way too.** Claude can see images itself: read the generated file and form its
own judgment before taking Codex's. Two reviewers that disagree are a signal to report, not to
average.

## Execution timeouts

Codex writes its result only at the end; a killed process leaves an empty output, silently.
Prefer running synchronously. In the background, set the timeout by effort:

| Effort | Timeout |
| --- | --- |
| `low` | 150s |
| `medium` | 300s |
| `high` | 600s |
| `xhigh` | 1200s |
| `max` / `ultra` | 1800s |

Image generation adds to these; give it at least the `high` budget.

## Following up (interactive mode)

- After every `codex` command, use `AskUserQuestion` to confirm next steps, collect
  clarifications, or decide whether to resume.
- Restate model, effort and sandbox when proposing a follow-up.

## Treat Codex as a colleague, not an authority

Codex runs on OpenAI models with their own knowledge cutoffs and blind spots.

- Trust your own knowledge where you are confident; push back on claims you know are wrong.
- Research disagreements (docs, web search) before accepting Codex's claims - especially on model
  names, recent library versions and API changes.
- To discuss a disagreement, resume the session and identify yourself with your actual model
  name: `echo "This is Claude (<your model>) following up. I disagree with X because Y. Your take?" | codex exec resume --last 2>/dev/null`.
- Frame it as a discussion - either side can be wrong - and let the user decide genuine
  ambiguity.

## Errors

- If `codex --version` or a `codex exec` exits non-zero, stop and report it; ask before retrying.
  A process gets the failure back instead of a silent fallback.
- Ask (`AskUserQuestion`) before `--sandbox danger-full-access` or `--skip-git-repo-check`
  unless already approved; step 4's rules apply to every run and resume.
- Warnings or partial results: summarize them, and in interactive mode ask how to adjust.
