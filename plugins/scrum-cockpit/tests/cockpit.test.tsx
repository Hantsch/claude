import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import {
  activeSprint,
  currentMilestone,
  isDone,
  parseRoadmap,
  scan,
  unplannedMilestones,
  unplannedStories,
  updateHints,
} from '../hooks/scan'
import type { Reader } from '../hooks/scan'

// A project shaped like a real one: the roadmap's milestone table uses ids
// like `11.5` and a `#` column, as projects drift from the template.
const FILES: Record<string, string> = {
  '/proj/.claude/ai-scrum.md': [
    'requirements-path: docs/requirements',
    'sprints-path: docs/sprints',
    'roadmap-path: docs/ROADMAP.md',
  ].join('\n'),
  '/proj/.claude/ai-scrum.lock': '{ "ai-scrum-version": "4.5.0", "files": {} }',
  '/proj/.claude/tech-rules.lock': '{ "tech-rules-version": "2.4.0", "groups": [], "files": {} }',
  '/proj/.claude/commands/sprint.md': '---\ndescription: x\nmodel: sonnet\neffort: medium\n---\n',
  '/proj/.claude/commands/refine.md': '---\ndescription: x\nmodel: opus\neffort: high\n---\n',
  '/proj/.claude/commands/build.md': '---\ndescription: x\nmodel: sonnet\neffort: medium\n---\n',
  '/proj/.claude/commands/roadmap.md': '---\ndescription: x\nmodel: sonnet\neffort: medium\n---\n',
  '/home/.claude/plugins/installed_plugins.json': JSON.stringify({
    version: 2,
    plugins: {
      'ai-scrum@hantsch': [
        { scope: 'project', projectPath: 'C:\\other', version: '1.0.0' },
        { scope: 'user', version: '4.6.0' },
      ],
      'tech-rules@hantsch': [{ scope: 'user', version: '2.4.0' }],
    },
  }),
  '/home/.claude/plugins/known_marketplaces.json': JSON.stringify({
    hantsch: { installLocation: '/mk' },
  }),
  '/mk/.claude-plugin/marketplace.json': JSON.stringify({
    plugins: [
      { name: 'ai-scrum', version: '4.6.0' },
      { name: 'tech-rules', version: '2.5.0' },
    ],
  }),
  '/proj/docs/ROADMAP.md': [
    '# Roadmap',
    '',
    '## Where we stand',
    '',
    '- Phase 11, milestone 11.5 is being built in [S36](sprints/S36/sprint.md).',
    '- Next: `/roadmap plan` for 11.6.',
    '',
    '## Current phase',
    '',
    'Phase 11 — codebase health, source [review](reviews/x.md).',
    '',
    '| #    | Milestone          | Status          | Sprint(s)                    | Note |',
    '| ---- | ------------------ | --------------- | ---------------------------- | ---- |',
    '| 11.4 | User feedback      | done 2026-10-27 | [S35](sprints/S35/review.md) | ok   |',
    '| 11.5 | Tests review       | ▶ **in progress** | [S36](sprints/S36/sprint.md) |      |',
    '| 11.6 | Packaging          | planned         |                              |      |',
    '',
    '## Open / unprioritised',
    '',
    '| Topic | State | Next step |',
    '| --- | --- | --- |',
    '| Plugin store | idea | `/concept` |',
    '',
    '## Follow-ups worth doing',
    '',
    '- flaky clock test — S35',
    '- <what, one line>',
    '',
    '## History',
  ].join('\r\n'),
  '/proj/docs/sprints/S36/sprint.md': [
    '---',
    'sprint: S36',
    'status: in-progress # planned | in-progress | done',
    'branch: # set by /sprint',
    'milestone: 11.5 — tests review',
    '---',
    '',
    '# Sprint S36 — A gate that blocks on the right things',
    '',
    '## Stories (in build order)',
    '',
    '- [x] 267 — Timing-ratio tests leave the blocking unit lane',
    '- [ ] 266 — Release waits for a green CI run',
    '',
    '## Notes',
  ].join('\n'),
  '/proj/docs/sprints/S36/progress.md': '- 09:52:01 · 266 · build · started\n- 09:58:12 · 266 · D1 · done\n',
  '/proj/docs/requirements/266-release.md': [
    '---',
    'id: 266',
    'title: Release waits for a green CI run',
    'status: draft # draft -> ready -> in-progress -> done',
    '---',
    '',
    '## Deliverables',
    '',
    '- [ ] D1 — <smallest useful, individually acceptable result; names the files it touches>',
    '- [ ] D2 — ...',
  ].join('\n'),
  '/proj/docs/requirements/267-timing.md': [
    '---',
    'id: 267',
    'title: Timing-ratio tests leave the blocking unit lane',
    'status: in-progress',
    '---',
    '',
    '## Deliverables',
    '',
    '- [x] **D1** — move the tests',
    '- [ ] **D2** — update the lane map',
  ].join('\n'),
  '/proj/docs/requirements/280-installer.md': '---\nid: 280\ntitle: Installer signs the binary\nstatus: ready\n---\n',
}

const DIRS: Record<string, { name: string; isDir: boolean }[]> = {
  '/proj/docs/sprints': [
    { name: 'README.md', isDir: false },
    { name: 'S36', isDir: true },
    { name: '_TEMPLATE', isDir: true },
    { name: 'done', isDir: true },
  ],
  '/proj/docs/sprints/done': [
    { name: 'S01', isDir: true },
    { name: 'S02', isDir: true },
  ],
  '/proj/docs/requirements': [
    { name: '266-release.md', isDir: false },
    { name: '267-timing.md', isDir: false },
    { name: '280-installer.md', isDir: false },
    { name: 'README.md', isDir: false },
    { name: '_TEMPLATE.md', isDir: false },
    { name: 'done', isDir: true },
  ],
  '/proj/docs/requirements/done': [
    { name: '001-a.md', isDir: false },
    { name: 'INDEX.md', isDir: false },
  ],
}

const reader: Reader = {
  configDir: '/home/.claude',
  read: async path => FILES[path] ?? null,
  list: async path => DIRS[path] ?? [],
}

// The engine hands fs hooks native paths (`C:\proj\docs` on Windows).
const posix = (path: string) => path.replace(/^[A-Za-z]:/, '').replace(/\\/g, '/')

// The engine beneath the mod, answered from the fixtures above.
function project(on: On) {
  mock.clock(on, { now: 1_000_000 })
  mock.env(on, { USERPROFILE: '/home' })
  on('session.root', () => ({ value: '/proj' }))
  on('fs.read', (_, e) => {
    const text = FILES[posix(e.path)]
    return text === undefined ? { deny: `ENOENT ${e.path}` } : { value: text }
  })
  on('fs.list', (_, e) => {
    const entries = DIRS[posix(e.path)]
    return entries === undefined
      ? { deny: `ENOENT ${e.path}` }
      : { value: entries.map(d => ({ name: d.name, kind: d.isDir ? 'dir' : 'file', size: 0, mtimeMs: 0, isLink: false }) as const) }
  })
  on('agent.list', () => ({ value: [] }))
  on('command.register', () => ({ value: { command: 'scrum' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
}

const PANE = {
  plugin: 'scrum-cockpit',
  component: 'Pane',
  requestId: 'scrum-cockpit',
  props: {
    title: 'Scrum',
    isFocused: false,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

const BAND = {
  plugin: 'scrum-cockpit',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 6,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 6 },
    view: {},
  },
} as const

test('the scanner reads milestones, sprints, stories and versions', async () => {
  const snap = await scan(reader, '/proj', 0)

  expect(snap.hasScrum).toBe(true)
  expect(snap.phase).toBe('Phase 11 — codebase health, source review.')
  expect(snap.standing.length).toBe(2)
  expect(snap.milestones.map(m => m.id)).toEqual(['11.4', '11.5', '11.6'])
  expect(currentMilestone(snap)?.id).toBe('11.5')
  expect(unplannedMilestones(snap).map(m => m.id)).toEqual(['11.6'])

  const sprint = activeSprint(snap)
  expect(sprint?.id).toBe('S36')
  expect(sprint?.status).toBe('in-progress')
  expect(sprint?.title).toBe('A gate that blocks on the right things')
  expect(sprint?.stories.map(s => `${s.id}:${s.isDone}`)).toEqual(['267:true', '266:false'])
  expect(sprint?.lastTrail).toBe('- 09:58:12 · 266 · D1 · done')
  expect(snap.doneSprints).toBe(2)

  // Template placeholders are no deliverables.
  const byId = new Map(snap.stories.map(s => [s.id, s]))
  expect(byId.get('266')?.deliverablesTotal).toBe(0)
  expect(byId.get('267')?.deliverablesDone).toBe(1)
  expect(byId.get('267')?.deliverablesTotal).toBe(2)
  expect(unplannedStories(snap).map(s => s.id)).toEqual(['280'])
  expect(snap.doneStories).toBe(1)

  expect(snap.openTopics).toEqual(['Plugin store'])
  expect(snap.followUps).toBe(1)
  expect(snap.launch['refine']).toEqual({ model: 'opus', effort: 'high' })
  expect(snap.launch['concept']).toEqual({ model: null, effort: null })
})

test('update hints: the project behind the plugin, the plugin behind the marketplace', async () => {
  const snap = await scan(reader, '/proj', 0)
  const hints = updateHints(snap)

  expect(snap.versions.find(v => v.plugin === 'ai-scrum')).toEqual({
    plugin: 'ai-scrum',
    inProject: '4.5.0',
    installed: '4.6.0',
    latest: '4.6.0',
    marketplace: 'hantsch',
  })
  expect(hints.map(h => `${h.plugin}:${h.command ?? '-'}`)).toEqual(['ai-scrum:/ai-scrum:setup', 'tech-rules:-'])
})

test('the pane shows the overview and its buttons start commands, on every surface', async ($, on) => {
  project(on)
  const submitted: string[] = []
  on('command.run', (_, e) => {
    submitted.push(`/${e.command} ${e.args}`.trim())
    return { text: '' }
  })
  on('ui.toast', () => ({ value: undefined }))
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'vscode', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'refresh' })

    expect((await ui.find({ type: 'Text', text: /11\.6 Packaging/ }))?.text).toContain('no sprint')
    expect((await ui.find({ key: 'plan-11.6' }))?.text).toBe('Plan · sonnet/medium')
    expect((await ui.find({ key: 'go-280' }))?.text).toBe('Build · sonnet/medium')
    expect((await ui.find({ type: 'Text', text: /267 Timing/ }))?.text).toContain('D 1/2')
    expect((await ui.find({ type: 'Text', text: /trail:/ }))?.text).toContain('D1 · done')

    await ui.press({ key: 'sprint-resume' })
    await ui.unmount()
  }
  expect(submitted).toEqual(['/sprint S36', '/sprint S36', '/sprint S36'])
})

test('the band names the milestone and sprint and offers the project update', async ($, on) => {
  project(on)
  const submitted: string[] = []
  on('command.run', (_, e) => {
    submitted.push(`/${e.command} ${e.args}`.trim())
    return { text: '' }
  })
  on('ui.toast', () => ({ value: undefined }))
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'refresh' })
  await pane.unmount()

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /11\.5/ }))?.text).toContain('S36 in-progress 1/2')
  await ui.press({ key: 'update-ai-scrum' })
  expect(submitted).toEqual(['/ai-scrum:setup'])
  await ui.unmount()
})

test('a subagent shows with its activity while it runs, and as done after', async ($, on) => {
  project(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', () => ({ text: 'ok', reason: 'answer' }))
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })

  await $.agent.spawn({
    tool_use_id: 't1',
    prompt: 'Build D2 of 267',
    description: 'build 267 D2',
    subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
  })
  await $.tool.call({ tool: 'Edit', file_path: '/proj/src/lanes/map.ts', old_string: 'a', new_string: 'b', agentId: 'a1' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'refresh' })
  expect((await ui.find({ key: 'a-a1' }))?.text).toContain('build 267 D2')
  expect((await ui.find({ key: 'a-a1' }))?.text).toContain('Edit lanes/map.ts')
  await ui.unmount()
})

test('an old roadmap with a heading per milestone, and accepted counts as done', () => {
  const roadmap = parseRoadmap(
    [
      '## Current phase: 3 — Accuracy & breadth',
      '',
      '### M5 — Exact context windows — ✔ accepted (2026-08-23)',
      'Sprints: [S05](sprints/done/S05/sprint.md) — `done`; see [review](sprints/done/S05/review.md)',
      '### M7 — Second agent — planned',
      '',
      '## Open / unprioritised',
    ].join('\n'),
  )

  expect(roadmap.phase).toBe('3 — Accuracy & breadth')
  expect(roadmap.milestones.map(m => `${m.id}|${m.name}|${m.sprints.join(',')}`)).toEqual([
    'M5|Exact context windows|S05',
    'M7|Second agent|',
  ])
  expect(isDone(roadmap.milestones[0]?.status ?? '')).toBe(true)
  expect(isDone('accepted')).toBe(true)
  expect(isDone('planned')).toBe(false)
})

test('a running sprint names the current milestone even when the roadmap still says planned', async () => {
  const snap = await scan(reader, '/proj', 0)
  const lagging = {
    ...snap,
    milestones: snap.milestones.map(m => (m.id === '11.5' ? { ...m, status: 'planned' } : m)),
  }

  expect(currentMilestone(lagging)?.id).toBe('11.5')
})
