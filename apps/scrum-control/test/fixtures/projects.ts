/** Builders for the projects tests: a session view and a scrum summary with only the interesting fields set. */

import { normalizePathKey } from '../../src/core/adapters/claude/paths.ts';
import type { SessionStatus } from '../../src/core/model/status.ts';
import type { SessionView } from '../../src/core/model/types.ts';
import { folderBaseName } from '../../src/core/projects/titles.ts';
import { emptySummary } from '../../src/core/scrum/summarize.ts';
import type { ProjectScrumSummary, ScrumSprint } from '../../src/core/scrum/types.ts';

export const NOW = Date.UTC(2026, 10, 17, 12, 0, 0);

/** A live session in `path` (a Windows path - what `ProjectRef.path` holds, WSL cwds already mapped). */
export function sessionIn(
  path: string,
  status: SessionStatus = 'working',
  overrides: Partial<SessionView> = {},
): SessionView {
  const key = normalizePathKey(path);
  return {
    sessionId: `s-${key}-${status}-${overrides.host ?? 'windows'}`,
    name: 'session',
    title: null,
    status,
    statusReason: 'test',
    statusSource: 'inferred',
    waitingFor: null,
    statusSince: NOW,
    seen: false,
    dismissed: false,
    muted: false,
    project: { path, name: folderBaseName(path), key },
    branch: 'main',
    groupKey: `${key}::main`,
    model: 'claude-opus-5',
    entrypoint: 'claude-vscode',
    host: 'windows',
    pid: 1,
    alive: true,
    startedAt: NOW,
    lastActivityAt: NOW,
    run: null,
    pendingTool: null,
    context: null,
    subagents: [],
    lastAssistantText: null,
    transcriptPath: null,
    cwd: path,
    agentVersion: '2.1.222',
    ...overrides,
  };
}

export function sprint(overrides: Partial<ScrumSprint> = {}): ScrumSprint {
  return {
    id: 'S14',
    title: 'Login',
    phase: 'build',
    storiesDone: 4,
    storiesTotal: 12,
    stories: [],
    progress: { done: 4, total: 12, unit: 'stories' },
    focus: null,
    trailAt: NOW,
    avgStoryMinutes: null,
    minutesLeft: null,
    lastTrail: null,
    ...overrides,
  };
}

/** A project with ai-scrum, optionally mid-sprint. */
export function scrumSummary(path: string, overrides: Partial<ProjectScrumSummary> = {}): ProjectScrumSummary {
  return { ...emptySummary(path, NOW), hasScrum: true, bandLine: 'no sprint', ...overrides };
}

export function plainSummary(path: string): ProjectScrumSummary {
  return emptySummary(path, NOW);
}

/** Summaries keyed the way the monitor keys them. */
export function summaryMap(...summaries: ProjectScrumSummary[]): Map<string, ProjectScrumSummary> {
  return new Map(summaries.map((summary) => [normalizePathKey(summary.projectPath), summary]));
}
