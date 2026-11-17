/**
 * What the tray says (CONCEPT §5): sprints, not sessions. Pure.
 *
 *  - `idle`      no sprint running in any shown project
 *  - `sprint`    at least one sprint in progress, nothing needs you
 *  - `attention` a scrum attention flag, or a session waiting for you, in any shown project
 *
 * The badge counts the projects that need attention (a project with two waiting sessions counts
 * once). The tooltip has one line per running sprint, or `No sprint running`.
 */

import type { TrayIcon } from '../model/status.ts';
import type { ProjectView, TrayProjectsState, TrayTile } from './types.ts';

/** Windows truncates a tray tooltip at 127 characters (a 128-character buffer, one for the NUL). */
export const TRAY_TOOLTIP_MAX = 127;

/** The drawn shape each tile reuses (`main/tray-icons.ts`): the small ring, the disc with a core, the notched disc. */
export const TRAY_TILE_ICON: Readonly<Record<TrayTile, TrayIcon>> = {
  idle: 'none',
  sprint: 'working',
  attention: 'waiting',
};

/** A sprint counts as running while it is in progress, and while its release check still runs. */
export function isSprintRunning(project: ProjectView): boolean {
  const scrum = project.scrum;
  return scrum !== null && (scrum.sprint !== null || scrum.releasing !== null);
}

export function trayStateFromProjects(projects: readonly ProjectView[]): TrayProjectsState {
  const badge = projects.filter((project) => project.needsAttention).length;
  const running = projects.filter(isSprintRunning);
  const tile: TrayTile = badge > 0 ? 'attention' : running.length > 0 ? 'sprint' : 'idle';

  const lines = running.map((project) => `${sprintLabel(project)} · ${project.name}`);
  if (lines.length === 0) lines.push('No sprint running');
  if (badge > 0) lines.push(badge === 1 ? '1 project needs you' : `${badge} projects need you`);
  return { tile, badge, tooltip: fitTooltip(lines) };
}

/** `S14 Build 4/12 · 026 D4/5` becomes `S14 Build 4/12`: the sprint, its phase and its progress. */
export function sprintLabel(project: ProjectView): string {
  const band = project.scrum?.bandLine ?? '';
  const head = band.split(' · ')[0]?.trim() ?? '';
  return head === '' ? 'Sprint' : head;
}

/** `claude — S14 Build 4/12 · stalled 18m`: the project, its sprint line and why it wants a look. */
export function projectMenuLabel(project: ProjectView): string {
  const parts = [project.scrum?.bandLine ?? '', ...project.attentionReasons].filter((part) => part !== '');
  return parts.length === 0 ? project.name : `${project.name} — ${parts.join(' · ')}`;
}

/**
 * Joins the lines with newlines and keeps the result within `max` characters: the first lines
 * that fit stay, the rest become `+N more`, and a single line that is too long is cut with an
 * ellipsis.
 */
export function fitTooltip(lines: readonly string[], max = TRAY_TOOLTIP_MAX): string {
  const clip = (text: string, width: number): string => (text.length <= width ? text : `${text.slice(0, Math.max(0, width - 1))}…`);
  const joined = lines.join('\n');
  if (joined.length <= max) return joined;

  const kept: string[] = [];
  for (const line of lines) {
    const next = [...kept, line].join('\n');
    if (next.length > max) break;
    kept.push(line);
  }
  if (kept.length === 0) return clip(lines[0] ?? '', max);
  // Leave room for the "+N more" line, dropping kept lines until it fits.
  for (;;) {
    const more = `+${lines.length - kept.length} more`;
    const text = [...kept, more].join('\n');
    if (text.length <= max) return text;
    if (kept.length === 1) return clip(kept[0]!, max);
    kept.pop();
  }
}
