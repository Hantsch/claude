/**
 * What a project card says, derived from a `ProjectScrumSummary` (CONCEPT §7). Pure: the
 * components only lay these values out, so the wording and the thresholds live in one place
 * and are testable without a renderer. The wording follows the scrum-cockpit pane.
 */

import type {
  ProjectScrumSummary,
  ScrumSprint,
  ScrumSprintPhase,
  ScrumStoryStage,
} from '../../core/scrum/types.ts';
import { formatAge } from './format.ts';

export type Tone = 'ok' | 'warn' | 'bad' | 'dim' | 'info';

export interface Row {
  text: string;
  tone: Tone | null;
}

/** A bar of `cells` cells, `filled` of them lit. */
export interface Meter {
  cells: number;
  filled: number;
  /** 0..1, clamped. */
  fraction: number;
  tone: Tone;
}

export const METER_CELLS = 10;

/** Amber from this share of the limit, red at it (cockpit REFERENCE: tech debt). */
export const METER_WARN_FRACTION = 0.8;

/**
 * `value / limit` as a bar. Null when there is no limit to measure against (limit 0: the cockpit
 * shows no bar and the value is never due). Ok below 80 %, warn from 80 %, bad at the limit.
 */
export function meter(value: number, limit: number): Meter | null {
  if (!(limit > 0)) return null;
  const raw = Math.max(0, value) / limit;
  const fraction = Math.min(1, raw);
  // A value above zero lights at least one cell, so "1 / 20" is not drawn as empty.
  const filled = value > 0 ? Math.max(1, Math.round(fraction * METER_CELLS)) : 0;
  const tone: Tone = raw >= 1 ? 'bad' : raw >= METER_WARN_FRACTION ? 'warn' : 'ok';
  return { cells: METER_CELLS, filled: Math.min(METER_CELLS, filled), fraction, tone };
}

export function phaseRow(scrum: ProjectScrumSummary): Row {
  if (scrum.phase === null) return { text: 'no roadmap', tone: 'dim' };
  const total = scrum.milestonesTotal;
  const milestones = `${scrum.milestonesDone}/${total} milestone${total === 1 ? '' : 's'}`;
  // A roadmap far from the template can hand back a table rule (`---`) as the phase name.
  if (!/[\p{L}\p{N}]/u.test(scrum.phase)) return { text: milestones, tone: null };
  return {
    text: `${scrum.phase} · ${milestones}`,
    tone: null,
  };
}

/** `roadmap-check` -> `roadmap check`. */
function stepLabel(step: string): string {
  return step.replace(/-/g, ' ');
}

export function releaseRow(scrum: ProjectScrumSummary): Row & { detail: string | null } {
  const release = scrum.release;
  if (release?.isRunning) {
    return { text: `checking · ${stepLabel(release.step)}`, tone: 'info', detail: null };
  }
  if (!release || release.kind === null || release.kind === 'not tracked') {
    return { text: 'not tracked', tone: 'dim', detail: null };
  }
  const detail = release.verdict;
  switch (release.kind) {
    case 'yes':
      return { text: '✓ yes', tone: 'ok', detail };
    case 'NO':
      return { text: '✗ NO', tone: 'bad', detail };
    case 'UNVERIFIED':
      return { text: 'UNVERIFIED', tone: 'warn', detail };
  }
}

export interface MeterRow {
  text: string;
  meter: Meter | null;
  /** The limit is reached (tech debt) or the review is due (architect). */
  due: boolean;
}

export function techDebtRow(scrum: ProjectScrumSummary): MeterRow {
  const { count, limit, due } = scrum.techDebt;
  if (!(limit > 0)) return { text: `${count} · no limit`, meter: null, due: false };
  return { text: `${count} / ${limit}`, meter: meter(count, limit), due };
}

/** Null when the project has no architect cadence (`every` is 0): the row is hidden. */
export function architectRow(scrum: ProjectScrumSummary): (MeterRow & { lastReview: string }) | null {
  const { since, every, due, lastReview } = scrum.architect;
  if (!(every > 0)) return null;
  return {
    text: `${since} / ${every}`,
    meter: meter(since, every),
    due,
    lastReview: lastReview ? `last review ${lastReview}` : 'never reviewed',
  };
}

export function backlogText(scrum: ProjectScrumSummary): string {
  const { open, ready, unplanned } = scrum.backlog;
  return `${open} open · ${ready} ready · ${unplanned} unplanned`;
}

export function nextRow(scrum: ProjectScrumSummary): Row {
  const next = scrum.nextPlanned;
  if (!next) return { text: 'none planned', tone: 'dim' };
  return {
    text: `${next.id} planned · ${next.storyCount} stor${next.storyCount === 1 ? 'y' : 'ies'}`,
    tone: null,
  };
}

// --- The running sprint ---

export const STEPPER_PHASES = ['clarify', 'refine', 'build', 'gate', 'review', 'release'] as const;
export type StepperPhase = (typeof STEPPER_PHASES)[number];

export type StepState = 'done' | 'current' | 'todo';

export interface Step {
  phase: StepperPhase;
  label: string;
  state: StepState;
}

const PHASE_LABEL: Record<StepperPhase, string> = {
  clarify: 'Clarify',
  refine: 'Refine',
  build: 'Build',
  gate: 'Gate',
  review: 'Review',
  release: 'Release',
};

/**
 * The six phases with the current one marked. `planned` has not started, so nothing is lit;
 * `done` has passed all of them.
 */
export function stepper(phase: ScrumSprintPhase): Step[] {
  const at = (STEPPER_PHASES as readonly string[]).indexOf(phase);
  return STEPPER_PHASES.map((name, index) => {
    let state: StepState = 'todo';
    if (phase === 'done') state = 'done';
    else if (at >= 0) state = index < at ? 'done' : index === at ? 'current' : 'todo';
    return { phase: name, label: PHASE_LABEL[name], state };
  });
}

export interface StoryChip {
  id: string;
  title: string;
  state: 'done' | 'focus' | 'todo';
  /** `✓ 024`, `● 026`, `025`. */
  text: string;
}

export function storyChips(sprint: ScrumSprint): StoryChip[] {
  const focusId = sprint.focus?.id ?? null;
  return sprint.stories.map((story) => {
    const state = story.isDone ? 'done' : story.id === focusId ? 'focus' : 'todo';
    const mark = state === 'done' ? '✓ ' : state === 'focus' ? '● ' : '';
    return { id: story.id, title: story.title, state, text: `${mark}${story.id}` };
  });
}

const STAGE_LABEL: Record<ScrumStoryStage, string> = {
  implement: 'implementing',
  verify: 'verifying',
  review: 'in review',
  done: 'done',
  blocked: 'blocked',
};

export interface FocusLine {
  id: string;
  title: string;
  /** `implementing · D4 Migration`, empty when the trail names neither. */
  stage: string;
  blocked: boolean;
  /** `since 09:52:01`, null when the trail gave no time. */
  since: string | null;
}

export function focusLine(sprint: ScrumSprint): FocusLine | null {
  const focus = sprint.focus;
  if (!focus) return null;
  const parts: string[] = [];
  if (focus.stage) parts.push(STAGE_LABEL[focus.stage]);
  if (focus.step) parts.push(focus.step);
  return {
    id: focus.id,
    title: focus.title,
    stage: parts.join(' · '),
    blocked: focus.stage === 'blocked',
    since: focus.stepAt ? `since ${focus.stepAt}` : null,
  };
}

function minutesText(minutes: number): string {
  const whole = Math.max(1, Math.round(minutes));
  if (whole < 60) return `${whole} min`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** `~12 min left at 4m/story`; null until a story has finished or when nothing is left. */
export function timeLeftText(sprint: ScrumSprint): string | null {
  if (sprint.minutesLeft === null || sprint.avgStoryMinutes === null) return null;
  return `~${minutesText(sprint.minutesLeft)} left at ${Math.max(1, Math.round(sprint.avgStoryMinutes))}m/story`;
}

export interface TrailLine {
  text: string;
  /** `4m ago`, null when progress.md has no timestamp. */
  age: string | null;
  stalled: boolean;
}

/** The last trail line with its age; amber when the project's attention says the sprint stalled. */
export function trailLine(sprint: ScrumSprint, stalled: boolean, now: number): TrailLine | null {
  if (!sprint.lastTrail) return null;
  return {
    text: sprint.lastTrail,
    age: sprint.trailAt === null ? null : formatAge(Math.max(0, now - sprint.trailAt)),
    stalled,
  };
}

/** `S14 Build · 4/12 stories`, or `S03 Refine · 2/6 refined`. */
export function sprintHeadline(sprint: ScrumSprint): string {
  const phase = sprint.phase[0]!.toUpperCase() + sprint.phase.slice(1);
  return `${sprint.id} ${phase} · ${sprint.progress.done}/${sprint.progress.total} ${sprint.progress.unit}`;
}

// --- Head ---

export function hasWslHost(hosts: readonly string[]): boolean {
  return hosts.some((host) => host.startsWith('wsl:'));
}

/** Distro names of the WSL hosts, for the badge's tooltip. */
export function wslDistros(hosts: readonly string[]): string[] {
  return hosts.filter((host) => host.startsWith('wsl:')).map((host) => host.slice('wsl:'.length));
}
