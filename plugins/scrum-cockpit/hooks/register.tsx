import { atom, read, update } from 'claude-code'
import type { ElementConstructor, EngineInterface, Register, SvgProps, Timer } from 'claude-code'

import type { AgentRow, Branching, Snapshot, Story, StoryStage } from '../types'
import {
  activeSprint,
  clockOf,
  currentMilestone,
  isRunning,
  knownStoryIds,
  launchLabel,
  refineProgress,
  scan,
  storyCommand,
  storyIdIn,
  unplannedMilestones,
  unplannedStories,
  updateHints,
  waitingItems,
  withProfileValue,
} from './scan'
import type { Reader } from './scan'

const PANE = 'scrum-cockpit'
const SETTINGS = 'scrum-settings'
const MAIN = 'main'

// Change a tag when the stored shape changes: an older value then reads as
// the initial one instead of breaking the drawing after a reload.
const snapshot = atom({ plugin: 'scrum-cockpit', key: 'snapshot' } as const, null, {
  shape: 'snapshot-4',
})
const agents = atom({ plugin: 'scrum-cockpit', key: 'agents' } as const, [], {
  shape: 'agents-2',
})
const isBandHidden = atom({ plugin: 'scrum-cockpit', key: 'isBandHidden' } as const, false)
const openStory = atom({ plugin: 'scrum-cockpit', key: 'openStory' } as const, null)

const WATCHED = /docs[\\/]|ROADMAP|sprint|requirement|\.claude[\\/](ai-scrum|tech-rules|commands)/i

// An agent with no tool call for this long is marked quiet; a trail silent
// for SILENT_MS is the sprint command's own "say it" threshold.
const QUIET_MS = 3 * 60_000
const SILENT_MS = 15 * 60_000
// Refine runs every story at once: this many rows, then a count.
const REFINE_ROWS = 8
// A story in build has its builder and one deliverable or review agent.
const FOCUS_AGENTS = 3
// What a refine round is expected to take, the scale of a row's bar.
const REFINE_SCALE_MS = 15 * 60_000

const PHASES = ['clarify', 'refine', 'build', 'gate', 'review'] as const
const PHASE_LABEL: Record<string, string> = {
  planned: 'Planned',
  clarify: 'Clarify',
  refine: 'Refine',
  build: 'Build',
  gate: 'Gate',
  review: 'Review',
  done: 'Done',
}
const STAGE_LABEL: Record<StoryStage, string> = {
  implement: 'Implement',
  verify: 'Verify',
  review: 'Review',
  done: 'Done',
  blocked: 'Blocked',
}
const STAGE_RANK: Record<StoryStage, number> = { implement: 0, verify: 1, review: 2, done: 3, blocked: 0 }

const str = (value: unknown) => (typeof value === 'string' ? value : null)

const cut = (text: string, width: number) =>
  width < 4 || text.length <= width ? text : `${text.slice(0, width - 1)}…`

const shortPath = (path: string) => path.replace(/\\/g, '/').split('/').slice(-2).join('/')

const minutes = (from: number, to: number) => {
  const s = Math.max(0, Math.round((to - from) / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`
}

// A bar in eighth blocks: the filled part and the rest, drawn in two colors.
function meter(value: number, total: number, width: number): [string, string] {
  if (total <= 0 || width <= 0) return ['', '░'.repeat(Math.max(0, width))]
  const eighths = Math.round((Math.min(value, total) / total) * width * 8)
  const filled = '█'.repeat(Math.floor(eighths / 8)) + (eighths % 8 === 0 ? '' : (' ▏▎▍▌▋▊▉'[eighths % 8] ?? ''))
  return [filled, '░'.repeat(Math.max(0, width - filled.length))]
}

// The progress ring a graphical surface draws beside the heading.
function ring(share: number, label: string): string {
  const r = 23
  const c = 2 * Math.PI * r
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="58" height="58" viewBox="0 0 58 58">` +
    `<circle cx="29" cy="29" r="${r}" fill="none" stroke="#8a8a8a" stroke-opacity="0.3" stroke-width="6"/>` +
    `<circle cx="29" cy="29" r="${r}" fill="none" stroke="#d97757" stroke-width="6" stroke-linecap="round"` +
    ` stroke-dasharray="${(c * share).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 29 29)"/>` +
    `<text x="29" y="33" text-anchor="middle" font-size="12" font-weight="600" fill="#d97757"` +
    ` font-family="system-ui, sans-serif">${label}</text></svg>`
  )
}

const setting = (a: AgentRow) => [a.model, a.effort].filter(x => x !== null).join('/')

const isQuiet = (a: AgentRow, now: number) => a.status === 'running' && now - a.activeAt > QUIET_MS

// Each agent followed by the agents it spawned: the order of a tree.
function asTree(list: AgentRow[]): { row: AgentRow; depth: number }[] {
  const ids = new Set(list.map(a => a.agentId))
  const out: { row: AgentRow; depth: number }[] = []
  const walk = (a: AgentRow, depth: number) => {
    out.push({ row: a, depth })
    for (const child of list.filter(c => c.parentId !== null && c.parentId === a.agentId)) walk(child, depth + 1)
  }
  for (const root of list.filter(a => a.parentId === null || !ids.has(a.parentId))) walk(root, 0)
  return out
}

// One line for what a tool call is doing: the tool and its target.
function activityOf(tool: string, input: Record<string, unknown>): string {
  const path = str(input['file_path']) ?? str(input['notebook_path'])
  const target =
    (path === null ? null : shortPath(path)) ??
    str(input['command']) ??
    str(input['pattern']) ??
    str(input['description']) ??
    str(input['url']) ??
    ''
  return `${tool} ${target.replace(/\s+/g, ' ')}`.trim().slice(0, 120)
}

async function readerFor($: EngineInterface): Promise<Reader> {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  const configDir =
    (await $.env.get('CLAUDE_CONFIG_DIR')) ?? (home === undefined ? null : `${home}/.claude`)
  return {
    configDir,
    read: async path => {
      try {
        const text = await $.fs.read(path)
        return typeof text === 'string' ? text : null
      } catch {
        return null
      }
    },
    list: async path => {
      try {
        return (await $.fs.list(path)).map(f => ({ name: f.name, isDir: f.kind === 'dir', mtimeMs: f.mtimeMs }))
      } catch {
        return []
      }
    },
  }
}

let isScanning = false
let isAgain = false
let pending: Timer | null = null
const stepSeen = new Map<string, string>()

async function refresh($: EngineInterface) {
  if (isScanning) {
    isAgain = true
    return
  }
  isScanning = true
  try {
    const root = await $.session.root()
    const snap = await scan(await readerFor($), root, await $.clock.now())
    await update($, snapshot, () => snap)
  } finally {
    isScanning = false
    if (isAgain) {
      isAgain = false
      void refresh($)
    }
  }
}

function schedule($: EngineInterface, ms = 800) {
  pending?.cancel()
  pending = $.clock.after(ms, () => {
    pending = null
    void refresh($)
  })
}

// Adds the row when it is new, else applies `patch` to it.
async function upsert(
  $: EngineInterface,
  key: string,
  make: () => Promise<AgentRow>,
  patch: (row: AgentRow) => AgentRow,
) {
  const list = await read($, agents)
  if (!list.some(a => a.key === key)) {
    const row = await make()
    await update($, agents, l => (l.some(a => a.key === key) ? l : [...l, row].slice(-40)))
  }
  await update($, agents, l => l.map(a => (a.key === key ? patch(a) : a)))
}

// The story an agent works on: its parent's, else the first known story id
// its description names, else the first its prompt names.
async function storyOf($: EngineInterface, parentId: string | null, description: string, prompt: string) {
  const list = await read($, agents)
  const parent = parentId === null ? undefined : list.find(a => a.agentId === parentId)
  const ids = knownStoryIds(await read($, snapshot))
  return parent?.storyId ?? storyIdIn(description, ids) ?? storyIdIn(prompt.slice(0, 4000), ids)
}

async function newRow($: EngineInterface, key: string): Promise<AgentRow> {
  const now = await $.clock.now()
  const info = key === MAIN ? undefined : (await $.agent.list()).find(a => a.id === key)
  const parentId = info?.parentId ?? null
  return {
    key,
    agentId: key === MAIN ? null : key,
    parentId,
    storyId: key === MAIN ? null : await storyOf($, parentId, info?.description ?? '', ''),
    type: key === MAIN ? 'main session' : (info?.type ?? 'agent'),
    description: info?.description ?? '',
    model: null,
    effort: null,
    status: 'running',
    activity: '',
    tools: 0,
    startedAt: now,
    endedAt: null,
    activeAt: now,
  }
}

async function finish($: EngineInterface, key: string, hasFailed: boolean) {
  const now = await $.clock.now()
  await update($, agents, l =>
    l.map(a =>
      a.key === key && a.status === 'running'
        ? { ...a, status: hasFailed ? 'failed' : 'done', endedAt: now }
        : a,
    ),
  )
}

// The engine's own list says when a subagent ended, should a turn.complete
// never have reached this module (a reload in between).
async function reconcile($: EngineInterface) {
  const list = await read($, agents)
  const open = list.filter(a => a.status === 'running' && a.agentId !== null)
  if (open.length === 0) return
  const known = await $.agent.list()
  const now = await $.clock.now()
  await update($, agents, l =>
    l.map(a => {
      const info = known.find(k => k.id === a.agentId)
      if (a.status !== 'running' || a.agentId === null) return a
      if (info === undefined || ['completed', 'failed', 'killed', 'idle'].includes(info.status)) {
        return { ...a, status: info?.status === 'failed' || info?.status === 'killed' ? 'failed' : 'done', endedAt: now }
      }
      return a
    }),
  )
}

// Runs `/name args` as if typed: queued until the session is idle. The
// command's own frontmatter picks the model and effort.
function launch($: EngineInterface, line: string) {
  const [name = '', ...args] = line.replace(/^\//, '').split(' ')
  $.command.run({ command: name, args: args.join(' ') }).catch(() => $.ui.toast(`Could not run ${line}`))
  $.ui.toast(`Queued ${line}`)
}

function openPane($: EngineInterface) {
  void $.ui.open({ id: PANE, title: 'Scrum' })
  void refresh($)
}

function openSettings($: EngineInterface) {
  void $.ui.open({ id: SETTINGS, title: 'Scrum settings' })
  void refresh($)
}

// The one write the cockpit makes: a `## Branching` value of the profile, on
// its own line, every other byte of the file kept.
async function saveSetting($: EngineInterface, key: string, value: string, after: string) {
  const snap = await read($, snapshot)
  const clean = value.trim()
  if (snap === null || clean === '' || /[\r\n<]/.test(clean)) return
  if (snap.sprints.some(s => s.status === 'in-progress')) {
    $.ui.toast('A sprint is running: change the branching after it')
    return
  }
  const path = `${snap.root}/.claude/ai-scrum.md`
  try {
    const text = await $.fs.read(path)
    if (typeof text !== 'string') return
    const changed = withProfileValue(text, key, clean, after)
    if (changed !== text) await $.fs.write(path, changed)
    $.ui.toast(`${key}: ${clean}`)
  } catch {
    $.ui.toast(`Could not write ${key} to .claude/ai-scrum.md`)
  }
  await refresh($)
}

// Where a sprint commits, in one line: `dev → sprint/{id}` or `dev · commits directly`.
const branchingLine = (b: Branching) =>
  b.isSprintBranch ? `⎇ ${b.base} → ${b.pattern}` : `⎇ ${b.base} · commits directly`

// The short form of where the focus story stands: `D4/5`, `review 1`, `verify`.
function stageShort(stage: StoryStage | null, step: string | null, story: Story | undefined): string {
  if (stage === null) return ''
  if (stage === 'implement') {
    const n = /^D(\d+)/.exec(step ?? '')?.[1]
    if (n === undefined) return 'build'
    const total = story?.deliverablesTotal ?? 0
    return total > 0 ? `D${n}/${total}` : `D${n}`
  }
  if (stage === 'review') return step ?? 'review'
  return stage
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'scrum',
      description: 'Open the scrum cockpit: milestones, sprints, stories and running agents',
    })
    void refresh($)
    // While a sprint runs, agents write progress.md through the shell, which no
    // Write or Edit call shows; a slow poll keeps the trail line current.
    $.clock.every(15_000, () => {
      void (async () => {
        const snap = await read($, snapshot)
        const list = await read($, agents)
        const isBusy =
          list.some(a => a.status === 'running') ||
          (snap !== null && snap.sprints.some(s => s.status === 'in-progress'))
        if (isBusy) {
          await reconcile($)
          await refresh($)
          $.ui.invalidate('ui.render')
        }
      })()
    })

    return next(e)
  })

  on('command.run', { command: 'scrum' }, async ($, e) => {
    if (/^\s*settings\b/i.test(e.args)) {
      openSettings($)

      return { text: 'Scrum settings opened.' }
    }
    openPane($)

    return { text: 'Scrum cockpit opened.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const now = await $.clock.now()
    const temp = `spawn:${e.tool_use_id}:${e.workflow?.agentIndex ?? ''}`
    const parentId = e.parentAgentId ?? null
    const row: AgentRow = {
      key: temp,
      agentId: null,
      parentId,
      storyId: await storyOf($, parentId, e.description, e.prompt),
      type: e.subagentType,
      description: e.description,
      model: e.model ?? null,
      effort: null,
      status: 'running',
      activity: 'starting',
      tools: 0,
      startedAt: now,
      endedAt: null,
      activeAt: now,
    }
    await update($, agents, l => [...l.filter(a => a.key !== temp), row].slice(-40))
    const spawned = await next(e)
    const agentId = spawned.agentId ?? null
    await update($, agents, l => {
      // A tool call of the new agent may have raced ahead and made its own row.
      const rest = agentId === null ? l : l.filter(a => a.key !== agentId)
      return rest.map((a): AgentRow =>
        a.key === temp
          ? { ...a, key: agentId ?? temp, agentId, model: spawned.model ?? a.model, status: agentId === null ? 'failed' : a.status }
          : a,
      )
    })

    return spawned
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await upsert($, MAIN, () => newRow($, MAIN), a => ({ ...a, status: 'running', activity: 'thinking' }))
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    const key = e.agentId ?? MAIN
    const seen = `${e.model}|${e.effort ?? ''}`
    if (stepSeen.get(key) !== seen) {
      stepSeen.set(key, seen)
      try {
        await upsert($, key, () => newRow($, key), a => ({
          ...a,
          model: e.model,
          effort: e.effort === undefined ? null : String(e.effort),
        }))
      } catch {
        // Bookkeeping only: the request goes out regardless.
      }
    }

    return yield* next(e)
  })

  on('tool.call', async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    const tool = String(e.tool)
    const key = e.agentId ?? MAIN
    const now = await $.clock.now()
    await upsert($, key, () => newRow($, key), a => ({
      ...a,
      status: 'running',
      activity: activityOf(tool, input),
      tools: a.tools + 1,
      activeAt: now,
    }))
    const ran = await next(e)
    const path = str(input['file_path']) ?? ''
    const command = str(input['command']) ?? ''
    if (WATCHED.test(path) || /git mv|progress\.md|ROADMAP|sprints|requirements|\.lock/i.test(command)) {
      schedule($)
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) {
      await update($, agents, l =>
        l.map(a => (a.key === MAIN ? { ...a, status: 'done', activity: '' } : a)),
      )
      schedule($)
    } else {
      await finish($, e.agentId, e.isAborted || e.reason !== 'answer')
    }

    return done
  }).catch(($, e, next) => next(e))

  // --- The band above the prompt ---

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const snap = await read($, snapshot)
    if (e.props.hasSurvey || snap === null || (await read($, isBandHidden))) {
      return next(e)
    }
    const hints = updateHints(snap)
    if (!snap.hasScrum && hints.length === 0) {
      return next(e)
    }
    const { Box, Button, Text } = $.ui.resolve(e)
    const width = e.props.bodyColumns
    const now = await $.clock.now()
    const list = await read($, agents)
    const running = list.filter(a => a.status === 'running' && a.key !== MAIN)
    const milestone = currentMilestone(snap)
    const sprint = activeSprint(snap)
    const parts: string[] = []
    if (milestone !== null) {
      const isActive = isRunning(milestone.status) || sprint?.status === 'in-progress'
      parts.push(`${isActive ? '▶' : '○'} ${milestone.id} ${milestone.name}`)
    }
    if (sprint !== null) {
      const flow = sprint.flow
      const done = sprint.stories.filter(s => s.isDone).length
      if (flow.phase === 'refine') {
        const rp = refineProgress(snap, sprint)
        parts.push(`${sprint.id} Refine ${rp.refined.length}/${rp.ids.length}`)
      } else {
        parts.push(`${sprint.id} ${PHASE_LABEL[flow.phase] ?? flow.phase} ${done}/${sprint.stories.length}`)
      }
      if (flow.phase === 'build' && flow.focus !== null) {
        const story = snap.stories.find(s => s.id === flow.focus)
        parts.push(`${flow.focus} ${stageShort(flow.stage, flow.step, story)}`.trim())
      }
    }
    if (running.length > 0) {
      const oldest = Math.min(...running.map(a => a.startedAt))
      parts.push(`● ${running.length} agent${running.length > 1 ? 's' : ''} · ${minutes(oldest, now)}`)
    }

    return (
      <Box flexDirection="column">
        {hints.map(hint => (
          <Box key={`hint-${hint.plugin}-${hint.command ?? 'plugin'}`}>
            <Text color="warning">⚠ {cut(hint.text, width - 14)} </Text>
            {hint.command !== null && (
              <Button key={`update-${hint.plugin}`} label="Update" onPress={() => launch($, hint.command ?? '')} />
            )}
          </Box>
        ))}
        {snap.hasScrum && (
          <Box>
            <Text color="claude">✻ </Text>
            <Text dimColor>{cut(parts.join(' · ') || 'ai-scrum', Math.max(10, width - 24))} </Text>
            <Button key="open" label="Overview" onPress={() => openPane($)} />
            <Button key="hide" label="Hide" plain onPress={() => update($, isBandHidden, () => true)} />
          </Box>
        )}
      </Box>
    )
  })

  // --- The pane ---

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    // The terminal has no Svg; there the bar alone shows the progress.
    const Svg = 'Svg' in elements ? (elements as { Svg: ElementConstructor<SvgProps> }).Svg : null
    const snap = await read($, snapshot)
    const width = e.props.bodyColumns
    if (snap === null) {
      return (
        <Box flexDirection="column">
          <Text dimColor>Reading the project…</Text>
          <Button key="refresh" label="Refresh" onPress={() => refresh($)} />
        </Box>
      )
    }
    if (!snap.hasScrum) {
      return (
        <Box flexDirection="column">
          <Text>No ai-scrum workflow in {snap.root}.</Text>
          <Button key="setup" label="Set up ai-scrum" onPress={() => launch($, '/ai-scrum:setup')} />
          <Button key="refresh" label="Refresh" onPress={() => refresh($)} />
        </Box>
      )
    }
    const now = await $.clock.now()
    const list = await read($, agents)
    const hints = updateHints(snap)
    const sprint = activeSprint(snap)
    const flow = sprint?.flow ?? null
    const phase = flow?.phase ?? null
    const isLive = sprint !== null && sprint.status === 'in-progress'
    const milestone = currentMilestone(snap)
    const storyById = new Map(snap.stories.map(s => [s.id, s] as const))
    const titleOf = (id: string) => storyById.get(id)?.title ?? sprint?.stories.find(s => s.id === id)?.title ?? ''
    const inner = Math.max(24, width - 4)
    const running = list.filter(a => a.status === 'running' && a.key !== MAIN)
    const main = list.find(a => a.key === MAIN)
    const isIdle = running.length === 0 && main?.status !== 'running'
    const waiting = waitingItems(snap.standing)
    const standing = snap.standing.filter(l => !/^waiting on\b/i.test(l))
    const doneCount = sprint === null ? 0 : sprint.stories.filter(s => s.isDone).length
    const rp = sprint !== null && phase === 'refine' ? refineProgress(snap, sprint) : null
    const progress =
      sprint === null || sprint.stories.length === 0
        ? null
        : rp !== null
          ? { value: rp.refined.length, total: rp.ids.length, unit: 'refined' }
          : { value: doneCount, total: sprint.stories.length, unit: 'stories' }
    // Agents a phase card already shows; the agents card lists the rest.
    const shown = new Set<string>()

    const storyLine = (s: Story) =>
      `${s.id} ${s.title} · ${s.status}` +
      (s.deliverablesTotal > 0 ? ` · D ${s.deliverablesDone}/${s.deliverablesTotal}` : '')

    const agentLine = (a: AgentRow) => {
      const set = setting(a)
      return `${a.description || a.type} · ${a.type}${set === '' ? '' : ` · ${set}`} · ${minutes(a.startedAt, a.endedAt ?? now)}`
    }

    const resumeButton =
      sprint === null ? null : sprint.status === 'planned' ? (
        <Button key="sprint-start" variant="primary" label={`Start · ${launchLabel(snap, 'sprint')}`} onPress={() => launch($, `/sprint ${sprint.id}`)} />
      ) : isLive && isIdle ? (
        <Button key="sprint-resume" variant="primary" label={`Resume · ${launchLabel(snap, 'sprint')}`} onPress={() => launch($, `/sprint ${sprint.id}`)} />
      ) : null

    // The heartbeat of a running sprint: its last trail line and its age.
    const trailLine = () => {
      if (sprint === null || sprint.lastTrail === null) return null
      const isSilent = sprint.trailAt !== null && now - sprint.trailAt > SILENT_MS
      const age = sprint.trailAt === null ? '' : ` · ${minutes(sprint.trailAt, now)} ago`
      return (
        <Box key="trail">
          <Text color={isSilent ? 'warning' : 'success'}>● </Text>
          <Text color={isSilent ? 'warning' : undefined} dimColor={!isSilent}>
            {cut(`trail: ${sprint.lastTrail.replace(/^\s*[-*]\s*/, '')}${age}`, inner - 2)}
          </Text>
        </Box>
      )
    }

    // --- the heading card ---

    const at = phase === null ? -1 : phase === 'done' ? PHASES.length : PHASES.indexOf(phase as (typeof PHASES)[number])
    const isNarrow = inner < 52
    const versionsOk = hints.length === 0 && snap.versions.some(v => v.inProject !== null)
    const scrumVersion = snap.versions.find(v => v.plugin === 'ai-scrum')?.inProject ?? null
    const [filled, empty] = progress === null ? ['', ''] : meter(progress.value, progress.total, Math.min(30, inner - 18))

    const hero = (
      <Box key="hero" flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1}>
        <Box flexDirection="row" gap={1}>
          {Svg !== null && progress !== null && (
            <Svg
              source={ring(progress.value / progress.total, `${progress.value}/${progress.total}`)}
              alt={`${progress.value} of ${progress.total} ${progress.unit}`}
              width={58}
              height={58}
            />
          )}
          <Box flexDirection="column" flexGrow={1}>
            <Box justifyContent="space-between">
              <Text color="claude" bold>{cut(`✻ ${snap.phase ?? 'ai-scrum'}`, inner - 18)}</Text>
              {versionsOk && scrumVersion !== null && <Text color="success">{scrumVersion} ✓</Text>}
            </Box>
            {milestone !== null && (
              <Text>
                <Text color="claude">▶ {milestone.id} {milestone.name}</Text>
                <Text dimColor>{cut(sprint === null ? '' : ` · ${sprint.id} ${sprint.title}`, Math.max(0, inner - milestone.name.length - 8))}</Text>
              </Text>
            )}
            {isLive && (
              <Text>
                {PHASES.map((p, i) => (
                  <Text key={`ph-${p}`} color={i < at ? 'success' : i === at ? 'claude' : undefined} dimColor={i > at} bold={i === at}>
                    {i === 0 ? '' : ' ━ '}
                    {i < at ? '✓' : i === at ? '●' : '○'} {isNarrow ? (PHASE_LABEL[p] ?? p).slice(0, 3) : PHASE_LABEL[p]}
                  </Text>
                ))}
              </Text>
            )}
            {progress !== null && (
              <Text>
                <Text color={rp !== null ? 'success' : 'claude'}>{filled}</Text>
                <Text dimColor>{empty}</Text>
                {`  ${progress.value}/${progress.total} ${progress.unit}`}
              </Text>
            )}
          </Box>
        </Box>
        {hints.map(hint => (
          <Box key={`ph-${hint.plugin}-${hint.command ?? 'plugin'}`}>
            <Text color="warning">⚠ {cut(hint.text, inner - 12)} </Text>
            {hint.command !== null && (
              <Button key={`pupdate-${hint.plugin}`} label="Update" onPress={() => launch($, hint.command ?? '')} />
            )}
          </Box>
        ))}
        {standing.map((l, i) => (
          <Text key={`st-${i}`} dimColor>{l}</Text>
        ))}
        {snap.branching !== null && <Text dimColor>{cut(branchingLine(snap.branching), inner)}</Text>}
      </Box>
    )

    // --- the phase card: what the sprint is doing right now ---

    let focus: ReturnType<typeof Box> | null = null

    if (sprint !== null && rp !== null) {
      // Refinement: every story at once, the ones still refining first.
      const agentFor = (id: string) =>
        running.filter(a => a.storyId === id).sort((a, b) => a.startedAt - b.startedAt)[0]
      for (const a of running) if (a.storyId !== null && rp.ids.includes(a.storyId)) shown.add(a.key)
      const rows = rp.open
        .map(id => ({ id, agent: agentFor(id) }))
        .sort((a, b) => (a.agent?.startedAt ?? Infinity) - (b.agent?.startedAt ?? Infinity))
      const rest = rows.slice(REFINE_ROWS)
      const [done, todo] = meter(rp.refined.length, rp.ids.length, Math.min(30, inner))
      focus = (
        <Box key="focus" flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1}>
          <Box justifyContent="space-between">
            <Text bold>Refinement</Text>
            <Text color="claude">{rp.refined.length}/{rp.ids.length} refined</Text>
          </Box>
          <Text>
            <Text color="success">{done}</Text>
            <Text dimColor>{todo}</Text>
          </Text>
          {rows.slice(0, REFINE_ROWS).map(({ id, agent }) => {
            const quiet = agent !== undefined && isQuiet(agent, now)
            const [lit, unlit] = agent === undefined ? ['', ''] : meter(now - agent.startedAt, REFINE_SCALE_MS, 8)
            return (
              <Box key={`rf-${id}`} flexDirection="column">
                <Box justifyContent="space-between">
                  <Text>
                    <Text color={agent === undefined ? undefined : quiet ? 'warning' : 'claude'} dimColor={agent === undefined}>
                      {agent === undefined ? '○' : '●'}{' '}
                    </Text>
                    <Text dimColor>{id} </Text>
                    {cut(titleOf(id), inner - 22)}
                  </Text>
                  {agent === undefined ? (
                    <Text dimColor>no agent</Text>
                  ) : (
                    <Text>
                      <Text color={quiet ? 'warning' : 'claude'}>{lit}</Text>
                      <Text dimColor>{unlit} {minutes(agent.startedAt, now).padStart(3)}</Text>
                    </Text>
                  )}
                </Box>
                {agent !== undefined && (
                  <Text color={quiet ? 'warning' : 'suggestion'}>
                    {cut(`  → ${quiet ? `quiet ${minutes(agent.activeAt, now)} · ` : ''}${agent.activity || 'starting'}`, inner)}
                  </Text>
                )}
              </Box>
            )
          })}
          {rest.length > 0 && (
            <Text dimColor>{cut(`+${rest.length} more · ${rest.map(r => r.id).join(' ')}`, inner)}</Text>
          )}
          {rp.refined.length > 0 && <Text color="success">{cut(`✓ refined ${rp.refined.join(' ')}`, inner)}</Text>}
          {resumeButton}
        </Box>
      )
    } else if (sprint !== null && flow !== null && phase === 'build' && flow.focus !== null) {
      // Build: one story at a time, its stage and the agents on it.
      const id = flow.focus
      const story = storyById.get(id)
      const index = sprint.stories.findIndex(s => s.id === id) + 1
      const team = asTree(running.filter(a => a.storyId === id))
      for (const t of team) shown.add(t.row.key)
      const stage = flow.stage ?? 'implement'
      const rank = STAGE_RANK[stage]
      const total = story?.deliverablesTotal ?? 0
      const current = Number(/^D(\d+)/.exec(flow.step ?? '')?.[1] ?? 0)
      const ds = Array.from({ length: Math.max(total, current) }, (_, i) => i + 1)
      const root = team[0]?.row
      const finished = Object.values(flow.storyMinutes)
      const average = finished.length === 0 ? null : Math.round(finished.reduce((s, m) => s + m, 0) / finished.length)
      const stageColor = (r: number) => (rank > r || stage === 'done' ? 'success' : rank === r && stage !== 'blocked' ? 'claude' : undefined)
      const isOpen = (await read($, openStory)) === id
      const hasText = story !== undefined && story.requirement.length + story.criteria.length > 0
      focus = (
        <Box key="focus" flexDirection="column" borderStyle="round" borderColor={stage === 'blocked' ? 'warning' : 'claude'} paddingX={1}>
          <Box justifyContent="space-between">
            <Text color="claude" bold>
              {stage === 'done' ? 'Just finished' : 'Now building'} · story {index} of {sprint.stories.length}
            </Text>
            <Text dimColor>
              {root === undefined ? '' : minutes(root.startedAt, now)}
              {average === null ? '' : ` · avg ${average}m`}
            </Text>
          </Box>
          {hasText ? (
            <Button key="story-text" plain onPress={() => update($, openStory, v => (v === id ? null : id))}>
              <Text dimColor>{isOpen ? '▾ ' : '▸ '}</Text>
              <Text bold>{isOpen ? `${id} ${titleOf(id)}` : cut(`${id} ${titleOf(id)}`, inner - 2)}</Text>
            </Button>
          ) : (
            <Text bold>{cut(`${id} ${titleOf(id)}`, inner)}</Text>
          )}
          {isOpen && story !== undefined && (
            <Box key="story-body" flexDirection="column" paddingLeft={2}>
              {story.requirement.map((p, i) => (
                <Text key={`rq-${i}`} dimColor>{p}</Text>
              ))}
              {story.criteria.length > 0 && <Text bold>Acceptance criteria</Text>}
              {story.criteria.map((p, i) => (
                <Text key={`ac-${i}`} dimColor>{p}</Text>
              ))}
            </Box>
          )}
          <Text>
            {ds.map(n => {
              const isNow = n === current && stage === 'implement'
              const isPast = !isNow && (n <= (story?.deliverablesDone ?? 0) || rank > 0)
              return (
                <Text key={`d-${n}`} color={isNow ? 'claude' : isPast ? 'success' : undefined} dimColor={!isNow && !isPast} bold={isNow}>
                  {isNow ? '●' : isPast ? '✓' : '○'}D{n}{' '}
                </Text>
              )
            })}
            <Text dimColor>{ds.length > 0 ? '→ ' : ''}</Text>
            <Text color={stageColor(1)} dimColor={stageColor(1) === undefined} bold={stage === 'verify'}>Verify</Text>
            <Text dimColor> → </Text>
            <Text color={stageColor(2)} dimColor={stageColor(2) === undefined} bold={stage === 'review'}>Review</Text>
          </Text>
          <Text color={stage === 'blocked' ? 'warning' : undefined}>
            <Text color={stage === 'blocked' ? 'warning' : 'claude'}>{STAGE_LABEL[stage]}</Text>
            {cut(`${flow.step === null ? '' : ` · ${flow.step}`}${flow.stepAt === null ? '' : ` · started ${clockOf(flow.stepAt)}`}`, inner - 10)}
          </Text>
          {team.slice(0, FOCUS_AGENTS).map(({ row: a, depth }) => (
            <Box key={`fa-${a.key}`} flexDirection="column">
              <Box justifyContent="space-between">
                <Button key={`a-${a.key}`} plain onPress={() => (a.agentId === null ? undefined : $.ui.view({ agentId: a.agentId }))}>
                  <Text dimColor>{depth === 0 ? '' : `${'  '.repeat(depth - 1)}└ `}</Text>
                  <Text color={isQuiet(a, now) ? 'warning' : 'claude'}>● </Text>
                  {cut(a.description || a.type, inner - 34)}
                </Button>
                <Text dimColor>{`${setting(a)}  ${minutes(a.startedAt, now)}  ${a.tools} tools`}</Text>
              </Box>
              <Text color={isQuiet(a, now) ? 'warning' : 'suggestion'}>
                {cut(`${'  '.repeat(depth + 1)}→ ${a.activity || 'starting'}`, inner)}
              </Text>
            </Box>
          ))}
          {team.length > FOCUS_AGENTS && <Text dimColor>+{team.length - FOCUS_AGENTS} more on {id}</Text>}
          {trailLine()}
          {resumeButton}
        </Box>
      )
    } else if (sprint !== null) {
      // Planned, clarify, gate, review: the sprint, what it waits for, its stories.
      const what =
        phase === 'planned'
          ? `Sprint ${sprint.id} — ${sprint.title} (planned)`
          : phase === 'clarify'
            ? 'Clarification · /sprint asks its questions before refining'
            : phase === 'gate'
              ? `Regression gate${flow?.step ? ` · ${flow.step}` : ''}${flow?.stepAt ? ` · started ${clockOf(flow.stepAt)}` : ''}`
              : phase === 'review'
                ? 'Sprint review'
                : `Sprint ${sprint.id} — ${sprint.title} (${sprint.status})`
      focus = (
        <Box key="focus" flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1}>
          <Text color="claude" bold>{cut(what, inner)}</Text>
          {(phase === 'planned' || phase === 'clarify') &&
            sprint.stories.map(st => {
              const s = storyById.get(st.id)
              return (
                <Text key={`ss-${st.id}`} dimColor={st.isDone}>
                  {cut(`${st.isDone ? '✓' : '○'} ${s === undefined ? `${st.id} ${st.title}` : storyLine(s)}`, inner)}
                </Text>
              )
            })}
          {isLive && trailLine()}
          {resumeButton}
        </Box>
      )
    }

    // In build, gate and review the sprint shrinks to a row of story chips.
    const finishedTimes = flow === null ? [] : Object.entries(flow.storyMinutes)
    const lastDone = finishedTimes[finishedTimes.length - 1]
    const avg =
      finishedTimes.length === 0 ? null : finishedTimes.reduce((s, [, m]) => s + m, 0) / finishedTimes.length
    const left = sprint === null ? 0 : sprint.stories.length - doneCount
    const chips =
      sprint !== null && flow !== null && (phase === 'build' || phase === 'gate' || phase === 'review') ? (
        <Box key="sprint" flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
          <Box justifyContent="space-between">
            <Text>
              <Text bold>Sprint {sprint.id}</Text>
              <Text dimColor>{cut(` ${sprint.title}`, Math.max(0, inner - 30))}</Text>
            </Text>
            <Text dimColor>
              {doneCount}/{sprint.stories.length}
              {avg === null || left === 0 || phase !== 'build' ? '' : ` · ~${Math.round(avg * left)}m left`}
            </Text>
          </Box>
          <Text>
            {sprint.stories.map(st => {
              const isFocus = st.id === flow.focus && !st.isDone
              return (
                <Text key={`c-${st.id}`} color={st.isDone ? 'success' : isFocus ? 'claude' : undefined} dimColor={!st.isDone && !isFocus} bold={isFocus}>
                  {st.isDone ? '✓' : isFocus ? '●' : ''}{st.id}{' '}
                </Text>
              )
            })}
          </Text>
          {lastDone !== undefined && (
            <Text dimColor>{cut(`last: ${lastDone[0]} ${titleOf(lastDone[0])} · ${lastDone[1]} min`, inner)}</Text>
          )}
        </Box>
      ) : null

    // --- agents the phase card does not show ---

    const sprintAgents = rp === null ? [] : list.filter(a => a.storyId !== null && rp.ids.includes(a.storyId))
    const others = running.filter(a => !shown.has(a.key))
    const finished = isLive
      ? []
      : list.filter(a => a.status !== 'running' && a.key !== MAIN).slice(-5).reverse()
    const refineRunning = sprintAgents.filter(a => a.status === 'running')
    const refineDone = sprintAgents.filter(a => a.status !== 'running')
    const quietOnes = refineRunning.filter(a => isQuiet(a, now))
    const longest = [...refineRunning].sort((a, b) => a.startedAt - b.startedAt)[0]
    const models = [...new Set(refineRunning.map(setting).filter(m => m !== ''))].join(', ')
    const hasAgentsCard =
      sprintAgents.length > 0 || others.length > 0 || finished.length > 0 || main?.status === 'running' || !isLive

    const agentsCard = hasAgentsCard ? (
      <Box key="agents" flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
        <Box justifyContent="space-between">
          <Text bold>Agents</Text>
          <Text color="claude">
            {sprintAgents.length > 0
              ? `${refineRunning.length} running · ${refineDone.length} done`
              : others.length > 0
                ? `${others.length} running`
                : ''}
          </Text>
        </Box>
        {sprintAgents.length > 0 && (
          <Text>
            {refineRunning.map(a => (
              <Text key={`dot-${a.key}`} color={isQuiet(a, now) ? 'warning' : 'claude'}>●</Text>
            ))}
            {refineDone.map(a => (
              <Text key={`dot-${a.key}`} color={a.status === 'failed' ? 'error' : 'success'}>●</Text>
            ))}
            <Text dimColor>{models === '' ? '' : `  refine · ${models}`}</Text>
          </Text>
        )}
        {(quietOnes.length > 0 || longest !== undefined) && (
          <Box justifyContent="space-between">
            <Text color="warning">
              {quietOnes.length === 0 ? '' : cut(`quiet: ${quietOnes.map(a => `${a.storyId} (${minutes(a.activeAt, now)})`).join(' ')}`, inner - 22)}
            </Text>
            <Text dimColor>{longest === undefined ? '' : `longest ${longest.storyId} · ${minutes(longest.startedAt, now)}`}</Text>
          </Box>
        )}
        {main !== undefined && main.status === 'running' && (
          <Text>{cut(`● main session → ${main.activity}`, inner)}</Text>
        )}
        {others.map(a => (
          <Button key={`a-${a.key}`} plain onPress={() => (a.agentId === null ? undefined : $.ui.view({ agentId: a.agentId }))}>
            <Text color={isQuiet(a, now) ? 'warning' : 'claude'}>● </Text>
            {cut(`${agentLine(a)} → ${a.activity}`, inner - 2)}
          </Button>
        ))}
        {finished.map(a => (
          <Text key={`f-${a.key}`} dimColor color={a.status === 'failed' ? 'error' : undefined}>
            {cut(`${a.status === 'failed' ? '✗' : '✓'} ${agentLine(a)} · ${a.tools} tools`, inner)}
          </Text>
        ))}
        {sprintAgents.length === 0 && others.length === 0 && main?.status !== 'running' && finished.length === 0 && (
          <Text dimColor>Nothing running.</Text>
        )}
      </Box>
    ) : null

    // --- what waits on the person, and what comes next ---

    const waitingCard =
      waiting.length > 0 ? (
        <Box key="waiting" flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1}>
          <Text color="warning" bold>⚠ Waiting on you</Text>
          {waiting.map((w, i) => (
            <Text key={`w-${i}`}>{cut(`· ${w}`, inner)}</Text>
          ))}
        </Box>
      ) : null

    const looseMilestones = unplannedMilestones(snap)
    const looseStories = unplannedStories(snap)
    const hasNext =
      looseMilestones.length > 0 || looseStories.length > 0 || snap.openTopics.length > 0 || snap.followUps > 0
    const planLabel = `Plan · ${launchLabel(snap, 'roadmap')}`
    const nextCard = hasNext ? (
      <Box key="next" flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
        <Box justifyContent="space-between">
          <Text bold>Next</Text>
          <Text dimColor>{snap.followUps > 0 ? `${snap.followUps} follow-ups` : ''}</Text>
        </Box>
        {looseMilestones.map(m => (
          <Box key={`m-${m.id}`} justifyContent="space-between">
            <Text>{cut(`○ ${m.id} ${m.name} · no sprint`, inner - planLabel.length - 6)} </Text>
            <Button key={`plan-${m.id}`} label={planLabel} onPress={() => launch($, '/roadmap plan')} />
          </Box>
        ))}
        {looseStories.map(s => {
          const step = storyCommand(s)
          const label = `${step.label} · ${launchLabel(snap, step.name)}`
          return (
            <Box key={`ls-${s.id}`} justifyContent="space-between">
              <Text>{cut(storyLine(s), inner - label.length - 6)} </Text>
              <Button key={`go-${s.id}`} label={label} onPress={() => launch($, step.command)} />
            </Box>
          )
        })}
        {snap.openTopics.length > 0 && <Text dimColor>{cut(`Open: ${snap.openTopics.join(' · ')}`, inner)}</Text>}
      </Box>
    ) : null

    return (
      <Box flexDirection="column" gap={1}>
        {hero}
        {chips}
        {focus}
        {agentsCard}
        {waitingCard}
        {nextCard}
        <Box>
          <Button key="roadmap-check" label={`Roadmap check · ${launchLabel(snap, 'roadmap')}`} onPress={() => launch($, '/roadmap check')} />
          <Button key="concept" label="New concept…" onPress={() => $.prompt.fill({ text: '/concept ', mode: 'replace' })} />
          <Button key="settings" label="Settings" onPress={() => openSettings($)} />
          <Button key="refresh" label="Refresh" onPress={() => refresh($)} />
        </Box>
        <Text dimColor>
          Sprints {snap.sprints.length} open · {snap.doneSprints} done · Stories {snap.stories.length} open ·{' '}
          {snap.doneStories} done
        </Text>
      </Box>
    )
  })

  // --- The settings pane: the profile's branching, read and changed ---

  on('ui.render', { component: 'Pane', requestId: SETTINGS }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    // Mobile draws no fields; there the values are only shown.
    const Input = 'Input' in elements ? elements.Input : null
    const Select = 'Select' in elements ? elements.Select : null
    const snap = await read($, snapshot)
    const inner = Math.max(24, e.props.bodyColumns - 4)
    if (snap === null || snap.branching === null) {
      return (
        <Box flexDirection="column">
          <Text>{snap === null ? 'Reading the project…' : 'No .claude/ai-scrum.md in this project.'}</Text>
          {snap !== null && <Button key="setup" label="Set up ai-scrum" onPress={() => launch($, '/ai-scrum:setup')} />}
          <Button key="refresh" label="Refresh" onPress={() => refresh($)} />
        </Box>
      )
    }
    const b = snap.branching
    const running = snap.sprints.find(s => s.status === 'in-progress')
    const isEditable = running === undefined && Input !== null && Select !== null
    const isConflict = !b.isSprintBranch && b.protectedBranches.includes(b.base)
    const protectedText = b.protectedBranches.join(', ') || 'none'
    const onOff = [
      { value: 'true', label: 'yes' },
      { value: 'false', label: 'no' },
    ]

    return (
      <Box flexDirection="column" gap={1}>
        <Box key="branching" flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1}>
          <Text color="claude" bold>Branching</Text>
          <Text dimColor>{cut(branchingLine(b), inner)}</Text>
          {isEditable && Input !== null && Select !== null ? (
            <Box flexDirection="column">
              <Select
                key="base"
                label="Base branch "
                options={[...new Set([b.base, ...b.branches])].map(v => ({ value: v }))}
                value={b.base}
                onSelect={v => void saveSetting($, 'branch-base', v, 'branch-base')}
              />
              <Input
                key="base-other"
                label="Other base "
                placeholder="a branch name"
                submitLabel="set"
                onSubmit={v => void saveSetting($, 'branch-base', v, 'branch-base')}
              />
              <Select
                key="mode"
                label="Sprint commits "
                options={[
                  { value: 'true', label: 'on a sprint branch, merged by you' },
                  { value: 'false', label: `directly on ${b.base}` },
                ]}
                value={String(b.isSprintBranch)}
                onSelect={v => void saveSetting($, 'sprint-branch', v, 'branch-base')}
              />
              {b.isSprintBranch && (
                <Input
                  key="pattern"
                  label="Sprint branch "
                  value={b.pattern}
                  submitLabel="set"
                  onSubmit={v => void saveSetting($, 'sprint-branch-pattern', v, 'sprint-branch')}
                />
              )}
              <Select
                key="autocommit"
                label="Commit per story "
                options={onOff}
                value={String(b.isAutoCommit)}
                onSelect={v => void saveSetting($, 'auto-commit-per-story', v, 'sprint-branch-pattern')}
              />
              <Input
                key="protected"
                label="Protected "
                value={protectedText}
                submitLabel="set"
                onSubmit={v => void saveSetting($, 'protected-branches', v, 'auto-commit-per-story')}
              />
            </Box>
          ) : (
            <Box flexDirection="column">
              <Text>{cut(`Base branch: ${b.base}`, inner)}</Text>
              <Text>{cut(`Sprint commits: ${b.isSprintBranch ? `on ${b.pattern}, merged by you` : `directly on ${b.base}`}`, inner)}</Text>
              <Text>{`Commit per story: ${b.isAutoCommit ? 'yes' : 'no'}`}</Text>
              <Text>{cut(`Protected: ${protectedText}`, inner)}</Text>
              <Text color="warning">
                {cut(
                  running !== undefined
                    ? `${running.id} is running: change the branching after it`
                    : 'This surface draws no fields: edit .claude/ai-scrum.md',
                  inner,
                )}
              </Text>
            </Box>
          )}
          {isConflict && (
            <Text color="warning">
              {cut(`⚠ ${b.base} is protected: /sprint will not start. Unprotect it or use a sprint branch.`, inner)}
            </Text>
          )}
        </Box>
        <Text dimColor>{cut('Writes these lines of .claude/ai-scrum.md; /sprint reads them when it starts.', inner)}</Text>
        <Box>
          <Button key="cockpit" label="Cockpit" onPress={() => openPane($)} />
          <Button key="refresh" label="Refresh" onPress={() => refresh($)} />
        </Box>
      </Box>
    )
  })
}
