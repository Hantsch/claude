# common

Shared building blocks that are not tied to any workflow. Right now: **output styles** — they
change *how* Claude answers, in every project you enable the plugin in.

An output style is appended to Claude Code's system prompt. Both styles here keep the built-in
software-engineering instructions (`keep-coding-instructions: true`), so they change the voice
and the shape of an answer, not how Claude writes code.

## What ships

| Style | Selected as | What it does |
| --- | --- | --- |
| `output-styles/briefing.md` | **Briefing** | Answer as a ~10-line briefing: what it is about, what was found/done, how to proceed. Paths instead of file dumps. Full step-by-step precision when you have to run something yourself. Answers in German. |
| `output-styles/kis.md` | **KIS** | Keep it simple: small words, short sentences, only what is necessary. At most 2 options when a decision is needed. |

## Install

```
claude plugin install common@hantsch --scope user
```

User scope makes the styles available in every project. See the marketplace
[README](../../README.md) for why project scope is worth avoiding.

## Activate a style

Installing the plugin only *offers* the styles — nothing changes until you pick one.

- **Terminal:** run `/config`, select **Output style**, pick `Briefing` or `KIS`. Claude Code
  writes the choice to `.claude/settings.local.json` of the current project.
- **Any client / checked-in choice:** set the field yourself, e.g. in `.claude/settings.json`:

```json
{
  "outputStyle": "Briefing"
}
```

The standalone `/output-style` command no longer exists (removed in v2.1.91) — use `/config` or
the setting.

Two things worth knowing:

- The system prompt is read once per session, so a change takes effect after `/clear` or in the
  next session.
- Output styles apply to the **main conversation only**. Subagents run their own system prompt,
  so a subagent's report is unaffected.

## Adding your own style

Drop another markdown file into `output-styles/`. Frontmatter:

| Field | Meaning |
| --- | --- |
| `name` | Name shown in the `/config` picker and used in `outputStyle`. Defaults to the file name. |
| `description` | One line, shown next to the name in the picker. |
| `keep-coding-instructions` | `true` keeps Claude Code's built-in engineering instructions. Leave it out only for non-coding roles. |
| `force-for-plugin` | `true` applies the style automatically while the plugin is enabled and overrides the user's own setting. Deliberately unused here — picking a voice stays the user's decision. |

Everything below the frontmatter is appended to the system prompt verbatim. Run
`pwsh -File scripts/validate.ps1` from the repository root afterwards.
