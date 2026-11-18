/**
 * The projects model (CONCEPT §3): which sessions belong to which project, which projects the
 * overview shows, and what needs attention in each. Pure; the service feeds it.
 *
 * A session belongs to the open folder that contains its (mapped) project path, the longest
 * match winning. A session in no open folder is its own project, keyed by its project key.
 */

import { isPathInside, normalizePathKey } from '../adapters/claude/paths.ts';
import type { HostId, SessionView } from '../model/types.ts';
import { compareSessions, statusCounts } from '../state/aggregate.ts';
import type { ProjectScrumSummary } from '../scrum/types.ts';
import type { OpenFolder } from './openWindows.ts';
import { folderBaseName } from './titles.ts';
import type { ProjectView } from './types.ts';

/** One project before any scrum state is known: a folder, its window and its sessions. */
export interface ProjectBucket {
  key: string;
  path: string;
  name: string;
  hasWindow: boolean;
  windowPid: number | null;
  sessions: SessionView[];
}

/** Assigns every session to a project. Every open folder is a bucket, with or without sessions. */
export function groupIntoProjects(openFolders: readonly OpenFolder[], sessions: readonly SessionView[]): ProjectBucket[] {
  const buckets = new Map<string, ProjectBucket>();
  for (const folder of openFolders) {
    if (buckets.has(folder.key)) continue;
    buckets.set(folder.key, {
      key: folder.key,
      path: folder.path,
      name: folderBaseName(folder.path),
      hasWindow: true,
      windowPid: folder.pid,
      sessions: [],
    });
  }

  const folders = [...buckets.values()];
  for (const session of sessions) {
    let owner: ProjectBucket | null = null;
    for (const bucket of folders) {
      if (!isPathInside(session.project.path, bucket.path)) continue;
      if (owner === null || bucket.key.length > owner.key.length) owner = bucket;
    }
    if (owner === null) {
      const key = normalizePathKey(session.project.path);
      owner = buckets.get(key) ?? null;
      if (owner === null) {
        owner = {
          key,
          path: session.project.path,
          name: session.project.name,
          hasWindow: false,
          windowPid: null,
          sessions: [],
        };
        buckets.set(key, owner);
      }
    }
    owner.sessions.push(session);
  }
  return [...buckets.values()];
}

export interface BuildProjectsInput {
  openFolders: readonly OpenFolder[];
  sessions: readonly SessionView[];
  /** The monitor's summaries, keyed by `normalizePathKey`. A project with no summary yet is skipped. */
  summaries: ReadonlyMap<string, ProjectScrumSummary>;
}

/**
 * Every bucket is shown: each one has an open window or a live session by construction. With
 * ai-scrum it is a `scrum` project, without it an `other` one.
 */
export function buildProjects(input: BuildProjectsInput): ProjectView[] {
  const views: ProjectView[] = [];
  for (const bucket of groupIntoProjects(input.openFolders, input.sessions)) {
    // Not scanned yet: whether it has scrum is not known, so it would land in the wrong section.
    const summary = input.summaries.get(bucket.key);
    if (summary === undefined) continue;
    const section = summary.hasScrum ? 'scrum' : 'other';

    const sessions = [...bucket.sessions].sort(compareSessions);
    const reasons = attentionReasons(summary, sessions);
    views.push({
      key: bucket.key,
      path: bucket.path,
      name: bucket.name,
      section,
      hasWindow: bucket.hasWindow,
      windowPid: bucket.windowPid,
      hosts: hostsOf(sessions),
      sessions,
      statusCounts: statusCounts(sessions),
      worstStatus: sessions[0]?.status ?? null,
      scrum: summary.hasScrum ? summary : null,
      needsAttention: reasons.length > 0,
      attentionReasons: reasons,
    });
  }
  return views.sort(compareProjects);
}

/** Windows first, then the WSL distros alphabetically. */
function hostsOf(sessions: readonly SessionView[]): HostId[] {
  const hosts = new Set<HostId>(sessions.map((session) => session.host));
  return [...hosts].sort((a, b) => {
    if (a === b) return 0;
    if (a === 'windows') return -1;
    if (b === 'windows') return 1;
    return a.localeCompare(b);
  });
}

/**
 * Why a project wants a look: a stalled sprint, and sessions that wait for an answer the user has
 * not seen yet (a seen one no longer counts, as with the session badge). A blocked story and the
 * release verdict are not warnings: a blocked sprint stalls anyway, and the verdict is shown where
 * the release is (the Projects tab's Release column), not raised.
 */
export function attentionReasons(summary: ProjectScrumSummary, sessions: readonly SessionView[]): string[] {
  const reasons: string[] = [];
  const { attention } = summary;
  if (summary.hasScrum) {
    if (attention.stalled) reasons.push(`stalled ${attention.stalledMinutes}m`);
  }
  const waiting = sessions.filter((session) => session.status === 'waiting' && !session.seen).length;
  if (waiting > 0) reasons.push(waiting === 1 ? '1 session needs you' : `${waiting} sessions need you`);
  return reasons;
}

/** Scrum projects first, attention first, a running sprint first, then by name. */
function compareProjects(a: ProjectView, b: ProjectView): number {
  if (a.section !== b.section) return a.section === 'scrum' ? -1 : 1;
  if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
  const sprintA = a.scrum?.sprint != null;
  const sprintB = b.scrum?.sprint != null;
  if (sprintA !== sprintB) return sprintA ? -1 : 1;
  return a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
}
