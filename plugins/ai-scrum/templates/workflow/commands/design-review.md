---
description: Reviews screens of the app against the design system and its reference screens — scan, screenshots at desktop and phone width, a judgement per screen, a report next to the design document. Without a design system it has one built first (Opus), then reviews everything as the baseline.
argument-hint: [screen names | archetype ids | all]
model: sonnet
effort: medium
---

<!-- ai-scrum:managed <ai-scrum-version> - plugin-owned, written by /ai-scrum:setup. Do not edit:
     setup diffs this file on update and asks before replacing it. Project facts go in .claude/ai-scrum.md. -->

Review the design of: **$ARGUMENTS** (empty or `all` = every screen of the design document's
inventory; an archetype id selects all its screens; names select those screens, as they appear in
the UI and the inventory).

You are the orchestrator: you capture, scan and write the report. The judging happens in
`design-reviewer` subagents ([.claude/agents/design-reviewer.md](../agents/design-reviewer.md)),
fresh eyes per batch, and a missing design system is built by the `design-system-author` subagent
([.claude/agents/design-system-author.md](../agents/design-system-author.md)), Opus, because
designing is where the stronger model pays. You change no app code; findings become proposed
stories the user picks.

**What this enforces: nothing.** It renders, compares and reports. What gates is `design-scan` in
`/build`'s narrow gate and the review item on the design system there.

## 0. Profile and design system

Read `.claude/ai-scrum.md`: `design-system`, `design-scan`, `doc-language`. Everything you write
into the repository is in `doc-language`; what you say to the user is in the language they write
in.

- **`design-system` names a file that exists** → step 1.
- **It is `none` or missing, but a design document exists** (`docs/design/README.md`,
  `docs/design-system*`, `DESIGN.md`, a design pointer in `CLAUDE.md`) → use it, and offer once
  to set the profile key to it (`AskUserQuestion`; never set it unasked). Then step 1.
- **No design document, and the project has no user-facing surface** (library, CLI, service, mod)
  → say so in one sentence and stop.
- **No design document, and the project has a UI** → build one first:
  1. Look, read-only and cheaply, at what is there: a token block, a component kit, a styleguide
     or story book, how many screens. Enough for two recommendations, not an inventory.
  2. Ask in one `AskUserQuestion` call, each with a recommendation:
     - **Look:** keep the current look and unify it (recommended when there is a look worth
       keeping) / design a new one (then: a sentence of direction, in "Other").
     - **Reference:** a dev-only page built from the real components (recommended: it cannot
       drift from the code) / a design tool (then: where) / wireframes in the document.
  3. Start one `design-system-author` (`subagent_type: design-system-author`) with: the two
     answers, the profile path, `doc-language`, and the instruction to return its result block.
     Do not do its work yourself and do not read what it writes beyond its result. A malformed
     result: start it once more with the problem named, then report it.
  4. Set `design-system` and `design-scan` in `.claude/ai-scrum.md` to the paths and command it
     returns — the user asked for a design system by running this without one; touch no other
     line of the profile. Propose (never write) the one-line pointer for `CLAUDE.md` it returns.
  5. Continue with step 1, scope `all`, whatever `$ARGUMENTS` said: the first review is the
     baseline.

## 1. Scope

Read the design document: its rules (with ids), its archetypes and its screen inventory (screen →
files → archetype → kit status → gaps), and its `## Review capture` section if it has one. List the
screens in scope with archetype and source files. A name not in the inventory: say so and ask
whether to review it as a screen without archetype. Note the date of the newest report in
`<design document folder>/reviews/` for the comparison in step 5.

## 2. Scan

If `design-scan` is set: run it once without files (drop `{files}`) for the whole-surface metrics
— if the tool needs paths, give it every file of the inventory — and once with `{files}` = the
files of the screens in scope, for their hits. Keep both outputs. If it is `none`, say in the
report that there are no metrics, and the reviewers work from screenshots and source alone.

## 3. Capture

How the app runs for a review, how each screen opens and where the references are, is project
knowledge: take it from the document's `## Review capture` section, else from `CLAUDE.md`, the
profile's `## Notes` and the inventory. What you had to find out yourself goes into that section
at the end (step 5), so the next run does not have to.

1. **The app.** If its dev server already answers, use it. Otherwise start it in the background
   **with throwaway data** wherever the app keeps data (a temp data directory outside the repo, a
   test account, a seeded local database), so nothing real changes and nothing spends money or
   usage. Never send a message, start a paid run or act on real data, on any server — if you
   cannot tell whether the data is real, assume it is.
2. **Viewports:** desktop 1440 × 900; phone 390 × 844 with `hasTouch: true`, `isMobile: true`
   (a new context from `page.context().browser()` in the Playwright MCP) — only if the design
   document says the product runs on phones. Use the widths the document names if it names others.
3. **Catch browser dialogs** before the first click: `page.on('dialog', d => { record d.type(),
   d.message() and the screen; d.dismiss(); })`. Each is a finding against the document's dialog
   rule; pass them to the reviewers with their screen. Where it is cheap and only touches throwaway
   data, trigger a question on purpose (create an item, then delete it).
4. **Open each screen** the way the capture section says (one `browser_run_code_unsafe` call can do
   several), screenshot it, close it before the next. A control the layout cuts off may not be
   clickable: reach it via `page.evaluate` and record the cut-off as a finding. On throwaway data
   most views show their empty state; where a filled view matters, create sample content through
   the UI — only on throwaway data. Views that only show content the throwaway setup cannot produce
   (an agent's answer, a report) stay empty: the scan's hits for their files stand in for them, so
   pass those with the screen.
5. **References:** screenshot each archetype in scope from the reference the document names, at
   both widths.
6. **Files** go to a git-ignored folder, never a tracked path: `.playwright-mcp/design-review/<YYYY-MM-DD>/`
   when `.playwright-mcp/` is ignored, else the system temp folder. Names: `<screen>-desktop.png`,
   `<screen>-phone.png`, `ref-<archetype>-desktop.png`, `ref-<archetype>-phone.png`. If the dev
   server reloads during capture (a parallel `/sprint` edits files), take the shot again.

**Cannot render at all** (no browser tool, the app does not start, a native app without a
driver): say why, skip capture, and let the reviewers judge from source and scan alone — every
verdict then carries `not rendered`. Never claim a look you did not see.

## 4. Judge

Group the screens in batches of up to four (same archetype together) and start one
`design-reviewer` per batch (`subagent_type: design-reviewer`), up to four at a time, in one
message. Give each batch the design document path and, per screen: name, archetype, source files,
its screenshot paths, the reference screenshot paths, its scan hits and the dialogs caught on it.
Do not judge yourself and do not Read the screenshots; that keeps your context small. A malformed
result: start that batch once more, then report it.

## 5. Report

Write `<design document folder>/reviews/<YYYY-MM-DD>-<scope-slug>.md` (`baseline` as the slug for
the first review), in `doc-language`, screen names as in the UI:

```
# Design review <date> — <scope>

Scope: <screens> · reference: <where> · rules: <design document>

## Summary
<3-5 sentences: the state, the biggest problems, what improved since <last report>.>

## Metrics (whole surface)
| Metric | <last report> | Now |
<rows from the scan, plus "screens matching their reference": n / reviewed>

## Findings
<the reviewers' blocks, unchanged, screens ordered by their worst finding>

## Proposed stories
<findings grouped into buildable stories: one per screen or per shared cause (the kit, a shared
frame), each with the rule ids it closes and its screens; high findings first>
```

Then, in the design document: update the gaps and kit columns of the reviewed screens in the
inventory, the status marks of rules the scan shows as now met, the link to the newest report, and
the `## Review capture` section with anything you had to find out in step 3. Change nothing else
in it — rules and decisions are the user's.

## 6. Finish

Stop the dev server if you started it. Report to the user: the verdict per screen in one line
each, the three most important findings, the proposed stories, the report path. Do not commit
(`/sprint` commits; otherwise the user does) and do not write stories into the requirements path
unless the user asks — when they do, as drafts from its `_TEMPLATE`, each citing the report and
the rule ids, for `/refine`.
