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
import { milestoneLabel } from './projectRows.ts';

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
  /** The story's deliverables as a bar, null when its story file lists none. */
  deliverables: { done: number; total: number; meter: Meter } | null;
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
    deliverables: deliverablesOf(focus),
  };
}

function deliverablesOf(focus: { deliverablesDone: number; deliverablesTotal: number }): FocusLine['deliverables'] {
  const total = focus.deliverablesTotal;
  if (!(total > 0)) return null;
  const done = Math.min(Math.max(focus.deliverablesDone, 0), total);
  // One cell per deliverable up to ten, else scaled. Progress, not a limit: never amber or red.
  const cells = Math.min(total, METER_CELLS);
  const filled = total <= METER_CELLS ? done : Math.round((done / total) * METER_CELLS);
  return { done, total, meter: { cells, filled, fraction: done / total, tone: 'ok' } };
}

// --- The popover's phase strip ---

/**
 * Short names for the phases that are not current, so all six fit one popover line. Three letters,
 * not two: `Rl` reads as `RI` in the UI font.
 */
const PHASE_SHORT: Record<StepperPhase, string> = {
  clarify: 'Cla',
  refine: 'Ref',
  build: 'Bld',
  gate: 'Gate',
  review: 'Rev',
  release: 'Rel',
};

export interface StripStep extends Step {
  /** The full name for the current phase, the short one for the others. */
  text: string;
}

/**
 * The popover row's compact sprint state: the sprint id, all six phases by name - the current one
 * in full, the others short, done ones ticked - and, while it builds, the stories done:
 * `S23 ✓Cla ✓Ref [Build 4/6] Gate Rev Rel`. Null without a running sprint or phase 4; the row then shows
 * its band line (`no sprint`).
 */
export interface PhaseStrip {
  sprintId: string;
  steps: StripStep[];
  /** `Build`, `Refine`, `Planned`, `Done`, `Release` - shown on its own only when no step is current. */
  label: string;
  /** `4/6` stories done, only in Build. */
  count: string | null;
  /** Every phase with its state, for the tooltip. */
  title: string;
}

export function phaseStrip(scrum: ProjectScrumSummary | null): PhaseStrip | null {
  if (!scrum) return null;
  const sprint = scrum.sprint;
  let id: string;
  let phase: ScrumSprintPhase;
  let count: string | null = null;
  if (sprint) {
    id = sprint.id;
    phase = sprint.phase;
    if (phase === 'build') count = `${sprint.storiesDone}/${sprint.storiesTotal}`;
  } else if (scrum.releasing) {
    id = scrum.releasing.id;
    phase = 'release';
  } else {
    return null;
  }
  const steps = stepper(phase).map((step) => ({
    ...step,
    text: step.state === 'current' ? step.label : PHASE_SHORT[step.phase],
  }));
  const label = phase[0]!.toUpperCase() + phase.slice(1);
  const title = steps
    .map((step) => (step.state === 'done' ? `✓ ${step.label}` : step.state === 'current' ? `● ${step.label}` : step.label))
    .join(' · ');
  return { sprintId: id, steps, label, count, title };
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

// --- The compact row ---

/** One cell of a project's one-line row. */
export interface Cell {
  text: string;
  tone: Tone | null;
  /** The longer wording, for the tooltip. */
  title: string | null;
}

/**
 * The Projects tab's collapsed row: one line per project, every cell already worded. The
 * expanded card below it still shows everything; this is what fits a glance across all of them.
 */
export interface CompactRow {
  /** `S14 Build · 4/12 stories`, `S41 Release`, or `no sprint` (dim). */
  sprint: Cell;
  /** Sprint progress 0..100, null without a running sprint. */
  percent: number | null;
  /** The sprint's title, else the milestone; null when neither is known. */
  title: string | null;
  release: Cell | null;
  debt: Cell | null;
  architect: Cell | null;
  /** Age of the last trail line (`4m ago`), null without one. */
  age: string | null;
  stalled: boolean;
}

function meterTone(row: MeterRow): Tone | null {
  if (row.due) return 'bad';
  return row.meter && row.meter.tone !== 'ok' ? row.meter.tone : null;
}

export function compactRow(scrum: ProjectScrumSummary | null, now: number): CompactRow {
  if (!scrum) {
    return {
      sprint: { text: '—', tone: 'dim', title: 'No ai-scrum state in this folder' },
      percent: null,
      title: null,
      release: null,
      debt: null,
      architect: null,
      age: null,
      stalled: false,
    };
  }

  const sprint = scrum.sprint;
  let sprintCell: Cell;
  let percent: number | null = null;
  if (sprint) {
    sprintCell = { text: sprintHeadline(sprint), tone: scrum.attention.blocked ? 'warn' : null, title: null };
    const { done, total } = sprint.progress;
    if (total > 0) percent = Math.round((Math.min(Math.max(done, 0), total) / total) * 100);
  } else if (scrum.releasing) {
    sprintCell = { text: `${scrum.releasing.id} Release`, tone: 'info', title: 'phase 4 running' };
  } else {
    sprintCell = { text: 'no sprint', tone: 'dim', title: null };
  }

  const release = releaseRow(scrum);
  const debt = techDebtRow(scrum);
  const architect = architectRow(scrum);

  return {
    sprint: sprintCell,
    percent,
    title: sprint?.title || scrum.releasing?.title || milestoneLabel(scrum),
    release: { text: release.text, tone: release.tone, title: release.detail },
    debt: { text: debt.text, tone: meterTone(debt), title: 'Tech debt: open items / limit' },
    architect: architect
      ? {
          text: architect.text,
          tone: meterTone(architect),
          title: `Stories since the last architecture review / cadence · ${architect.lastReview}`,
        }
      : null,
    age: sprint && sprint.trailAt !== null ? formatAge(Math.max(0, now - sprint.trailAt)) : null,
    stalled: scrum.attention.stalled,
  };
}

/**
 * The collapsed row's second line: where the sprint stands in its six phases and, while it
 * builds, every story as a chip. Null without a running sprint or phase 4; a phase-4 release
 * that outlived its sprint shows the stepper at Release.
 */
export interface CompactSprintLine {
  steps: Step[];
  /** The stories as chips while the sprint builds; null in every other phase. */
  chips: StoryChip[] | null;
}

export function compactSprintLine(scrum: ProjectScrumSummary | null): CompactSprintLine | null {
  if (!scrum) return null;
  const sprint = scrum.sprint;
  if (sprint) {
    return {
      steps: stepper(sprint.phase),
      chips: sprint.phase === 'build' && sprint.stories.length > 0 ? storyChips(sprint) : null,
    };
  }
  if (scrum.releasing) return { steps: stepper('release'), chips: null };
  return null;
}

/** Which projects are expanded, read back from storage. Anything unreadable is "none". */
export function parseExpanded(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const value: unknown = JSON.parse(raw);
    return new Set(Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string') : []);
  } catch {
    return new Set();
  }
}
