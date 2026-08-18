# common

Shared building blocks that are not tied to any workflow and not to any stack: how Claude
answers, and two commands that are useful in every repository.

## What ships

| Item | Kind | What it does |
| --- | --- | --- |
| `output-styles/briefing.md` | style **Briefing** | Answer as a ~10-line briefing: what it is about, what was found/done, how to proceed. Paths instead of file dumps. Full step-by-step precision when you have to run something yourself. Answers in German. |
| `output-styles/kis.md` | style **KIS** | Keep it simple: small words, short sentences, only what is necessary. At most 2 options when a decision is needed. |
| `commands/premortem.md` | `/common:premortem` | Assume the plan failed, work backward to causes, early warning signs and preventions. Reads the actual plan first and checks it against the repository. |
| `commands/secrets-scan.md` | `/common:secrets-scan` | Scan staged changes, the tree or history for credentials, connection strings and secrets leaking through logs. |

### Where the karpathy rules went

The behavioral rules against the recurring LLM coding mistakes are no longer here: they ship as
payload of [tech-rules](../tech-rules/README.md) and are installed into a repository as the project
skill `karpathy`, so they also apply to a contributor who has no plugin installed. They stay a
skill rather than an output style for two reasons that have not changed: styles are mutually
exclusive, so shipping them as one would mean giving up **Briefing** or **KIS** to get them, and a
style applies to the main conversation only while a skill reaches subagents.

## Output styles

An output style is appended to Claude Code's system prompt. Both styles here keep the built-in
software-engineering instructions (`keep-coding-instructions: true`), so they change the voice
and the shape of an answer, not how Claude writes code.

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

## Commands

Nothing to activate: with the plugin enabled, `/common:premortem` and `/common:secrets-scan` are
available.

`/common:secrets-scan` defaults to staged changes, so the useful moment is right before a commit;
`tree` and `history` take arguments for the wider sweeps. It looks for credentials and log leaks
only - for injection, authorization and input validation use the built-in `/security-review`.

Findings from a `history` scan mean rotation, not deletion: a secret that was ever pushed is
public.

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
