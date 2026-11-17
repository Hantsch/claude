/**
 * Snapshot to summary (CONCEPT §4): the cockpit mod's reading of a project, reduced to the plain
 * `ProjectScrumSummary` the tray, the popover and the main window share. Pure: the clock and
 * the "does a session of this project work" flag come in through `ctx`.
 */

import {
  currentMilestone,
  isArchitectDue,
  isDebtDue,
  isDone,
  refineProgress,
  unplannedStories,
  updateHints,
} from './parser.ts';
import type { Snapshot, Sprint } from './parser.ts';
import type {
  ProjectScrumSummary,
  ScrumFocus,
  ScrumSprint,
  ScrumSprintPhase,
  ScrumStoryStage,
} from './types.ts';

/** A running sprint whose trail has been silent this long is stalled: the sprint command's own "say it" threshold. */
export const STALL_MS = 15 * 60_000;

/**
 * A story that took longer than this is a trail artefact, not a duration: the parser measures
 * `build · started` to `story · done` with a clock that may or may not carry the date, and a
 * trail mixing `09:52:01` with `2026-11-17 09:52` yields differences of years.
 */
const MAX_STORY_MINUTES = 12 * 60;

export interface SummarizeContext {
  now: number;
  /** A session of this project is `working` right now: the sprint is not stalled, only quiet. */
  hasWorkingSession: boolean;
}

const PHASE_LABEL: Record<ScrumSprintPhase, string> = {
  planned: 'Planned',
  clarify: 'Clarify',
  refine: 'Refine',
  build: 'Build',
  gate: 'Gate',
  review: 'Review',
  release: 'Release',
  done: 'Done',
};

const STEP_LABEL: Record<string, string> = {
  'roadmap-check': 'Roadmap check',
  'release-check': 'Release check',
};

/** The story's step in a few characters: `D4/5`, `verify`, `review 2 (hard)`, `blocked`. */
function stepShort(stage: ScrumStoryStage | null, step: string | null, deliverables: number): string {
  if (stage === null) return '';
  if (stage === 'implement') {
    const n = /^D(\d+)/.exec(step ?? '')?.[1];
    if (n === undefined) return 'build';
    return deliverables > 0 ? `D${n}/${deliverables}` : `D${n}`;
  }
  if (stage === 'review') return step ?? 'review';
  return stage;
}

const stripBullet = (line: string | null) => (line === null ? null : line.replace(/^\s*[-*]\s*/, ''));

function sprintSummary(snap: Snapshot, sprint: Sprint): ScrumSprint {
  const flow = sprint.flow;
  const storiesDone = sprint.stories.filter((s) => s.isDone).length;
  const storiesTotal = sprint.stories.length;
  const refine = flow.phase === 'refine' ? refineProgress(snap, sprint) : null;
  const minutes = Object.values(flow.storyMinutes).filter((m) => m >= 0 && m <= MAX_STORY_MINUTES);
  const average = minutes.length === 0 ? null : minutes.reduce((sum, m) => sum + m, 0) / minutes.length;
  const left = storiesTotal - storiesDone;
  let focus: ScrumFocus | null = null;
  if (flow.phase === 'build' && flow.focus !== null) {
    const id = flow.focus;
    const story = snap.stories.find((s) => s.id === id);
    focus = {
      id,
      title: story?.title ?? sprint.stories.find((s) => s.id === id)?.title ?? '',
      stage: flow.stage,
      step: flow.step,
      stepAt: flow.stepAt,
    };
  }
  return {
    id: sprint.id,
    title: sprint.title,
    phase: flow.phase,
    storiesDone,
    storiesTotal,
    stories: sprint.stories.map((s) => ({ id: s.id, title: s.title, isDone: s.isDone })),
    progress:
      refine === null
        ? { done: storiesDone, total: storiesTotal, unit: 'stories' }
        : { done: refine.refined.length, total: refine.ids.length, unit: 'refined' },
    focus,
    trailAt: sprint.trailAt,
    avgStoryMinutes: average === null ? null : Math.round(average),
    minutesLeft: average === null || left <= 0 || flow.phase !== 'build' ? null : Math.round(average * left),
    lastTrail: stripBullet(sprint.lastTrail),
  };
}

/** `S14 Build 4/12 · 026 D4/5`, the same words the mod's band uses. */
function bandLine(snap: Snapshot, sprint: ScrumSprint | null, next: Sprint | undefined): string {
  const releasing = snap.releasing;
  if (sprint === null && releasing === null) {
    return next === undefined ? 'no sprint' : `no sprint · next ${next.id} planned`;
  }
  const parts: string[] = [];
  if (sprint !== null) {
    const label = PHASE_LABEL[sprint.phase];
    parts.push(
      sprint.phase === 'refine'
        ? `${sprint.id} ${label} ${sprint.progress.done}/${sprint.progress.total}`
        : `${sprint.id} ${label} ${sprint.storiesDone}/${sprint.storiesTotal}`,
    );
    if (sprint.focus !== null) {
      const deliverables = snap.stories.find((s) => s.id === sprint.focus?.id)?.deliverablesTotal ?? 0;
      parts.push(`${sprint.focus.id} ${stepShort(sprint.focus.stage, sprint.focus.step, deliverables)}`.trim());
    }
  } else if (releasing !== null) {
    const done = releasing.stories.filter((s) => s.isDone).length;
    parts.push(`${releasing.id} Release ${done}/${releasing.stories.length}`);
    const step = releasing.flow.step;
    if (step !== null) parts.push(STEP_LABEL[step] ?? step);
  }
  return parts.join(' · ');
}

export function summarize(snap: Snapshot, ctx: SummarizeContext): ProjectScrumSummary {
  const running = snap.sprints.find((s) => s.status === 'in-progress') ?? null;
  const sprint = running === null ? null : sprintSummary(snap, running);
  const next = snap.sprints.find((s) => s.status === 'planned');
  const milestone = currentMilestone(snap);
  const release = snap.release;
  const openStories = snap.stories.filter((s) => s.status !== 'done');

  const silentMs = sprint === null || sprint.trailAt === null ? 0 : ctx.now - sprint.trailAt;
  const stalled = sprint !== null && sprint.trailAt !== null && silentMs >= STALL_MS && !ctx.hasWorkingSession;
  const blockedStory = sprint?.focus?.stage === 'blocked' ? sprint.focus.id : null;

  return {
    projectPath: snap.root,
    hasScrum: snap.hasScrum,
    readAt: ctx.now,
    error: null,
    version: snap.versions.find((v) => v.plugin === 'ai-scrum')?.inProject ?? null,
    milestone: milestone === null ? null : { id: milestone.id, name: milestone.name },
    phase: snap.phase,
    milestonesDone: snap.milestones.filter((m) => isDone(m.status)).length,
    milestonesTotal: snap.milestones.length,
    sprint,
    releasing:
      snap.releasing === null
        ? null
        : { id: snap.releasing.id, title: snap.releasing.title, step: snap.releasing.flow.step },
    release:
      release === null
        ? null
        : {
            kind: release.kind,
            verdict: release.verdict,
            step: release.step,
            isRunning: release.isRunning,
            sprintId: release.sprint,
            endedAt: release.endedAt,
          },
    nextPlanned: next === undefined ? null : { id: next.id, storyCount: next.stories.length },
    sprintsDone: snap.doneSprints,
    techDebt: { count: snap.techDebt.count, limit: snap.techDebt.limit, due: isDebtDue(snap) },
    architect: {
      since: snap.architect.since,
      every: snap.architect.every,
      due: isArchitectDue(snap),
      lastReview: snap.architect.lastReview,
    },
    backlog: {
      open: openStories.length,
      ready: openStories.filter((s) => s.status === 'ready').length,
      unplanned: unplannedStories(snap).length,
    },
    updateHints: updateHints(snap).map((h) => ({ plugin: h.plugin, text: h.text, command: h.command })),
    attention: {
      stalled,
      stalledMinutes: stalled ? Math.floor(silentMs / 60_000) : 0,
      blocked: blockedStory !== null,
      blockedStory,
      releaseNo: release !== null && !release.isRunning && release.kind === 'NO',
      releaseMissed: (snap.record?.missed.length ?? 0) > 0,
    },
    bandLine: snap.hasScrum ? bandLine(snap, sprint, next) : '',
  };
}

/** A project that could not be read: nothing known, `error` says why. */
export function emptySummary(projectPath: string, readAt: number, error: string | null = null): ProjectScrumSummary {
  return {
    projectPath,
    hasScrum: false,
    readAt,
    error,
    version: null,
    milestone: null,
    phase: null,
    milestonesDone: 0,
    milestonesTotal: 0,
    sprint: null,
    releasing: null,
    release: null,
    nextPlanned: null,
    sprintsDone: 0,
    techDebt: { count: 0, limit: 0, due: false },
    architect: { since: 0, every: 0, due: false, lastReview: null },
    backlog: { open: 0, ready: 0, unplanned: 0 },
    updateHints: [],
    attention: {
      stalled: false,
      stalledMinutes: 0,
      blocked: false,
      blockedStory: null,
      releaseNo: false,
      releaseMissed: false,
    },
    bandLine: '',
  };
}
