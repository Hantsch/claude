/**
 * Pure CLI formatting helper, kept in its own module (no side effects) so it can be
 * imported by tests without pulling in `index.ts`'s `main().catch(...)` invocation.
 *
 * Threshold matches `formatAge` in `src/renderer/lib/format.ts` (Acceptance Criterion:
 * ages under 5s read "just now" on every surface). The CLI keeps its own compact
 * suffix-less shape (`3h` vs the renderer's `3h ago`) since it prints fixed-width table
 * columns, so the implementations stay separate rather than sharing one function.
 */

import type { ContextPressure } from '../core/model/types.ts';
import { STATUS_LABEL } from '../core/model/status.ts';
import type { ProjectView } from '../core/projects/types.ts';

export function formatAge(ms: number): string {
  if (ms < 5_000) return 'just now';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

/**
 * Provenance marker for the `ctx=` column (story 005 D8): `~` when `window` is only an
 * estimated guess, `=` once the opt-in fetched table resolved this model exactly. A
 * `widened` pressure is always `'estimated'` (D4), so it always reads `~`.
 */
export function contextMarker(windowSource: ContextPressure['windowSource']): '~' | '=' {
  return windowSource === 'exact' ? '=' : '~';
}

/** Full `ctx=` cell text: percentage, the `*` widened flag, then the provenance marker. */
export function formatContextColumn(context: ContextPressure | null): string {
  if (!context) return '—';
  return `${Math.round(context.ratio * 100)}%${context.widened ? '*' : ''}${contextMarker(context.windowSource)}`;
}

/**
 * Whether `createEngine` should be handed a data dir at all. Mirrors the main process's own
 * rule (`createEngine.ts`): a `WindowSource` is only ever constructed when a data dir is
 * given, so leaving this `undefined` while the setting is off is what guarantees the CLI
 * never fetches anything — there is no `WindowSource` instance to do it.
 */
export function engineDataDir(useOnlineTable: boolean, dataDir: string): string | undefined {
  return useOnlineTable ? dataDir : undefined;
}

/**
 * One project of the CLI's "Scrum projects" / "Other" sections, as two lines: the sprint line,
 * and below it the window, the sessions per status, the hosts and - when there is any - what
 * needs attention. `glyph` is the status symbol the caller draws the first line with.
 */
export function formatProjectLines(project: ProjectView, glyph: string): string[] {
  const sprint = project.scrum?.bandLine ?? '';
  const milestone = project.scrum?.milestone ? ` · ${milestoneText(project.scrum.milestone)}` : '';
  const head = `  ${glyph} ${project.name.padEnd(22)} ${sprint}${milestone}`.trimEnd();

  const sessions =
    project.statusCounts.length === 0
      ? 'no sessions'
      : project.statusCounts.map((entry) => `${entry.count} ${STATUS_LABEL[entry.status]}`).join(', ');
  const details = [
    `window: ${project.hasWindow ? 'open' : 'none'}`,
    sessions,
    project.hosts.length === 0 ? null : `hosts: ${project.hosts.join(', ')}`,
    project.attentionReasons.length === 0 ? null : `ATTENTION: ${project.attentionReasons.join(', ')}`,
  ].filter((part): part is string => part !== null);
  return [head, `      ${details.join(' · ')}`];
}

/** `M3 Login`; roadmap headings without an id come through as both id and name, and run long. */
function milestoneText(milestone: { id: string; name: string }): string {
  const text = milestone.id === milestone.name ? milestone.name : `${milestone.id} ${milestone.name}`;
  return text.length <= 48 ? text : `${text.slice(0, 47)}…`;
}
