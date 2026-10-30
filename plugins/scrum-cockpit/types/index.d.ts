export type ScrumPlugin = 'ai-scrum' | 'tech-rules'

// One plugin's three versions: what the project's lock records, what Claude
// Code has installed, and what the marketplace offers since its last refresh.
export type VersionCheck = {
  plugin: ScrumPlugin
  inProject: string | null
  installed: string | null
  latest: string | null
  marketplace: string | null
}

export type Milestone = {
  id: string
  name: string
  status: string
  sprints: string[]
  note: string
}

export type SprintStory = { id: string; title: string; isDone: boolean }

// Where a running sprint stands, read off its progress.md trail: the phase,
// and in the build phase the story in focus and the step it is on.
export type SprintPhase = 'planned' | 'clarify' | 'refine' | 'build' | 'gate' | 'review' | 'release' | 'done'

export type StoryStage = 'implement' | 'verify' | 'review' | 'done' | 'blocked'

export type SprintFlow = {
  phase: SprintPhase
  // The stories of the refine round, as its trail line names them.
  refineIds: string[]
  // The story the trail last names, while the sprint builds.
  focus: string | null
  stage: StoryStage | null
  // What the stage is on: `D4 Migration & Repository`, `review 2 (hard)`, a gate suite.
  step: string | null
  // The trail's own timestamp of the step's start, as written.
  stepAt: string | null
  // Minutes each finished story took, from `build · started` to `story · done`.
  storyMinutes: Record<string, number>
}

export type Sprint = {
  id: string
  title: string
  status: string
  milestone: string
  stories: SprintStory[]
  lastTrail: string | null
  flow: SprintFlow
  // When progress.md was last written (ms), the trail's heartbeat.
  trailAt: number | null
}

export type Story = {
  id: string
  title: string
  status: string
  deliverablesDone: number
  deliverablesTotal: number
  // The `## Requirement` and `## Acceptance Criteria` text, as paragraphs.
  requirement: string[]
  criteria: string[]
}

// The model and effort a project command runs with, from its frontmatter.
export type Launch = { model: string | null; effort: string | null }

// The profile's `## Branching` values, and the repository's local branches to pick from.
export type Branching = {
  base: string
  // `sprint-branch: false` commits on `base` itself; a profile without the key means true.
  isSprintBranch: boolean
  pattern: string
  isAutoCommit: boolean
  protectedBranches: string[]
  branches: string[]
}

// The release check as `.git/ai-scrum/trail.md` tells it: the last step `/sprint` phase 4 or
// `/release-check` started, whether it has ended, and the verdict it ended with.
export type ReleaseState = {
  // The sprint whose phase 4 it belongs to, null when it was run by hand.
  sprint: string | null
  // `roadmap-check` or `release-check`.
  step: string
  isRunning: boolean
  // The trail's own timestamp of the step's start, and of its end.
  startedAt: string | null
  endedAt: string | null
  // The log a running check writes to.
  watch: string | null
  // The last verdict line, `releasable: yes · …`, and its first word.
  verdict: string | null
  kind: 'yes' | 'NO' | 'UNVERIFIED' | null
}

// The verdicts in `.git/ai-scrum/release-checks.jsonl`, against what GitHub then did.
export type ReleaseRecord = {
  // Closed records, newest first, while GitHub was green.
  streak: number
  // `yes`, then red on GitHub: the head, the check's time and what went red.
  missed: { head: string; at: string; red: string }[]
  notConfirmed: number
  pending: number
  total: number
}

// The profile's `## Release` values, as written; null for a key the profile lacks.
export type ReleaseProfile = {
  branch: string | null
  verify: string | null
  plan: string | null
  dryRun: string | null
  changelogStyle: string | null
  commitStyle: string | null
}

export type Snapshot = {
  root: string
  hasScrum: boolean
  versions: VersionCheck[]
  phase: string | null
  standing: string[]
  milestones: Milestone[]
  sprints: Sprint[]
  doneSprints: number
  stories: Story[]
  doneStories: number
  openTopics: string[]
  followUps: number
  launch: Record<string, Launch>
  // Null when the project has no profile.
  branching: Branching | null
  releaseProfile: ReleaseProfile | null
  // A finished sprint (in done/) whose phase 4 is still running.
  releasing: Sprint | null
  release: ReleaseState | null
  record: ReleaseRecord | null
  readAt: number
}

export type AgentRow = {
  key: string
  agentId: string | null
  // The agent that spawned it, null for the main session's.
  parentId: string | null
  // The sprint story it works on, from its description, prompt or parent.
  storyId: string | null
  type: string
  description: string
  model: string | null
  effort: string | null
  status: 'running' | 'done' | 'failed'
  activity: string
  tools: number
  startedAt: number
  endedAt: number | null
  // Its last tool call: an agent quiet for minutes is worth a look.
  activeAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'scrum-cockpit': {
      snapshot: Shaped<Snapshot | null>
      agents: Shaped<AgentRow[]>
      isBandHidden: boolean
      // The story whose text the build card shows unfolded.
      openStory: string | null
    }
  }
}
