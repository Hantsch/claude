# Sprint token analysis — 2026-09-25

**What this is.** A cost breakdown of the seven most recent `/sprint` runs of the ai-scrum
workflow (q2-launcher S22–S24, second-brain S17, Frontend-Scotty S14–S16), read from the
session transcripts under `~/.claude/projects/<project>/<session>.jsonl` and the subagent
transcripts under `<session>/subagents/`. It names where the tokens go, ranks the levers, and
records which of them were turned into workflow changes on this date (ai-scrum `## Unreleased`
at the time of writing) so the next sprints can be compared against it.

Prices are list prices per million tokens (Opus 15 / 18.75 / 1.5 / 75, Sonnet 3 / 3.75 / 0.3 /
15 for input / cache write / cache read / output). Usage was de-duplicated by message id, because
a streamed assistant message is written as several records carrying the same usage block.

## Where the money goes

| Sprint | Subagents | Opus share | Orchestrator | Agents | Stories |
| --- | --- | --- | --- | --- | --- |
| q2-launcher S22 | $45 | 62 % | $11 | 32 | 4 |
| q2-launcher S23 | $63 | 42 % | $4 | 38 | 4 |
| q2-launcher S24 | $156 | 57 % | $2 | 46 | 4 |
| second-brain S17 | $244 | 49 % | $6 | 59 | 4 |
| Frontend-Scotty S14 | $86 | 61 % | $5 | 36 | 3 |
| Frontend-Scotty S15 | $117 | 76 % | $2 | 23 | 2 |
| Frontend-Scotty S16 | $17 | 75 % | $1 | 9 | aborted early |

By token category across the six full sprints: roughly 60 % cache reads, 35 % cache writes,
3 % output, input negligible. The bill is **turns × context size**, not what the agents write.
The sprint orchestrator itself is irrelevant at $2–11; the one outlier (S22, $11) ran 21 of its
101 calls on Opus because the session model was switched mid-run — the rule against exactly
that already exists in `sprint.md`.

By agent role (S24 / S17 / S15):

| Role | S24 | S17 | S15 | Note |
| --- | --- | --- | --- | --- |
| deliverable agents | $56 (Opus $35) | $115 (Opus $36) | $74 (Opus $60) | 22 / 27 / 10 agents |
| build orchestrators | $35 | $36 | $10 | one per story, Sonnet |
| review agents | $32 (all Opus) | $54 (Opus $49) | $21 (all Opus) | 4 / 9 / 2 agents |
| refine agents | $22 | $32 | $9 | Opus by design |
| gate + attribution | $6 | $2 | $1 | |

## Findings, ranked by size

### 1. The hard tier is the default in practice (40–50 % of the bill)

- `Review: → story-review-hard` is set in 59–62 % of all story files in all three projects
  (80 of 135, 53 of 85, 44 of 73). `→ deliverable-hard` on 17 % / 43 % / 12 % of all
  deliverables.
- Direct comparison in the same repository, same sprint shape, both sprints all PASS: S23 ran
  four reviews on the default tier for $3; S24 ran four on Opus for $32.
- The refine rule "only for real risk, with a one-sentence justification" does not bind. The
  refine agent is itself Opus and always finds the sentence.
- Side finding: the Opus agents show almost no thinking tokens in the transcripts (0–7 % of
  output) although `deliverable-hard` and `story-review-hard` carry `effort: high`. The tier
  buys the model, not the "thinks longer" the prose promises. Worth verifying against a newer
  Claude Code build.

### 2. Runaway deliverable agents (40 % of deliverable spend)

- Median: 22 tool calls per deliverable agent. 17 of 109 agents exceeded 40 calls and cost
  $130 of $323. The two worst: a Sonnet agent at 162 calls and 407k context ($17) and an Opus
  agent at 91 calls ($33) — each for one deliverable.
- Because the whole context is re-read on every turn, cost grows roughly quadratically with the
  turn count. A fresh agent at 35k context is cheaper than the same agent continuing at 300k.

### 3. The build orchestrator reads what it should delegate

- Per story the `/build` orchestrator held 200–370k tokens of context: 224–280k characters of
  `Read` results (the story file twice at ~30k, `build.md` at 22k, source files), 40–108k
  characters of test-suite output from its own `Bash` calls, and 110–150k tokens of its own
  output (deliverable prompts of 7–18k characters each).
- Four of them in S24 cost $35, 22 % of the sprint. Everything they pull in during D2 is paid
  for again in every review cycle.

### 4. Story files are 24–38k bytes and are read 7–10 times per sprint

- Read by deliverable agents (which already hold their D text in the prompt), reviewers, the
  gate agent and the build orchestrator: 130–160k characters per role per sprint. The Done
  section makes the file grow while the sprint runs.

### 5. Fixed start-up cost per agent

- Every subagent starts with ~35k tokens (system prompt, MCP tool definitions for Figma,
  Atlassian, Playwright and Godot, the skills list, a 10.8k-byte `CLAUDE.md`) and then reads
  the same three or four core files: 88 % of all `Read` calls hit files that other agents in
  the same sprint also read; one shared module was read 30 times by 28 agents. With 23–59
  agents per sprint that is $15–20 of pure start-up.

### Process findings

- **Phase 1a blocks unattended runs.** S24 started 17:14, asked its clarification questions at
  17:27 and got the answers at 05:50 the next morning. Open questions belong in planning, not
  in the run.
- **Rule violations still happen and still cost.** A polling loop (`until grep … sleep`) in an
  Opus deliverable agent (S24, forbidden by `build.md`); a failed build agent re-dispatched in
  S17 ($17, 149 calls); nine review agents for four stories in the same sprint.
- **No cost visibility.** This analysis needed a script over the transcripts. Nothing in the
  workflow records how many agents ran on which tier per story.

## What was changed on this date

Implemented in the ai-scrum payload (`templates/workflow/`), listed under `## Unreleased`:

1. **Two-stage review.** The clean-agent review runs on the default tier for every story,
   pinned `model: "sonnet"`. `Review: → story-review-hard` no longer replaces it: it adds a
   second Opus pass after the default review has passed, briefed with the first verdict and
   told to look for what the default tier could not see. Refine marks it only with a sentence
   naming the plausible wrong implementation that would pass the tests and the default review.
2. **Hard-deliverable budget.** At most one `deliverable-hard` per story on refine's own
   authority. A story that seems to need two is cut too big: split it or hand the question to
   the user (in a sprint: `BLOCKED: user question`).
3. **Turn budget for deliverable agents.** About 35 tool calls; past it the agent leaves a
   consistent tree and returns `PARTIAL` with what is done, what is red and the next step. The
   build orchestrator re-dispatches once with a fresh agent; a second `PARTIAL` is a blocker.
4. **Build orchestrator diet.** Verification (step 5) is delegated to a fresh Sonnet agent so
   suite output never enters the orchestrator's context; the story file is read once; the
   deliverable prompt carries the D text, files and test lines and tells the agent not to open
   the story file; the Done section is bounded.
5. **Tier record.** The build agent returns one `tiers:` line (deliverables total / hard,
   review stages, review cycles, agents dispatched); `/sprint` collects them into a
   `## Tier record` table in `review.md` and one line of the final report. That table is the
   number to watch over the next sprints.
6. **Phase 1a says up front** how many open questions block the start, and the command
   recommends resolving them in planning so a sprint can run unattended.

## What to measure next

Compare the next sprints of the same projects against the table above:

- Opus share of subagent spend (target: well under a third).
- Number of deliverable agents above 40 calls (target: none without a `PARTIAL` hand-over).
- Build orchestrator peak context (target: under 150k).
- Share of stories with `story-review-hard` (target: a minority, each with a named risk).

Quality check alongside: did the second-stage Opus review find anything the Sonnet review
missed? If it rarely does over several sprints, the next step is the one already under
discussion — Sonnet implementation with up to three Sonnet review cycles, and the Opus pass
only as a final confirmation on hard stories.

## Method, for repeating the analysis

- Sessions that ran the command: grep the top-level `.jsonl` files for
  `<command-name>/sprint`.
- Per assistant record: `message.usage` has `input_tokens`, `cache_creation_input_tokens`,
  `cache_read_input_tokens`, `output_tokens`; `message.model` picks the price; de-duplicate by
  `message.id`.
- Subagents: `<session>/subagents/**/agent-*.jsonl`, same fields. The first user record is the
  prompt the orchestrator wrote; classify the role from it (refine / build / deliverable /
  review / gate).
- Tool results: `tool_result` blocks in user records, joined to the `tool_use` id in the
  preceding assistant record, give per-tool result sizes and the files each agent read.
