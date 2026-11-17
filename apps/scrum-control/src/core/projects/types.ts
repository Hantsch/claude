/**
 * The shapes the projects service, the main process and the renderer share (CONCEPT §3). Plain
 * and JSON-serializable: a `ProjectView` crosses IPC. Type imports only - this file is also
 * compiled for the renderer, so it must not pull in anything from Node.
 */

import type { SessionStatus } from '../model/status.ts';
import type { HostId, SessionView } from '../model/types.ts';
import type { GroupStatusCount } from '../state/aggregate.ts';
import type { ProjectScrumSummary } from '../scrum/types.ts';

/** `scrum` = ai-scrum project with a window or a session; `other` = no scrum, at least one session. */
export type ProjectSection = 'scrum' | 'other';

export interface ProjectView {
  /** `normalizePathKey` of `path` - the id every API below takes. */
  key: string;
  /** The open VS Code folder, or the common cwd of the sessions that belong to no open folder. A Windows path. */
  path: string;
  /** Folder name. */
  name: string;
  section: ProjectSection;
  /** A VS Code window is open on this folder. */
  hasWindow: boolean;
  /** Pid of the Windows process that owns that window; null without one. */
  windowPid: number | null;
  /** Where the project's sessions run: `windows` first, then WSL distros alphabetically. Empty without sessions. */
  hosts: HostId[];
  /** The project's live sessions, most urgent first. */
  sessions: SessionView[];
  /** Sessions per status, most urgent status first. */
  statusCounts: GroupStatusCount[];
  /** The most urgent status among the sessions; null without sessions. */
  worstStatus: SessionStatus | null;
  /** The project's ai-scrum state; null when it has none (`other` projects). */
  scrum: ProjectScrumSummary | null;
  /** A scrum attention flag is raised or a session waits for an answer that has not been seen. */
  needsAttention: boolean;
  /** Short human-readable reasons, e.g. `stalled 18m`, `blocked 026`, `releasable: NO`, `1 session needs you`. */
  attentionReasons: string[];
}

export type TrayTile = 'idle' | 'sprint' | 'attention';

export interface TrayProjectsState {
  tile: TrayTile;
  /** Projects that need attention. */
  badge: number;
  /** At most 127 characters, the most Windows shows. */
  tooltip: string;
}
