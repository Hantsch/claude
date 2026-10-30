import type {
  Branching,
  Launch,
  Milestone,
  ReleaseProfile,
  ReleaseRecord,
  ReleaseState,
  ScrumPlugin,
  Snapshot,
  Sprint,
  SprintFlow,
  SprintStory,
  Story,
  VersionCheck,
} from '../types'

// What the scanner needs from the engine, so it runs the same in a test.
// `read` answers null for a missing file, `list` an empty list for a missing
// directory.
export type Reader = {
  read: (path: string) => Promise<string | null>
  list: (path: string) => Promise<{ name: string; isDir: boolean; mtimeMs?: number }[]>
  // The Claude Code config directory (~/.claude or CLAUDE_CONFIG_DIR).
  configDir: string | null
}

const PLUGINS: ScrumPlugin[] = ['ai-scrum', 'tech-rules']
const COMMANDS = ['refine', 'build', 'sprint', 'roadmap', 'concept', 'release-check']

const lines = (text: string) => text.split(/\r?\n/)

const stripLinks = (text: string) =>
  text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/`/g, '')

const isPlaceholder = (text: string) => /^\s*<.*>?\s*$/.test(text) || text.includes('<')

export function frontmatter(text: string): Record<string, string> {
  const all = lines(text)
  const out: Record<string, string> = {}
  if (all[0]?.trim() !== '---') return out
  for (const line of all.slice(1)) {
    if (line.trim() === '---') break
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (m?.[1] !== undefined) out[m[1]] = (m[2] ?? '').replace(/(^|\s+)#.*$/, '').trim()
  }
  return out
}

// The lines under the first `## ` heading that matches, up to the next one.
export function section(text: string, heading: RegExp): { title: string; body: string[] } | null {
  const all = lines(text)
  const start = all.findIndex(l => /^##\s/.test(l) && heading.test(l.replace(/^##\s+/, '')))
  if (start < 0) return null
  const rest = all.slice(start + 1)
  const end = rest.findIndex(l => /^##\s/.test(l))
  return {
    title: (all[start] ?? '').replace(/^##\s+/, '').trim(),
    body: end < 0 ? rest : rest.slice(0, end),
  }
}

// The first markdown table in `body`, cells trimmed, separator rows dropped.
export function table(body: string[]): { header: string[]; rows: string[][] } {
  const cells = (l: string) =>
    l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
  const start = body.findIndex(l => l.trim().startsWith('|'))
  if (start < 0) return { header: [], rows: [] }
  const block: string[] = []
  for (const l of body.slice(start)) {
    if (!l.trim().startsWith('|')) break
    block.push(l)
  }
  const [head, ...rest] = block
  return {
    header: head === undefined ? [] : cells(head),
    rows: rest.filter(l => !/^[\s|:-]+$/.test(l)).map(cells),
  }
}

const column = (header: string[], name: RegExp) => header.findIndex(h => name.test(h))

const at = (row: string[], index: number) => (index < 0 ? '' : (row[index] ?? ''))

export function parseRoadmap(text: string) {
  const current = section(text, /^Current phase/i)
  const milestones: Milestone[] = []
  let phase: string | null = null
  if (current !== null) {
    const named = current.title.replace(/^Current phase:?\s*/i, '').trim()
    const firstLine = current.body.find(l => l.trim() !== '' && !l.trim().startsWith('|'))
    phase = named !== '' ? named : firstLine === undefined ? null : stripLinks(firstLine).trim()
    const { header, rows } = table(current.body)
    const name = column(header, /milestone/i)
    const status = column(header, /status/i)
    const sprint = column(header, /sprint/i)
    const note = column(header, /note/i)
    for (const row of rows) {
      const id = at(row, 0)
      if (id === '' || isPlaceholder(id)) continue
      milestones.push({
        id,
        name: stripLinks(at(row, name)),
        status: stripLinks(at(row, status)).replace(/\*/g, ''),
        sprints: at(row, sprint).match(/S\d+/g) ?? [],
        note: stripLinks(at(row, note)),
      })
    }
    // Roadmaps from before ai-scrum 4 give each milestone a heading,
    // `### M5 — Name — ✔ accepted (date)`, and a `Sprints:` line below it.
    if (rows.length === 0) {
      current.body.forEach((l, i) => {
        const m = /^###\s+(M[\w.]+)\s+[—–-]\s+(.*)$/.exec(l)
        if (m?.[1] === undefined) return
        const parts = (m[2] ?? '').split(/\s+[—–]\s+/)
        const next = current.body.slice(i + 1).findIndex(x => /^###\s/.test(x))
        const block = current.body.slice(i + 1, next < 0 ? undefined : i + 1 + next)
        const sprintLine = block.find(x => /^Sprints?:/i.test(x)) ?? ''
        milestones.push({
          id: m[1],
          name: stripLinks(parts[0] ?? ''),
          status: stripLinks(parts.slice(1).join(' — ')) || 'planned',
          sprints: sprintLine.match(/S\d+/g)?.filter((s, j, all) => all.indexOf(s) === j) ?? [],
          note: '',
        })
      })
    }
  }
  const standing = (section(text, /^Where we stand/i)?.body ?? [])
    .map(l => stripLinks(l).replace(/^\s*[-*]\s+/, '').trim())
    .filter(l => l !== '' && !l.startsWith('<'))
  const openTopics = table(section(text, /^Open/i)?.body ?? []).rows
    .map(r => stripLinks(at(r, 0)))
    .filter(t => t !== '' && !isPlaceholder(t))
  const followUps = (section(text, /^Follow-ups/i)?.body ?? []).filter(
    l => /^\s*-\s+/.test(l) && !/^\s*-\s+</.test(l),
  ).length
  return { phase, milestones, standing, openTopics, followUps }
}

// Minutes since an arbitrary epoch, from a trail timestamp (`2026-10-28 10:41`,
// or a bare `09:52:01`); only differences between two of them mean anything.
export function clockMinutes(text: string): number | null {
  const m = /^(?:(\d{4})-(\d{2})-(\d{2})[ T])?(\d{1,2}):(\d{2})/.exec(text.trim())
  if (m === null) return null
  const day = m[1] === undefined ? 0 : Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 60_000
  return day + Number(m[4]) * 60 + Number(m[5])
}

// The `HH:mm` of a trail timestamp.
export const clockOf = (text: string | null) => (text === null ? null : (/\d{1,2}:\d{2}/.exec(text)?.[0] ?? text))

// Walks progress.md. Its lines are fixed by ai-scrum's sprint.md and build.md:
// `- <ts> · refine · 106 107 · started`, `- <ts> · 107 · build · started`,
// `- <ts> · 107 · D2 <title> · done`, `- <ts> · 107 · verify · started`,
// `- <ts> · 107 · review 1 · started`, `- <ts> · 107 · story · done`,
// `- <ts> · gate · e2e-all · started`, and `blocked: <reason>` for an event.
export function parseTrail(text: string | null, status: string): SprintFlow {
  const flow: SprintFlow = {
    phase: status === 'done' ? 'done' : status === 'in-progress' ? 'clarify' : 'planned',
    refineIds: [],
    focus: null,
    stage: null,
    step: null,
    stepAt: null,
    storyMinutes: {},
  }
  if (text === null || flow.phase !== 'clarify') return flow
  const began: Record<string, number> = {}
  for (const raw of lines(text)) {
    const parts = raw.replace(/^\s*[-*]\s*/, '').split(/\s+·\s+/)
    if (parts.length < 3) continue
    const at = parts[0] ?? ''
    const subject = parts[1] ?? ''
    const event = parts[parts.length - 1] ?? ''
    const what = parts.slice(2, -1).join(' · ')
    const isStart = event === 'started'
    if (subject === 'refine') {
      flow.phase = 'refine'
      flow.refineIds = what.match(/\d+/g) ?? []
      continue
    }
    if (subject === 'gate') {
      flow.phase = isStart ? 'gate' : 'review'
      flow.stage = null
      flow.step = what
      flow.stepAt = at
      continue
    }
    if (!/^\d+$/.test(subject)) continue
    flow.phase = 'build'
    if (flow.focus !== subject) {
      flow.focus = subject
      flow.step = null
      flow.stepAt = null
    }
    if (event.startsWith('blocked')) {
      flow.stage = 'blocked'
      flow.step = event.replace(/^blocked:?\s*/, '') || what
      flow.stepAt = at
    } else if (what === 'build') {
      flow.stage = 'implement'
      flow.stepAt = at
      const start = clockMinutes(at)
      if (isStart && start !== null) began[subject] = start
    } else if (what === 'story') {
      flow.stage = 'done'
      flow.step = null
      const start = began[subject]
      const end = clockMinutes(at)
      if (start !== undefined && end !== null && end >= start) flow.storyMinutes[subject] = end - start
    } else if (/^D\d+/.test(what)) {
      flow.stage = 'implement'
      flow.step = what
      if (isStart) flow.stepAt = at
    } else if (what === 'verify' || /^review\b/.test(what)) {
      flow.stage = what === 'verify' ? 'verify' : 'review'
      flow.step = what === 'verify' ? null : what
      if (isStart) flow.stepAt = at
    }
  }
  return flow
}

export function parseSprint(
  id: string,
  text: string,
  trail: string | null,
  progress: string | null = null,
  trailAt: number | null = null,
): Sprint {
  const fm = frontmatter(text)
  const heading = lines(text).find(l => /^#\s/.test(l)) ?? ''
  const title = heading.replace(/^#\s+/, '').replace(/^Sprint\s+\S+\s*[—–-]\s*/, '').trim()
  const stories: SprintStory[] = []
  for (const l of section(text, /^Stories/i)?.body ?? []) {
    const m = /^\s*-\s+\[([ xX])\]\s+(\d+)\s*[—–-]?\s*(.*)$/.exec(l)
    if (m?.[2] !== undefined) {
      stories.push({ id: m[2], title: stripLinks(m[3] ?? ''), isDone: m[1] !== ' ' })
    }
  }
  const status = fm['status'] || 'planned'
  return {
    id: fm['sprint'] || id,
    title: isPlaceholder(title) ? '' : title,
    status,
    milestone: fm['milestone'] ?? '',
    stories,
    lastTrail: trail,
    flow: parseTrail(progress, status),
    trailAt,
  }
}

// Walks `.git/ai-scrum/trail.md`, which `/sprint` phase 4 and `/release-check` write once
// progress.md is committed: `- <ts> · <SNN|-> · roadmap-check · started`, `… · done`,
// `- <ts> · S08 · release-check · started · watch <log>` and
// `- <ts> · S08 · release-check · done · releasable: yes · …`. The last line says what runs;
// the verdict is the last `release-check · done` line's, also while a later step runs.
export function parseReleaseTrail(text: string | null): ReleaseState | null {
  if (text === null) return null
  let state: ReleaseState | null = null
  let verdict: string | null = null
  for (const raw of lines(text)) {
    const parts = raw.replace(/^\s*[-*]\s*/, '').split(/\s+·\s+/)
    const [at = '', sprint = '', step = '', event = ''] = parts
    if (parts.length < 4 || !/^(roadmap|release)-check$/.test(step)) continue
    const detail = parts.slice(4).join(' · ')
    const isSame = state !== null && state.step === step && state.sprint === (sprint === '-' ? null : sprint)
    if (event === 'done' && step === 'release-check') verdict = detail === '' ? null : detail
    state = {
      sprint: sprint === '-' || sprint === '' ? null : sprint,
      step,
      isRunning: event === 'started',
      startedAt: event === 'started' ? at : isSame ? (state?.startedAt ?? null) : null,
      endedAt: event === 'started' ? null : at,
      watch: event === 'started' && detail.startsWith('watch ') ? detail.slice(6).trim() : null,
      verdict,
      kind: null,
    }
  }
  if (state === null) return null
  const kind = /releasable:\s*(yes|NO|UNVERIFIED)\b/.exec(verdict ?? '')?.[1]
  return { ...state, verdict, kind: kind === 'yes' || kind === 'NO' || kind === 'UNVERIFIED' ? kind : null }
}

// Sums up `.git/ai-scrum/release-checks.jsonl` the way `/release-check` B7 does: the streak
// counts closed records newest first, `green` and `not-confirmed` add one, `missed` and
// `confirmed` end it, `pending` and `superseded` are skipped; the rest is over the last ten.
export function parseReleaseRecord(text: string | null): ReleaseRecord | null {
  if (text === null) return null
  const records = lines(text)
    .filter(l => l.trim() !== '')
    .map(l => parseJson(l))
    .filter(r => typeof r === 'object' && r !== null)
  if (records.length === 0) return null
  const result = (r: unknown) => str(field(field(r, 'outcome'), 'result'))
  let streak = 0
  for (const r of [...records].reverse()) {
    const res = result(r)
    if (res === null || res === 'pending' || res === 'superseded') continue
    if (res !== 'green' && res !== 'not-confirmed') break
    streak += 1
  }
  const recent = records.slice(-10)
  const missed = recent
    .filter(r => result(r) === 'missed')
    .map(r => {
      const pr = str(field(field(r, 'outcome'), 'pr')) ?? ''
      const rel = str(field(field(r, 'outcome'), 'release')) ?? ''
      return {
        head: (str(field(r, 'head')) ?? '').slice(0, 7),
        at: str(field(r, 'at')) ?? '',
        red: pr.startsWith('red') ? pr : rel,
      }
    })
  return {
    streak,
    missed,
    notConfirmed: recent.filter(r => result(r) === 'not-confirmed').length,
    pending: recent.filter(r => result(r) === null || result(r) === 'pending').length,
    total: records.length,
  }
}

// A section's text as paragraphs: hard-wrapped lines joined, a list item or an
// empty line starting a new one, template placeholders and comments dropped.
export function paragraphs(body: string[]): string[] {
  const out: string[] = []
  let isOpen = false
  for (const raw of body) {
    const l = stripLinks(raw).replace(/\*\*/g, '').trim()
    if (l === '' || l.startsWith('<')) {
      isOpen = false
      continue
    }
    if (isOpen && !/^([-*]|\d+\.)\s/.test(l)) out[out.length - 1] += ` ${l}`
    else out.push(l)
    isOpen = true
  }
  return out
}

export function parseStory(fileName: string, text: string): Story {
  const fm = frontmatter(text)
  let done = 0
  let total = 0
  for (const l of section(text, /^Deliverables/i)?.body ?? []) {
    const m = /^\s*-\s+\[([ xX])\]\s+(?:\*\*)?D\d+(?:\*\*)?\s*[—–-]?\s*(.*)$/.exec(l)
    if (m === null) continue
    const rest = (m[2] ?? '').trim()
    if (rest.startsWith('<') || rest.startsWith('...')) continue
    total += 1
    if (m[1] !== ' ') done += 1
  }
  return {
    id: fm['id'] || (/^(\d+)/.exec(fileName)?.[1] ?? fileName),
    title: fm['title'] || fileName.replace(/\.md$/, ''),
    status: fm['status'] || 'draft',
    deliverablesDone: done,
    deliverablesTotal: total,
    requirement: paragraphs(section(text, /^Requirement/i)?.body ?? []),
    criteria: paragraphs(section(text, /^Acceptance Criteria/i)?.body ?? []),
  }
}

const lastLine = (text: string | null) => {
  if (text === null) return null
  const all = lines(text).filter(l => l.trim() !== '')
  return all[all.length - 1]?.trim() ?? null
}

const parseJson = (text: string | null): unknown => {
  if (text === null) return null
  try {
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
  } catch {
    return null
  }
}

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined

const str = (value: unknown) => (typeof value === 'string' ? value : null)

const samePath = (a: string, b: string) =>
  a.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() ===
  b.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map(n => parseInt(n, 10) || 0)
  const pb = b.split(/[.-]/).map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

async function versions(r: Reader, root: string): Promise<VersionCheck[]> {
  const installed = field(
    parseJson(r.configDir === null ? null : await r.read(`${r.configDir}/plugins/installed_plugins.json`)),
    'plugins',
  )
  const known = parseJson(
    r.configDir === null ? null : await r.read(`${r.configDir}/plugins/known_marketplaces.json`),
  )
  const out: VersionCheck[] = []
  for (const plugin of PLUGINS) {
    const lock = parseJson(await r.read(`${root}/.claude/${plugin}.lock`))
    const check: VersionCheck = {
      plugin,
      inProject: str(field(lock, `${plugin}-version`)),
      installed: null,
      latest: null,
      marketplace: null,
    }
    // A project or local install for this root wins over the user-wide one,
    // as it does in Claude Code.
    const keys = Object.keys(typeof installed === 'object' && installed !== null ? installed : {})
    for (const key of keys.filter(k => k.startsWith(`${plugin}@`))) {
      const entries = field(installed, key)
      if (!Array.isArray(entries)) continue
      const own = entries.find(
        en => str(field(en, 'scope')) !== 'user' && samePath(str(field(en, 'projectPath')) ?? '', root),
      )
      const user = entries.find(en => str(field(en, 'scope')) === 'user')
      const pick = own ?? user
      if (pick === undefined) continue
      check.installed = str(field(pick, 'version'))
      check.marketplace = key.slice(plugin.length + 1)
      if (own !== undefined) break
    }
    const location = check.marketplace === null ? null : str(field(field(known, check.marketplace), 'installLocation'))
    if (location !== null) {
      const listed = field(parseJson(await r.read(`${location}/.claude-plugin/marketplace.json`)), 'plugins')
      const entry = Array.isArray(listed) ? listed.find(p => field(p, 'name') === plugin) : undefined
      check.latest = str(field(entry, 'version'))
    }
    out.push(check)
  }
  return out
}

// A profile value: the text after `key:` up to a trailing `<!-- -->` comment.
export function profileValue(profile: string, key: string): string | null {
  const m = new RegExp(`^${key}:[ \\t]*(.*?)[ \\t]*(?:<!--.*)?\\r?$`, 'm').exec(profile)
  return m === null ? null : (m[1] ?? '').trim()
}

// The profile with `key` set to `value`, its comment and every other byte kept.
// A missing key goes after `after`, else under `## Branching`, else at the end.
export function withProfileValue(profile: string, key: string, value: string, after: string): string {
  const line = new RegExp(`^(${key}:[ \\t]*)(.*?)([ \\t]*<!--.*?)?(\\r?)$`, 'm')
  if (line.test(profile)) {
    return profile.replace(line, (_all, head: string, _old, comment: string | undefined, cr: string) => `${head}${value}${comment ?? ''}${cr}`)
  }
  const nl = profile.includes('\r\n') ? '\r\n' : '\n'
  const anchor =
    new RegExp(`^${after}:.*?(?=\\r?$)`, 'm').exec(profile) ??
    new RegExp(`^## Branching[ \\t]*(?=\\r?$)`, 'm').exec(profile)
  if (anchor === null) return `${profile}${profile === '' || profile.endsWith('\n') ? '' : nl}${key}: ${value}${nl}`
  const end = anchor.index + anchor[0].length
  return `${profile.slice(0, end)}${nl}${key}: ${value}${profile.slice(end)}`
}

export function parseBranching(profile: string, branches: string[]): Branching {
  const value = (key: string, fallback: string) => {
    const v = profileValue(profile, key)
    return v === null || v === '' ? fallback : v
  }
  return {
    base: value('branch-base', 'main'),
    isSprintBranch: value('sprint-branch', 'true') !== 'false',
    pattern: value('sprint-branch-pattern', 'sprint/{id}'),
    isAutoCommit: value('auto-commit-per-story', 'true') !== 'false',
    protectedBranches: value('protected-branches', '').split(/[\s,]+/).filter(b => b !== '' && b !== 'none'),
    branches,
  }
}

// The profile's `## Release` keys; a profile from before ai-scrum 4.10 has none of them.
export function parseReleaseProfile(profile: string): ReleaseProfile {
  const value = (key: string) => {
    const v = profileValue(profile, key)
    return v === null || v === '' ? null : v
  }
  return {
    branch: value('release-branch'),
    verify: value('release-verify'),
    plan: value('release-plan'),
    dryRun: value('release-dry-run'),
    changelogStyle: value('changelog-style'),
    commitStyle: value('commit-style'),
  }
}

// The repository's local branches, from the ref folders and packed-refs.
async function localBranches(r: Reader, root: string): Promise<string[]> {
  const out = new Set<string>()
  const walk = async (dir: string, prefix: string, depth: number) => {
    for (const entry of await r.list(dir)) {
      if (!entry.isDir) out.add(`${prefix}${entry.name}`)
      else if (depth < 3) await walk(`${dir}/${entry.name}`, `${prefix}${entry.name}/`, depth + 1)
    }
  }
  await walk(`${root}/.git/refs/heads`, '', 0)
  for (const m of ((await r.read(`${root}/.git/packed-refs`)) ?? '').matchAll(/^[0-9a-f]+ refs\/heads\/(\S+?)\r?$/gm)) {
    if (m[1] !== undefined) out.add(m[1])
  }
  return [...out].sort()
}

async function profilePaths(r: Reader, root: string) {
  const profile = (await r.read(`${root}/.claude/ai-scrum.md`)) ?? ''
  const value = (key: string, fallback: string) => {
    const m = new RegExp(`^${key}:\\s*(\\S+)`, 'm').exec(profile)
    return `${root}/${(m?.[1] ?? fallback).replace(/\/+$/, '')}`
  }
  return {
    requirements: value('requirements-path', 'docs/requirements'),
    sprints: value('sprints-path', 'docs/sprints'),
    roadmap: value('roadmap-path', 'docs/ROADMAP.md'),
  }
}

export async function scan(r: Reader, root: string, now: number): Promise<Snapshot> {
  const paths = await profilePaths(r, root)
  const roadmapText = await r.read(paths.roadmap)
  const roadmap = roadmapText === null ? null : parseRoadmap(roadmapText)

  const sprints: Sprint[] = []
  const sprintDirs = await r.list(paths.sprints)
  for (const dir of sprintDirs.filter(d => d.isDir && /^S\d+$/.test(d.name))) {
    const text = await r.read(`${paths.sprints}/${dir.name}/sprint.md`)
    if (text === null) continue
    const status = frontmatter(text)['status'] ?? ''
    const progress = status === 'done' ? null : await r.read(`${paths.sprints}/${dir.name}/progress.md`)
    const trailAt =
      progress === null
        ? null
        : ((await r.list(`${paths.sprints}/${dir.name}`)).find(f => f.name === 'progress.md')?.mtimeMs ?? null)
    sprints.push(parseSprint(dir.name, text, lastLine(progress), progress, trailAt))
  }
  sprints.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
  const doneSprints = (await r.list(`${paths.sprints}/done`)).filter(d => d.isDir).length

  const stories: Story[] = []
  const storyFiles = await r.list(paths.requirements)
  for (const file of storyFiles.filter(f => !f.isDir && /^\d+.*\.md$/.test(f.name))) {
    const text = await r.read(`${paths.requirements}/${file.name}`)
    if (text !== null) stories.push(parseStory(file.name, text))
  }
  stories.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
  const doneStories = (await r.list(`${paths.requirements}/done`)).filter(
    f => !f.isDir && /^\d+.*\.md$/.test(f.name),
  ).length

  const profile = await r.read(`${root}/.claude/ai-scrum.md`)
  const branching = profile === null ? null : parseBranching(profile, await localBranches(r, root))

  // Phase 4 runs after the review commit has moved the sprint to done/ and set it done, so
  // its state is in `.git/ai-scrum/`, not in the sprint's progress.md.
  const release = parseReleaseTrail(await r.read(`${root}/.git/ai-scrum/trail.md`))
  const record = parseReleaseRecord(await r.read(`${root}/.git/ai-scrum/release-checks.jsonl`))
  let releasing: Sprint | null = null
  const releaseSprint = release?.isRunning === true ? release.sprint : null
  if (releaseSprint !== null && !sprints.some(s => s.id === releaseSprint && s.status === 'in-progress')) {
    const text =
      (await r.read(`${paths.sprints}/done/${releaseSprint}/sprint.md`)) ??
      (await r.read(`${paths.sprints}/${releaseSprint}/sprint.md`))
    if (text !== null) {
      const done = parseSprint(releaseSprint, text, null)
      releasing = {
        ...done,
        flow: { ...done.flow, phase: 'release', step: release?.step ?? null, stepAt: release?.startedAt ?? null },
      }
    }
  }

  const launch: Record<string, Launch> = {}
  for (const name of COMMANDS) {
    const fm = frontmatter((await r.read(`${root}/.claude/commands/${name}.md`)) ?? '')
    launch[name] = { model: fm['model'] ?? null, effort: fm['effort'] ?? null }
  }

  // A sprint from before the trail rules, already past its refine round:
  // the first unticked story is the one being built.
  for (const sprint of sprints) {
    const isRefined = sprint.stories.every(st => stories.find(s => s.id === st.id)?.status !== 'draft')
    if (sprint.flow.phase === 'clarify' && sprint.lastTrail === null && sprint.stories.length > 0 && isRefined) {
      sprint.flow = { ...sprint.flow, phase: 'build', focus: sprint.stories.find(st => !st.isDone)?.id ?? null }
    }
  }

  const checks = await versions(r, root)
  const hasLock = checks.some(c => c.plugin === 'ai-scrum' && c.inProject !== null)

  return {
    root,
    hasScrum: hasLock || roadmapText !== null || sprintDirs.length > 0,
    versions: checks,
    phase: roadmap?.phase ?? null,
    standing: roadmap?.standing ?? [],
    milestones: roadmap?.milestones ?? [],
    sprints,
    doneSprints,
    stories,
    doneStories,
    openTopics: roadmap?.openTopics ?? [],
    followUps: roadmap?.followUps ?? 0,
    launch,
    branching,
    releaseProfile: profile === null ? null : parseReleaseProfile(profile),
    releasing,
    release,
    record,
    readAt: now,
  }
}

// --- What the views derive from a snapshot ---

export type UpdateHint = { plugin: ScrumPlugin; text: string; command: string | null }

// Two kinds: the plugin itself is behind the marketplace (only the person can
// run /plugin), or the project's copy is behind the installed plugin (setup
// brings it up, so it gets a button).
export function updateHints(snap: Snapshot): UpdateHint[] {
  const hints: UpdateHint[] = []
  for (const v of snap.versions) {
    if (v.installed !== null && v.latest !== null && compareVersions(v.latest, v.installed) > 0) {
      hints.push({
        plugin: v.plugin,
        text: `${v.plugin} ${v.installed} -> ${v.latest} available: /plugin update, then /reload-plugins`,
        command: null,
      })
    }
    if (v.inProject !== null && v.installed !== null && compareVersions(v.installed, v.inProject) > 0) {
      hints.push({
        plugin: v.plugin,
        text: `${v.plugin} in this project is ${v.inProject}, plugin is ${v.installed}`,
        command: `/${v.plugin}:setup`,
      })
    }
    if (v.plugin === 'ai-scrum' && v.inProject === null && v.installed !== null && snap.hasScrum) {
      hints.push({ plugin: v.plugin, text: 'ai-scrum docs found but no lock file', command: '/ai-scrum:setup' })
    }
  }
  return hints
}

export const isRunning = (status: string) => /in.progress|▶/i.test(status)
export const isDone = (status: string) => /\b(done|accepted)\b|✔|✓/i.test(status)

// The sprint the cockpit follows: a running one, else a finished one still in its phase 4,
// else the next planned one.
export const activeSprint = (snap: Snapshot) =>
  snap.sprints.find(s => s.status === 'in-progress') ??
  snap.releasing ??
  snap.sprints.find(s => s.status === 'planned') ??
  null

// A running sprint names the milestone best: the roadmap row is often only
// updated at the sprint's end.
export function currentMilestone(snap: Snapshot): Milestone | null {
  const running = snap.sprints.find(s => s.status === 'in-progress')
  const ofSprint =
    running === undefined
      ? undefined
      : snap.milestones.find(
          m => m.sprints.includes(running.id) || running.milestone.startsWith(`${m.id} `) || running.milestone === m.id,
        )
  return (
    ofSprint ??
    snap.milestones.find(m => isRunning(m.status)) ??
    snap.milestones.find(m => !isDone(m.status)) ??
    null
  )
}

// Milestones the roadmap lists as not done that no sprint covers yet.
export const unplannedMilestones = (snap: Snapshot) =>
  snap.milestones.filter(m => !isDone(m.status) && !isRunning(m.status) && m.sprints.length === 0)

// Open stories no sprint that is not done lists.
export function unplannedStories(snap: Snapshot): Story[] {
  const planned = new Set(
    snap.sprints.filter(s => s.status !== 'done').flatMap(s => s.stories.map(st => st.id)),
  )
  return snap.stories.filter(s => s.status !== 'done' && !planned.has(s.id))
}

// The command that moves a story on, by its status.
export function storyCommand(story: Story): { label: string; command: string; name: string } {
  if (story.status === 'draft') return { label: 'Refine', command: `/refine ${story.id}`, name: 'refine' }
  return { label: story.status === 'in-progress' ? 'Resume' : 'Build', command: `/build ${story.id}`, name: 'build' }
}

// The refine round's stories, split into refined and still refining; a story
// already moved to done/ counts as refined.
export function refineProgress(snap: Snapshot, sprint: Sprint) {
  const ids = sprint.flow.refineIds.length > 0 ? sprint.flow.refineIds : sprint.stories.map(s => s.id)
  const status = new Map(snap.stories.map(s => [s.id, s.status] as const))
  const refined = ids.filter(id => (status.get(id) ?? 'done') !== 'draft')
  return { ids, refined, open: ids.filter(id => !refined.includes(id)) }
}

// The story ids an agent could be working on: the open sprints' and the open stories.
export const knownStoryIds = (snap: Snapshot | null) =>
  snap === null
    ? []
    : [...snap.sprints.flatMap(s => s.stories.map(st => st.id)), ...snap.stories.map(s => s.id)]

// The first known story id that `text` names as a number of its own.
export function storyIdIn(text: string, ids: string[]): string | null {
  return (text.match(/\d+/g) ?? []).find(n => ids.includes(n)) ?? null
}

// "Waiting on the user: a; b; c." from "Where we stand", as single items.
export function waitingItems(standing: string[]): string[] {
  return standing
    .filter(l => /^waiting on\b/i.test(l))
    .flatMap(l => l.replace(/^waiting on[^:]*:\s*/i, '').split(/;\s*/))
    .map(t => t.trim().replace(/\.$/, ''))
    .filter(t => t !== '')
}

export const launchLabel = (snap: Snapshot, name: string) => {
  const l = snap.launch[name]
  if (l === undefined || l.model === null) return ''
  return l.effort === null ? l.model : `${l.model}/${l.effort}`
}
