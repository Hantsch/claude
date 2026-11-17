/**
 * Scrum notifications (CONCEPT §8): what changed between two sets of summaries that is worth a
 * toast. Pure; the engine calls it with the summaries before and after a refresh and hands the
 * result to its notifier, which announces each `dedupeKey` once.
 *
 * Three rules keep it quiet:
 *  - no previous map (the first scan after start) is a baseline and announces nothing;
 *  - a project that was not in the previous map, or had no ai-scrum then, announces nothing;
 *  - a summary with an `error` is skipped, so a failed read never looks like a change.
 */

import {
  DEFAULT_SCRUM_NOTIFICATIONS,
  type ProjectScrumSummary,
  type ScrumNotification,
  type ScrumNotificationKind,
  type ScrumNotificationToggles,
} from './types.ts';

export { DEFAULT_SCRUM_NOTIFICATIONS };

/** The folder name of a project path, for the toast's title. */
export function projectNameOf(projectPath: string): string {
  const parts = projectPath.split(/[\\/]+/).filter((part) => part !== '');
  return parts[parts.length - 1] ?? projectPath;
}

export function scrumEvents(
  prev: ReadonlyMap<string, ProjectScrumSummary> | undefined,
  next: ReadonlyMap<string, ProjectScrumSummary>,
): ScrumNotification[] {
  if (prev === undefined) return [];
  const out: ScrumNotification[] = [];
  for (const [key, after] of next) {
    const before = prev.get(key);
    if (before === undefined || !before.hasScrum || !after.hasScrum || after.error !== null) continue;
    out.push(...projectEvents(key, before, after));
  }
  return out;
}

function projectEvents(key: string, before: ProjectScrumSummary, after: ProjectScrumSummary): ScrumNotification[] {
  const name = projectNameOf(after.projectPath);
  const out: ScrumNotification[] = [];
  const add = (
    kind: ScrumNotificationKind,
    sprintId: string | null,
    storyId: string | null,
    title: string,
    body: string,
    discriminator = '',
  ) => {
    out.push({
      projectKey: key,
      projectName: name,
      kind,
      sprintId,
      storyId,
      title: `${name}: ${title}`,
      body,
      dedupeKey: [key, kind, sprintId ?? '', storyId ?? '', discriminator].join('|'),
    });
  };

  const was = before.sprint;
  const now = after.sprint;
  const isSameSprint = was !== null && now !== null && was.id === now.id;

  // The phase leaves `planned`: the sprint is in progress where it was not, or another one is.
  if (now !== null && !isSameSprint) {
    add('sprintStarted', now.id, null, `sprint ${now.id} started`, now.title || `${now.storiesTotal} stories`);
  }

  if (was !== null && now !== null && isSameSprint) {
    const wasDone = new Set(was.stories.filter((s) => s.isDone).map((s) => s.id));
    for (const story of now.stories) {
      if (!story.isDone || wasDone.has(story.id)) continue;
      add(
        'storyDone',
        now.id,
        story.id,
        `story ${story.id} done`,
        `${story.title} · ${now.storiesDone}/${now.storiesTotal} in ${now.id}`,
      );
    }
    if (was.phase !== 'review' && now.phase === 'review') {
      add('sprintReview', now.id, null, `sprint ${now.id} is ready for review`, now.title || `${now.storiesTotal} stories done`);
    }
  }

  // The sprint left the in-progress state for good: it moved to done/ or its phase 4 runs.
  if (was !== null && (now === null || now.id !== was.id)) {
    const isFinished = after.sprintsDone > before.sprintsDone || after.releasing?.id === was.id;
    if (isFinished) {
      add('sprintDone', was.id, null, `sprint ${was.id} done`, `${was.storiesDone}/${was.storiesTotal} stories · ${was.title}`.replace(/ · $/, ''));
    }
  }

  // Silent trail: announce the moment it turns stalled. A new stall after the trail moved on
  // is a new event, so the trail's heartbeat is part of the key.
  if (now !== null && after.attention.stalled && !before.attention.stalled) {
    const focus = now.focus === null ? '' : ` on ${now.focus.id}`;
    add(
      'stalled',
      now.id,
      now.focus?.id ?? null,
      `sprint ${now.id} stalled`,
      `No trail for ${after.attention.stalledMinutes} min${focus}. ${now.lastTrail ?? ''}`.trim(),
      String(now.trailAt ?? ''),
    );
  }

  if (now !== null && after.attention.blocked && after.attention.blockedStory !== null) {
    const story = after.attention.blockedStory;
    if (!before.attention.blocked || before.attention.blockedStory !== story) {
      const reason = now.focus?.step ?? '';
      add('blocked', now.id, story, `story ${story} blocked`, `${now.focus?.title ?? ''}${reason === '' ? '' : ` · ${reason}`}`.replace(/^ · /, ''));
    }
  }

  // A verdict line written: `releasable: yes | NO | UNVERIFIED`. `not tracked` is not a verdict.
  const verdict = after.release;
  if (verdict !== null && verdict.verdict !== null && verdict.kind !== null && verdict.kind !== 'not tracked') {
    if (verdict.verdict !== (before.release?.verdict ?? null)) {
      add(
        'releaseVerdict',
        verdict.sprintId,
        null,
        `releasable: ${verdict.kind}`,
        verdict.verdict.replace(/^releasable:\s*\S+\s*(?:·\s*)?/, '') || verdict.verdict,
        `${verdict.kind}@${verdict.endedAt ?? verdict.verdict}`,
      );
    }
  }

  return out;
}

/** Keeps the notifications whose kind is switched on; a kind missing from `toggles` uses its default. */
export function filterByToggles(
  notifications: readonly ScrumNotification[],
  toggles: Partial<ScrumNotificationToggles> | null | undefined,
): ScrumNotification[] {
  return notifications.filter((n) => toggles?.[n.kind] ?? DEFAULT_SCRUM_NOTIFICATIONS[n.kind]);
}
