/**
 * Pure derivations for the tray popover's project rows (CONCEPT section 6): the summary line in the
 * head, one row model per project, which sessions a project lists, and the wording of the
 * attention marks and the compact scrum block. Like `popoverModel.ts` this lives outside the JSX
 * because vitest runs without a DOM here; `popover.tsx` renders what these return.
 */

import type { ProjectView } from '../../core/projects/types.ts';
import type { ProjectScrumSummary } from '../../core/scrum/types.ts';
import { statusCounts } from '../../core/state/aggregate.ts';
import type { GroupStatusCount } from '../../core/state/aggregate.ts';
import type { SessionStatus, SessionView } from '../../shared/ipc.ts';

/** A scrum project's sprint counts as running while it is in progress or its phase 4 still runs. */
export function sprintRunning(project: ProjectView): boolean {
  const scrum = project.scrum;
  return scrum !== null && (scrum.sprint !== null || scrum.releasing !== null);
}

/** `2 sprints running · 1 needs you`; null while there is nothing to summarise. */
export function popoverSummary(projects: readonly ProjectView[]): string | null {
  if (projects.length === 0) return null;
  const running = projects.filter(sprintRunning).length;
  const needing = projects.filter((project) => project.needsAttention).length;
  const parts = [running === 0 ? 'no sprint running' : `${running} sprint${running === 1 ? '' : 's'} running`];
  if (needing > 0) parts.push(needing === 1 ? '1 needs you' : `${needing} need you`);
  return parts.join(' · ');
}

/**
 * The sessions a project lists: the engine-visible ones the popover would show anyway (`traySessions`),
 * in the project's urgency order. The object from `tray` wins over the project's copy, because the
 * two arrive through separate broadcasts and the session rows must agree with `state`.
 */
export function sessionsToShow(project: ProjectView, tray: readonly SessionView[]): SessionView[] {
  const byId = new Map(tray.map((session) => [session.sessionId, session]));
  const shown: SessionView[] = [];
  for (const session of project.sessions) {
    const current = byId.get(session.sessionId);
    if (current) shown.push(current);
  }
  return shown;
}

/** One thing a project needs you for (a stalled sprint, a waiting session), shown in amber. */
export interface AttentionMark {
  glyph: '⚠';
  text: string;
  tone: 'warn';
}

export function attentionMarks(reasons: readonly string[]): AttentionMark[] {
  return reasons.map((reason) => ({ glyph: '⚠', text: reason, tone: 'warn' }));
}

/** What the row's dot shows. A project with nothing to report gets the neutral `ended` grey. */
export function projectDotStatus(
  project: Pick<ProjectView, 'needsAttention'>,
  shownCounts: readonly GroupStatusCount[],
  running: boolean,
): SessionStatus {
  if (project.needsAttention) return 'waiting';
  const worst = shownCounts[0]?.status;
  if (worst) return worst;
  return running ? 'working' : 'ended';
}

export interface ProgressModel {
  done: number;
  total: number;
  /** 0 to 100. */
  percent: number;
  title: string;
}

export interface ScrumRowModel {
  key: string;
  name: string;
  dot: SessionStatus;
  /** The one-line sprint text. */
  line: string;
  progress: ProgressModel | null;
  /** `M3 Login`, or null. The CSS ellipsizes it. */
  milestone: string | null;
  counts: GroupStatusCount[];
  sessions: SessionView[];
  wsl: boolean;
  /** The distros, for the badge tooltip. */
  wslDistros: string[];
  attention: AttentionMark[];
  canOpenWindow: boolean;
  running: boolean;
}

export function milestoneLabel(scrum: ProjectScrumSummary | null): string | null {
  const milestone = scrum?.milestone;
  if (!milestone) return null;
  const id = milestone.id.trim();
  const name = milestone.name.trim();
  if (!name) return id || null;
  if (!id || name.toLowerCase().startsWith(id.toLowerCase())) return name;
  return `${id} ${name}`;
}

export function progressModel(scrum: ProjectScrumSummary | null): ProgressModel | null {
  const progress = scrum?.sprint?.progress;
  if (!progress || progress.total <= 0) return null;
  const done = Math.min(Math.max(progress.done, 0), progress.total);
  return {
    done,
    total: progress.total,
    percent: Math.round((done / progress.total) * 100),
    title: `${done} of ${progress.total} ${progress.unit}`,
  };
}

export function wslDistros(project: Pick<ProjectView, 'hosts'>): string[] {
  return project.hosts.flatMap((host) => (host.startsWith('wsl:') ? [host.slice(4)] : []));
}

/** The row of one project (scrum or other) with the sessions it lists already resolved. */
export function projectRowModel(project: ProjectView, tray: readonly SessionView[]): ScrumRowModel {
  const sessions = sessionsToShow(project, tray);
  const counts = statusCounts(sessions);
  const running = sprintRunning(project);
  const distros = wslDistros(project);
  return {
    key: project.key,
    name: project.name,
    dot: projectDotStatus(project, counts, running),
    line: project.scrum?.bandLine ?? 'no sprint',
    progress: progressModel(project.scrum),
    milestone: milestoneLabel(project.scrum),
    counts,
    sessions,
    wsl: distros.length > 0,
    wslDistros: distros,
    attention: attentionMarks(project.attentionReasons),
    canOpenWindow: project.hasWindow,
    running,
  };
}

/**
 * The two sections the popover renders. `other` lists every non-scrum project with an open window
 * or a session; one with neither (a session the tray no longer lists, and no window) is skipped.
 */
export function popoverSections(
  projects: readonly ProjectView[],
  tray: readonly SessionView[],
): { scrum: ScrumRowModel[]; other: ScrumRowModel[] } {
  const scrum: ScrumRowModel[] = [];
  const other: ScrumRowModel[] = [];
  for (const project of projects) {
    const row = projectRowModel(project, tray);
    if (project.section === 'scrum') scrum.push(row);
    else if (row.sessions.length > 0 || row.canOpenWindow) other.push(row);
  }
  return { scrum, other };
}

export type FactTone = 'warn' | 'bad' | 'good' | null;

export interface ScrumFact {
  label: string;
  value: string;
  tone: FactTone;
}

export interface ScrumBlockModel {
  facts: ScrumFact[];
  hints: { text: string; command: string | null }[];
}

/** `~25m`, `~1h 5m`. */
export function minutesLeftLabel(minutes: number): string {
  const rounded = Math.max(1, Math.round(minutes));
  if (rounded < 60) return `~${rounded}m left`;
  const rest = rounded % 60;
  return `~${Math.floor(rounded / 60)}h${rest ? ` ${rest}m` : ''} left`;
}

/**
 * The compact scrum block under an expanded scrum row. Facts that do not apply are left out. The
 * release verdict is not one of them: the popover is about the sprint; the Projects tab shows it.
 */
export function scrumBlockModel(scrum: ProjectScrumSummary | null): ScrumBlockModel {
  if (!scrum) return { facts: [], hints: [] };
  const facts: ScrumFact[] = [];

  const milestone = milestoneLabel(scrum);
  if (milestone) facts.push({ label: 'Milestone', value: milestone, tone: null });
  const sprint = scrum.sprint;
  if (sprint && sprint.minutesLeft !== null) {
    facts.push({ label: 'Time left', value: minutesLeftLabel(sprint.minutesLeft), tone: null });
  }

  facts.push({
    label: 'Tech debt',
    value: `${scrum.techDebt.count}/${scrum.techDebt.limit}${scrum.techDebt.due ? ' · due' : ''}`,
    tone: scrum.techDebt.due ? 'warn' : null,
  });
  if (scrum.architect.every > 0) {
    facts.push({
      label: 'Architect',
      value: `${scrum.architect.since}/${scrum.architect.every}${scrum.architect.due ? ' · due' : ''}`,
      tone: scrum.architect.due ? 'warn' : null,
    });
  }
  if (scrum.nextPlanned) {
    const { id, storyCount } = scrum.nextPlanned;
    facts.push({
      label: 'Next',
      value: `${id} planned · ${storyCount} ${storyCount === 1 ? 'story' : 'stories'}`,
      tone: null,
    });
  }
  return { facts, hints: scrum.updateHints.map((hint) => ({ text: hint.text, command: hint.command })) };
}
