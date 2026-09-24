# Why a running sprint looks dead — analysis of session 3a6b4ad7 and six siblings

*Draft, 2026-09-24. Not shipped by any plugin. Times are local (Europe/Vienna, UTC+2).*

## 1. Summary

The complaint: "for me everything was done, but it kept running, I had zero feedback, and it
took ~10 minutes until I knew whether it was doing anything." That is exactly what the
transcript shows, and it has three separate causes that stack:

1. **A foreground `Agent` call is a blackout.** The orchestrator cannot say anything while it
   waits, and story builds take 12–200 minutes. `/sprint` mandates this shape (for a good
   reason, see §4) and never tells the user where to look.
2. **The regression gate cannot run inside a subagent when a suite takes longer than 10
   minutes.** `Bash` is cut off at 600 s and moves the command to the background; a subagent
   never hears from that task again and is forced to hand back after a minute. The orphaned
   process then poisoned every later run (Electron single-instance lock). One structural
   mismatch cost 49 minutes of gate time — as much as all four story builds together.
3. **The final report did not end the run.** Three seconds after "Sprint S22 abgeschlossen" a
   stale task notification arrived and the orchestrator started four more suite launches. The
   13.8 silent minutes (11:32–11:46) are that. The session was still launching runs at 11:51.

The pattern is systemic, not a one-off: 55 of 161 sessions since 1 September had a tool call in
flight for more than 5 minutes; in at least six the user asked whether it hangs.

## 2. The target session, end to end

`/sprint 22` on q2-launcher, ai-scrum 4.1.0, orchestrator on Sonnet 5 (command frontmatter),
output style Briefing, VS Code extension.

| Phase | Wall-clock | What the user saw |
| --- | --- | --- |
| 1a clarification | 09:12–09:13 | one AskUserQuestion, answered in 29 s |
| 1b refine (4 stories) | 09:14–09:34 (20 min) | four Agents run **one after another** (7/4/5/4 min) although the command says parallel in one message; ~13 min lost |
| 2 build (4 stories) | 09:34–10:43 (69 min) | four foreground Agents of 12/16/18/20 min; between them exactly one line each ("Now building story 107."); `progress.md` mentioned 0 times |
| 2b gate + 3 review | 10:43–11:32 (49 min) | see below |
| after "done" | 11:32–11:51+ (20+ min) | 13.8 min silence, then four more launches; still running |

### The gate, launch by launch

| # | Local | Who | Outcome |
| --- | --- | --- | --- |
| 1 | 10:44 | gate subagent, `timeout 590000` | cut off at 590 s → background; subagent tried Monitor, `sleep 60` (blocked), `echo waiting`, `true`, `:` for a minute → `[handback-send-enforce]` → INCONCLUSIVE at 10:56; **process kept running, orphaned** |
| 2 | 10:56 | orchestrator, foreground Bash 600 s | cut off at 11:06 → background; orchestrator then called `ScheduleWakeup(3600)` ("no pending wakeup to cancel"), ended turn "I'll finish once it completes"; finished 11:11 with 25/55 failed "another instance is already running" (collision with #1) |
| 3 | 11:12 | orchestrator, background | collided again |
| 4 | 11:15 | after killing 4 orphaned electron.exe | 14/55 pass, 41 fail |
| 5 | 11:20 | rerun of the 41, `> file` inside the command | exit 1 at 11:31, **empty log** |
| — | 11:25 | attribution Agent (4 min) | verdict: pre-existing harness defect in `scripts/lib/harness.mjs` (`withApp()` teardown races `app.close()` without `child.kill()`), introduced before the sprint |
| — | 11:29–11:31 | orchestrator | gate recorded, review.md, roadmap, `status: done`, committed |
| — | **11:31:55** | orchestrator | **final report: "Sprint S22 abgeschlossen … Kein Merge-Blocker … Merge ist deine Entscheidung"** |
| 6 | 11:32 | notification for #5 arrives 3 s later → rerun of 41 with `tee` | finished 11:45; 27 flaky, 14 red. **13.8 min without any text.** |
| 7 | 11:46 | baseline worktree at merge-base | failed instantly, no build output |
| 8 | 11:47 | baseline after `npm run build` | 0/14 pass on baseline → all pre-existing (the attribution agent had said so at 11:25) |
| 9 | 11:51 | "one clean, isolated full run … will report when done" | still running at analysis time |

User messages during the gate: 11:09 "ist das fertig oder hängt das?", 11:13 "das läuft schon
wieder sehr lange gefühlt ohne das ich feedback habe", 11:26 "status?", 11:27 "das finde ich
weird …". Each answer was a process-list check plus "es läuft, hängt nicht" — true, but
without elapsed time, expected time, or a file to watch, so the next poke came four minutes
later.

The root trigger of the red gate was a real, pre-existing defect in the project's own e2e
harness (no kill fallback → orphan → single-instance lock). It is already a roadmap follow-up
from the sprint review. Everything after launch #4 was triage the command does not ask for.

## 3. Cross-session evidence

Heuristic scan of all 161 sessions since 2026-09-01, then six transcripts read in full by
agents (their adversarial verification pass did not run — session limit, see §7).

| Session | Task | Longest blackout | Mechanism | User reaction |
| --- | --- | --- | --- | --- |
| q2-launcher 810fd393, 09-11 | /sprint 19 | 83 min (Build 090) | foreground Agent; progress.md gaps 19/15/41 min after the last deliverable | none (AskUserQuestion had already waited 251 min unnoticed — no Notification hook) |
| Scotty 2653ff05, 09-24 | /sprint 14 | 75 min (Build 066) | foreground Agent; **Esc did not stop the subagent**: it kept editing for 24 min, orchestrator said "nichts hängt mehr" (false), launched a second build agent on the same tree, declared the sprint complete three times | "hängt was?" after 13.7 min of post-Esc dead air |
| q2-launcher e55b21a0, 09-07 | /sprint 14 | 50 min (Build 063) | foreground Agent; user's question queued 24 s, Esc tore down a 3-level agent tree, D5 redone | "kann es sein das ein agent hängt?" |
| second-brain 8100a947, 09-07 | /sprint 15 (3.0.0) | 154 min (Build 073) | foreground Agents 40–154 min; build agents ended turns with "waiting for D7" (background Bash inside a subagent dies with its turn); orchestrator's own `until … sleep 3` loop pointed at a wrong path and ran orphaned for 2 h 40; a 429 session limit killed an 85-min agent, only a banner shown | "continue" after 23 min |
| GC-APP 07fcd44c, 09-03 | /sprint 02 (pre-plugin) | 44 min deadlock | omitted `run_in_background` → async children; "Warte auf D2" turn-end; nothing running for 44 min | "stop" |
| Scotty e8c4c450, 09-24 | ad-hoc UI review | 2 min | end_turn told the user to "start a new session" after authorizing Figma (wrong: tools register on the next prompt); harness silent-turn reminders (9) cancelled by output style "Concise" reminders (88) | "machst du noch was?" |

What repeats:

- **Every story build is a total blackout** in the main session; the only channel, `progress.md`,
  stops moving after the last deliverable because verification and review are not trailed
  (gaps of 15–55 minutes in four sessions).
- **Nobody is told where to look.** The sprints README says "watch `progress.md`"; no
  orchestrator in any session named the file before the first silence.
- **Post-completion work recurs whenever something is still pending at report time** (this
  session: a stale background task; Scotty: a pending Agent). Sessions with nothing pending
  ended cleanly (q2-launcher S19: 1 min 54 s from last build to final report).
- **No session had any hook, statusline, or notification channel configured.**
- **Two Claude Code behaviours contradict the command text.** Background Bash notifications
  *do* reach the top-level session (8 of 8 here, 6 of 6 in GC-APP) — the rule "never end a
  turn with waiting / there is no working watchdog" treats them as lost. Conversely, inside a
  subagent nothing can be awaited: `sleep` is blocked, Monitor dies with the turn, idling
  triggers a forced handback.

## 4. Root causes, ranked

1. **Shape of delegation.** ai-scrum 2.1.0 fixed silent *deadlocks* (async children, 1765 min
   dead time over five sprints) by forcing every Agent into the foreground. That trade bought
   reliability with total invisibility, and the command never compensated on the user side.
2. **Gate design ignores the 10-minute Bash ceiling.** "ONE fresh Agent runs build, test, e2e,
   e2e-all" cannot work when `e2e-all` takes 15 minutes. Discovered by timing out, twice.
3. **No definition of "done".** Nothing says: before the final report, nothing of yours is
   still running; after it, a late notification gets one line. And nothing caps how often a
   suite may be relaunched (9 here).
4. **Status answers without numbers.** "It is running" is what a hung process also does.
5. **Harness defects outside the plugin** (report upstream, mitigate in text): Esc on a
   foreground Agent detaches instead of stopping it and `ListAgents` does not list it; the
   background-Bash reply text differs by agent depth; a 429 mid-agent produces only a banner.

## 5. Proposals

Ordered by (silence removed per the facts) × (certainty the mechanism works) ÷ size. "Advisory"
means command text a Sonnet orchestrator may still skip; "enforced" means it fires regardless.
The two proposal sets these come from were not adversarially verified by agents (§7); I
checked each against the mechanics observed in the transcripts myself.

### A. ai-scrum command text (payload in `templates/workflow/commands/`)

**A1. Status line before and after every step longer than ~3 minutes** — `sprint.md`, new
section after `## Core principle`, referenced from phases 1b, 2, 2b, 3. Advisory. One line
before: what runs, n/N, clock (from the shell, in the same Bash call that appends the trail
line), how long the last one of its kind took, the file to watch, and the escape ("Esc, then
`/sprint 22` resumes at the first open spot"). One line after: result, elapsed, commit.
"Now building story 107." does not qualify. Also: the first line of the sprint names the phases
and the progress file. Fixes the 0 mentions of `progress.md` and gives the user a number to
compare against. Does not fix the silence itself. *Certainty: high (a text block sent with a
tool_use renders immediately — observed).*

**A2. Split the regression gate by duration** — `sprint.md` Phase 2b step 1 → 1a/1b.
1a: short suites (`build`, `test`, `e2e`) in ONE fresh Agent as today, each Bash call with
`timeout: 600000` spelled out, and the ceiling rule (A6) quoted to it. 1b: the long suite
(`e2e-all`, or anything the agent returned as "exceeded") runs **from the orchestrator**, ONE
Bash call with `run_in_background: true`, output through `tee` into
`<sprints>/SNN/gate-e2e-all.log` (never a bare `>` — launch #5 produced an empty log), preceded
by a leftover-process check when the suite drives a single-instance app, and by the A1 status
line naming the log path. Then end the turn with exactly that one task in flight. Read only
`tail -n 40` when the notification arrives; the attribution agent gets the log path. Fixes
launches #1–#3 and #5 (≈35 min). *Certainty: high for the notification (8/8 observed); note in
the changelog that this codifies observed, not documented, behaviour.*

**A3. Launch budget for the gate; the attribution verdict is final** — `sprint.md` Phase 2b,
new paragraph after the resume note plus one sentence in steps 3 and 4. Full suite at most
twice (step 1 and the fix agent's confirmation), failing subset at most twice (HEAD, merge-base,
both by the attribution agent), one relaunch for an environment loss (empty log, "already
running", crash before the first test) after cleanup. A collision is not a test result. Once
the attribution agent has returned, no baseline run, no "one clean run to be sure": go to
step 5; unattributed failures are recorded as `unattributed — budget exhausted` and count as a
merge blocker. Fixes launches #6–#9. *Certainty: high; pure text.*

**A4. Closing the run** — `sprint.md`, new section between Phase 3 and `## Final report`, plus
two sentences in the report. Before the report: every Agent call has returned (an
`[Request interrupted by user]` result is a detached agent, not a stopped one — Scotty), every
background task has returned or been `TaskStop`ped, gate logs removed before the final commit,
the report states "background tasks: none". After the report the sprint is over: a late
notification or agent result gets **one line** (`Late result of launch 5: exit 1, empty log —
superseded by the recorded verdict, no action`) plus `TaskStop` if alive, and no other tool
call. Single exception: a late result that contradicts the recorded gate verdict → one line and
an `AskUserQuestion` whether to reopen. Fixes the 20+ minutes after "done" here and the
triple "complete" in Scotty. *Certainty: high.*

**A5. Rewrite the two rules the session disproved** — `sprint.md` `## Rules`.
"Never end a turn with waiting" → "Never end a turn waiting for an *agent*. Every Agent call is
foreground. The one exception is the background Bash task of phase 2b 1b, started by you at the
top level: its exit notification does reach this session (never a subagent). End that turn only
after the status line, with exactly that task in flight and nothing else pending."
"There is no working watchdog" → "There is no watchdog you can build: `ScheduleWakeup` belongs
to `/loop`; outside it it schedules nothing and answers 'no pending wakeup to cancel' — a sprint
that calls it has armed nothing. `sleep` is blocked, Monitor dies with a subagent's turn, dummy
agents wake you with the wrong result." Fixes the 11:06 ScheduleWakeup misuse and the gate
agent's minute of `echo waiting`. *Certainty: high.*

**A6. build.md sixth delegation rule: the 10-minute ceiling** — `build.md` `## Delegation
rules`, quoted verbatim into the gate agent's prompt. "A Bash call is cut off at 600 000 ms and
moved to a background task you will never hear from again: no notification, `sleep` refused,
idling forces a handback while the process keeps running and holds the app's locks against the
next run. So: never start a command that may need longer than 10 minutes (`e2e-all` is the
sprint's, not yours); spell `timeout: 600000` on every verify call; if a command is moved to
the background anyway, `TaskStop` it **immediately** with the id from the message and return
`INCONCLUSIVE: <command> exceeded the 10-minute call limit — stopped, not observed`." Fixes
launch #1's orphan. *Certainty: high for the rule; medium for `TaskStop` killing the whole
Electron process tree on Windows (four orphans had to be killed by hand) — hence A8.*

**A7. Progress trail covers verification, review, and story end** — `build.md` Progress-trail
bullet plus one sentence in steps 5 and 6. Events `<id> · verify · started/done|blocked`,
`<id> · review <n> · started/done`, `<id> · story · done` right before returning. Closes the
15–55 minute trail gaps after the last deliverable seen in four sessions, so "the suite is
running" and "the agent died after D4" look different in the file. *Certainty: high; the same
never-typed-timestamp rule applies.*

**A8. Optional profile keys: durations and cleanup** — `templates/project-profile.md` new
`## Durations` (`build`, `test`, `e2e`, `e2e-all`, `story`, all `unknown` by default) and
`e2e-cleanup: none` (e.g. `taskkill /F /IM electron.exe`; comment: kills the developer's own
instance too). `/sprint` prints measured minutes in the final report and says when the profile
should be updated. Feeds the ETA in A1 and the split decision in A2 ("≥ 8 min → orchestrator").
`/ai-scrum:setup` offers the section, never fills numbers. *Certainty: medium — value only
after one measured sprint; six more keys to explain. Ship after A1–A7.*

**A9. Status question → four facts, no new launch** — `sprint.md`, paragraph in the A1
section. Answer in ≤ 5 lines: current step and its start time · elapsed of expected; last
trail/log line with timestamp (`tail -n 1`); background tasks alive or `none`; what is awaited
and when; the escape. "It is running, not hung" is not an answer. A status question never
triggers a relaunch. *Certainty: high.*

**A10. Small rules from the sibling sessions** — `sprint.md` `## Rules`:
- Refine: "The announcement counts N stories; exactly N Agent calls follow in this same
  message" (S22 ran them sequentially, 20 min instead of ~7).
- A build agent return that is neither `done` nor `BLOCKED` ("waiting for D2", an API error,
  empty) is a failed agent: check `git status` and `progress.md`, re-dispatch once, never
  `SendMessage` it and never end the turn (GC-APP, second-brain).
- 429 / rate limit inside an agent: print the reset time and the resume instruction, commit
  nothing, stop (second-brain; also what killed today's verification agents).
- After an interrupt, derive state from `git status`, `progress.md` and `sprint.md`, never from
  memory; say explicitly whether an agent may still be running (Scotty said "nichts hängt
  mehr" while one was editing).
- When an MCP connector needs authorisation: "authorise it, then send any message in this
  session" — never "start a new session" (Scotty e8c4).

**A11. sprints README** — `templates/sprints-readme.md`: document the gate log, the status
lines, and that a status question is answered with a trail line and elapsed time. Only lands
after `/ai-scrum:setup` re-runs in a project.

### B. Claude Code configuration — proposed by the plugin, installed by the user

**B1. Liveness hooks (enforced visibility)** — new one-time scaffold
`plugins/ai-scrum/templates/hooks/liveness-hooks.json` (user-owned, no marker) plus one bullet
in `setup.md`'s report offering it for `~/.claude/settings.json`. `SubagentStart` /
`SubagentStop` / `TaskCreated` / `TaskCompleted` hooks whose command echoes
`{"systemMessage":"▶ 11:47 agent started · Build story 107"}`. Fires for every agent in the
tree, including the deliverable agents inside a build — the only thing here that shows life
*during* a foreground call without relying on the orchestrator. Would have shown the orphaned
`ui:flows` task and its 11:31:58 completion. *Certainty: medium — the stdin JSON of these
events and whether `systemMessage` renders in the VS Code extension are not documented; ship
with a probe variant that logs stdin to a file first, and a script that always exits 0.*
Compatible with CLAUDE.md: the plugin proposes, never writes `settings.json`.

**B2. Attention hooks** — same file: `Notification` with matcher `idle_prompt|permission_prompt`
and `Stop` → `powershell -NoProfile -c "[console]::beep(880,150)"` or a toast. Fixes the
251-minute unanswered AskUserQuestion (S19), the 44-minute deadlock (GC-APP), and every
"I'll report when done" turn-end. *Certainty: medium-high (Notification/Stop are documented
events; beep is trivial).*

**B3. Status line** — a `statusLine` command printing the last `progress.md` line and its age.
*Terminal only; the VS Code extension does not render it. Low priority for this user.*

### C. Report upstream (Claude Code), mitigate in text meanwhile

- Esc on a foreground Agent detaches the subagent instead of stopping it; the interrupt result
  does not say so; `ListAgents` does not list it; its late handback is absorbed mid-turn while
  another foreground call is running (Scotty 2653).
- The reply to a background Bash call warns "terminated when you give your final response" at
  depth 2 but not at depth 1 (second-brain).
- A 429 inside a foreground Agent surfaces only as a banner in the parent.
- Notifications of a subagent's background tasks are enqueued into the top-level queue and
  silently removed while a foreground Agent is in flight (seen in three sessions).

## 6. What would change in the next sprint if A1–A7, A9 and B2 ship

- Every long step is preceded by a line with clock, estimate, and file — the user knows
  *before* the silence where to look.
- The gate ends at the attribution verdict: ≤ 3 launches without a fix, ≤ 5 with one; no
  worktree, no "clean run to be sure".
- No subagent ever holds a > 10-minute command; no orphaned process poisons a rerun.
- The final report is the last thing that happens; a late notification costs one line.
- `progress.md` moves during verification and review, not only between deliverables.
- A beep on every turn end and every prompt.

Verification is mechanical: count status lines vs Agent calls, count `e2e-all` launches, check
that no assistant text follows the final report except one-liners, `grep verify progress.md`.

## 7. Caveats

- The six session deep-reads and the two proposal sets were produced by agents; the planned
  adversarial verification pass (6 + 6 agents and the synthesiser) failed with "You've hit your
  session limit · resets 1:20pm". I cross-checked the target-session claims against my own
  timeline and the proposals against the observed mechanics; the sibling-session details
  (Scotty Esc-detach, second-brain orphaned loop) rest on one reader each.
- Hook stdin schemas and VS Code rendering of `systemMessage` are unverified (B1).
- The task-notification path for top-level background Bash is observed behaviour (14 of 14
  across two sessions), not documented; A2/A5 should say so in the changelog bullet.
- **Applied on 2026-09-24 (same day, uncommitted):** A1–A7, A9, A10 (all but the MCP line)
  and A11 in `sprint.md`, `build.md`, `sprints-readme.md`, `project-profile.md`
  (`e2e-cleanup`), `setup.md` and the plugin README, with CHANGELOG bullets under
  `## Unreleased`; A8 reduced to measured minutes in the gate record and final report plus the
  optional `e2e-cleanup` key. Added on request: phase 0 commits `SNN: sprint started` on
  `branch-base` before cutting the sprint branch. B1/B2 (hooks) and C (upstream) not done.
  `scripts/validate.ps1`: 158 checks passed.
