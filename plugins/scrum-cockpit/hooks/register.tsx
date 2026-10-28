import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { AgentRow, Snapshot, Story } from '../types'
import {
  activeSprint,
  currentMilestone,
  isDone,
  isRunning,
  launchLabel,
  scan,
  storyCommand,
  unplannedMilestones,
  unplannedStories,
  updateHints,
} from './scan'
import type { Reader } from './scan'

const PANE = 'scrum-cockpit'
const MAIN = 'main'

// Change a tag when the stored shape changes: an older value then reads as
// the initial one instead of breaking the drawing after a reload.
const snapshot = atom({ plugin: 'scrum-cockpit', key: 'snapshot' } as const, null, {
  shape: 'snapshot-1',
})
const agents = atom({ plugin: 'scrum-cockpit', key: 'agents' } as const, [], {
  shape: 'agents-1',
})
const isBandHidden = atom({ plugin: 'scrum-cockpit', key: 'isBandHidden' } as const, false)

const WATCHED = /docs[\\/]|ROADMAP|sprint|requirement|\.claude[\\/](ai-scrum|tech-rules|commands)/i

const str = (value: unknown) => (typeof value === 'string' ? value : null)

const cut = (text: string, width: number) =>
  width < 4 || text.length <= width ? text : `${text.slice(0, width - 1)}…`

const shortPath = (path: string) => path.replace(/\\/g, '/').split('/').slice(-2).join('/')

const minutes = (from: number, to: number) => {
  const s = Math.max(0, Math.round((to - from) / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`
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
        return (await $.fs.list(path)).map(f => ({ name: f.name, isDir: f.kind === 'dir' }))
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

async function newRow($: EngineInterface, key: string): Promise<AgentRow> {
  const now = await $.clock.now()
  const info = key === MAIN ? undefined : (await $.agent.list()).find(a => a.id === key)
  return {
    key,
    agentId: key === MAIN ? null : key,
    type: key === MAIN ? 'main session' : (info?.type ?? 'agent'),
    description: info?.description ?? '',
    model: null,
    effort: null,
    status: 'running',
    activity: '',
    tools: 0,
    startedAt: now,
    endedAt: null,
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

  on('command.run', { command: 'scrum' }, async $ => {
    openPane($)

    return { text: 'Scrum cockpit opened.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const now = await $.clock.now()
    const temp = `spawn:${e.tool_use_id}:${e.workflow?.agentIndex ?? ''}`
    const row: AgentRow = {
      key: temp,
      agentId: null,
      type: e.subagentType,
      description: e.description,
      model: e.model ?? null,
      effort: null,
      status: 'running',
      activity: 'starting',
      tools: 0,
      startedAt: now,
      endedAt: null,
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
    await upsert($, key, () => newRow($, key), a => ({
      ...a,
      status: 'running',
      activity: activityOf(tool, input),
      tools: a.tools + 1,
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
      const done = sprint.stories.filter(s => s.isDone).length
      parts.push(`${sprint.id} ${sprint.status} ${done}/${sprint.stories.length}`)
    }
    if (running.length > 0) {
      const first = running[0]
      parts.push(
        `${running.length} agent${running.length > 1 ? 's' : ''}` +
          (first === undefined ? '' : `: ${first.description || first.type} → ${first.activity}`),
      )
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
            <Text dimColor>{cut(parts.join(' · ') || 'ai-scrum', Math.max(10, width - 22))} </Text>
            <Button key="open" label="Overview" onPress={() => openPane($)} />
            <Button key="hide" label="Hide" plain onPress={() => update($, isBandHidden, () => true)} />
          </Box>
        )}
      </Box>
    )
  })

  // --- The pane ---

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
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
    const milestone = currentMilestone(snap)
    const storyById = new Map(snap.stories.map(s => [s.id, s] as const))
    const looseStories = unplannedStories(snap)
    const looseMilestones = unplannedMilestones(snap)
    const shownMilestones = snap.milestones.filter(
      (m, i) => !isDone(m.status) || i === snap.milestones.findIndex(x => x === milestone) - 1,
    )
    const isSprintBusy = list.some(a => a.status === 'running')
    const activeAgents = list.filter(a => a.status === 'running' && a.key !== MAIN)
    const finishedAgents = list.filter(a => a.status !== 'running' && a.key !== MAIN).slice(-5).reverse()
    const main = list.find(a => a.key === MAIN)

    const storyLine = (s: Story) =>
      `${s.id} ${s.title} · ${s.status}` +
      (s.deliverablesTotal > 0 ? ` · D ${s.deliverablesDone}/${s.deliverablesTotal}` : '')

    const agentLine = (a: AgentRow) => {
      const setting = [a.model, a.effort].filter(x => x !== null).join('/')
      const time = minutes(a.startedAt, a.endedAt ?? now)
      return `${a.description || a.type} · ${a.type}${setting === '' ? '' : ` · ${setting}`} · ${time}`
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          {snap.versions.map(v => (
            <Text key={`v-${v.plugin}`} dimColor>
              {v.plugin}: project {v.inProject ?? '—'} · installed {v.installed ?? '—'} · latest {v.latest ?? '—'}
            </Text>
          ))}
          {hints.map(hint => (
            <Box key={`ph-${hint.plugin}-${hint.command ?? 'plugin'}`}>
              <Text color="warning">⚠ {cut(hint.text, width - 14)} </Text>
              {hint.command !== null && (
                <Button key={`pupdate-${hint.plugin}`} label="Update" onPress={() => launch($, hint.command ?? '')} />
              )}
            </Box>
          ))}
        </Box>

        {(snap.phase !== null || snap.standing.length > 0) && (
          <Box flexDirection="column">
            {snap.phase !== null && <Text bold>{cut(snap.phase, width)}</Text>}
            {snap.standing.map((l, i) => (
              <Text key={`st-${i}`}>{l}</Text>
            ))}
          </Box>
        )}

        {shownMilestones.length > 0 && (
          <Box flexDirection="column">
            <Text bold>Milestones</Text>
            {shownMilestones.map(m => {
              const mark = isDone(m.status) ? '✓' : m === milestone ? '▶' : '○'
              const isLoose = looseMilestones.includes(m)
              return (
                <Box key={`m-${m.id}`}>
                  <Text color={isDone(m.status) ? 'success' : m === milestone ? 'claude' : undefined} dimColor={isDone(m.status)}>
                    {cut(`${mark} ${m.id} ${m.name} · ${m.sprints.join(' ') || 'no sprint'}`, width - (isLoose ? 26 : 0))}{' '}
                  </Text>
                  {isLoose && (
                    <Button key={`plan-${m.id}`} label={`Plan · ${launchLabel(snap, 'roadmap')}`} onPress={() => launch($, '/roadmap plan')} />
                  )}
                </Box>
              )
            })}
          </Box>
        )}

        {sprint !== null && (
          <Box flexDirection="column">
            <Box>
              <Text bold>{cut(`Sprint ${sprint.id} — ${sprint.title} (${sprint.status})`, width - 30)} </Text>
              {sprint.status === 'planned' && (
                <Button key="sprint-start" variant="primary" label={`Start · ${launchLabel(snap, 'sprint')}`} onPress={() => launch($, `/sprint ${sprint.id}`)} />
              )}
              {sprint.status === 'in-progress' && !isSprintBusy && (
                <Button key="sprint-resume" variant="primary" label={`Resume · ${launchLabel(snap, 'sprint')}`} onPress={() => launch($, `/sprint ${sprint.id}`)} />
              )}
            </Box>
            {sprint.stories.map(st => {
              const story = storyById.get(st.id)
              const text = story === undefined ? `${st.id} ${st.title}` : storyLine(story)
              return (
                <Text key={`ss-${st.id}`} dimColor={st.isDone || story?.status === 'done'}>
                  {cut(`${st.isDone ? '[x]' : '[ ]'} ${text}`, width)}
                </Text>
              )
            })}
            {sprint.lastTrail !== null && <Text dimColor>{cut(`trail: ${sprint.lastTrail}`, width)}</Text>}
          </Box>
        )}

        <Box flexDirection="column">
          <Text bold>Agents</Text>
          {main !== undefined && main.status === 'running' && (
            <Text>{cut(`● main session → ${main.activity}`, width)}</Text>
          )}
          {activeAgents.length === 0 && main?.status !== 'running' && <Text dimColor>Nothing running.</Text>}
          {activeAgents.map(a => (
            <Button key={`a-${a.key}`} plain onPress={() => (a.agentId === null ? undefined : $.ui.view({ agentId: a.agentId }))}>
              <Text color="claude">● </Text>
              {cut(`${agentLine(a)} → ${a.activity}`, width - 2)}
            </Button>
          ))}
          {finishedAgents.map(a => (
            <Text key={`f-${a.key}`} dimColor color={a.status === 'failed' ? 'error' : undefined}>
              {cut(`${a.status === 'failed' ? '✗' : '✓'} ${agentLine(a)} · ${a.tools} tools`, width)}
            </Text>
          ))}
        </Box>

        {looseStories.length > 0 && (
          <Box flexDirection="column">
            <Text bold>Stories in no sprint</Text>
            {looseStories.map(s => {
              const next = storyCommand(s)
              const label = `${next.label} · ${launchLabel(snap, next.name)}`
              return (
                <Box key={`ls-${s.id}`}>
                  <Text>{cut(storyLine(s), width - label.length - 6)} </Text>
                  <Button key={`go-${s.id}`} label={label} onPress={() => launch($, next.command)} />
                </Box>
              )
            })}
          </Box>
        )}

        {(snap.openTopics.length > 0 || snap.followUps > 0) && (
          <Box flexDirection="column">
            <Text bold>Open</Text>
            {snap.openTopics.map((t, i) => (
              <Text key={`ot-${i}`}>{cut(`· ${t}`, width)}</Text>
            ))}
            {snap.followUps > 0 && <Text dimColor>{snap.followUps} follow-ups in the roadmap</Text>}
          </Box>
        )}

        <Box>
          <Button key="roadmap-check" label={`Roadmap check · ${launchLabel(snap, 'roadmap')}`} onPress={() => launch($, '/roadmap check')} />
          <Button key="concept" label="New concept…" onPress={() => $.prompt.fill({ text: '/concept ', mode: 'replace' })} />
          <Button key="refresh" label="Refresh" onPress={() => refresh($)} />
        </Box>
        <Text dimColor>
          {snap.sprints.length} sprints open · {snap.doneSprints} done · {snap.stories.length} stories open ·{' '}
          {snap.doneStories} done
        </Text>
      </Box>
    )
  })
}
