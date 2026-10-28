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

export type Sprint = {
  id: string
  title: string
  status: string
  milestone: string
  stories: SprintStory[]
  lastTrail: string | null
}

export type Story = {
  id: string
  title: string
  status: string
  deliverablesDone: number
  deliverablesTotal: number
}

// The model and effort a project command runs with, from its frontmatter.
export type Launch = { model: string | null; effort: string | null }

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
  readAt: number
}

export type AgentRow = {
  key: string
  agentId: string | null
  type: string
  description: string
  model: string | null
  effort: string | null
  status: 'running' | 'done' | 'failed'
  activity: string
  tools: number
  startedAt: number
  endedAt: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'scrum-cockpit': {
      snapshot: Shaped<Snapshot | null>
      agents: Shaped<AgentRow[]>
      isBandHidden: boolean
    }
  }
}
