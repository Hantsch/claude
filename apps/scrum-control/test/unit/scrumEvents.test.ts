import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCRUM_NOTIFICATIONS,
  filterByToggles,
  projectNameOf,
  scrumEvents,
} from '../../src/core/scrum/events.ts';
import { createFsReader } from '../../src/core/scrum/reader.ts';
import { scan } from '../../src/core/scrum/parser.ts';
import { summarize } from '../../src/core/scrum/summarize.ts';
import { SCRUM_NOTIFICATION_KINDS, type ProjectScrumSummary, type ScrumNotificationKind } from '../../src/core/scrum/types.ts';
import { scrumProject, type ScrumProjectOptions } from '../fixtures/scrum/project.ts';

const KEY = 'c:/development/harbour';

async function summaryOf(fixture: string, options: ScrumProjectOptions = {}): Promise<ProjectScrumSummary> {
  const now = options.now ?? Date.now();
  const root = await scrumProject(fixture, { ...options, now });
  return { ...summarize(await scan(createFsReader(null), root, now), { now, hasWorkingSession: false }), projectPath: 'C:\\development\\harbour' };
}

const clone = (s: ProjectScrumSummary): ProjectScrumSummary => structuredClone(s);
const maps = (before: ProjectScrumSummary, after: ProjectScrumSummary) =>
  [new Map([[KEY, before]]), new Map([[KEY, after]])] as const;
const kinds = (list: { kind: ScrumNotificationKind }[]) => list.map((n) => n.kind);

describe('scrumEvents', () => {
  it('announces nothing on the baseline scan', async () => {
    const building = await summaryOf('building');
    expect(scrumEvents(undefined, new Map([[KEY, building]]))).toEqual([]);
  });

  it('announces nothing for a project that appears for the first time', async () => {
    const building = await summaryOf('building');
    expect(scrumEvents(new Map(), new Map([[KEY, building]]))).toEqual([]);
  });

  it('announces nothing for a project that had no ai-scrum before, or a failed read', async () => {
    const idle = await summaryOf('idle');
    const building = await summaryOf('building');
    const none = { ...clone(idle), hasScrum: false };
    expect(scrumEvents(...maps(none, building))).toEqual([]);
    const failed = { ...clone(building), error: 'EBUSY' };
    expect(scrumEvents(...maps(idle, failed))).toEqual([]);
  });

  it('announces nothing when nothing changed', async () => {
    const building = await summaryOf('building');
    expect(scrumEvents(...maps(building, clone(building)))).toEqual([]);
  });

  it('sprintStarted: a planned sprint goes in progress', async () => {
    const idle = await summaryOf('idle');
    const started = await summaryOf('idle', {
      files: { 'docs/sprints/S10/sprint.md': '---\nsprint: S10\nstatus: in-progress\n---\n\n# Sprint S10 - Cranes that lift\n\n## Stories\n\n- [ ] 031 - Crane controller\n' },
    });
    const events = scrumEvents(...maps(idle, started));
    expect(kinds(events)).toEqual(['sprintStarted']);
    expect(events[0]).toMatchObject({
      projectKey: KEY,
      projectName: 'harbour',
      sprintId: 'S10',
      storyId: null,
      title: 'harbour: sprint S10 started',
      body: 'Cranes that lift',
    });
  });

  it('storyDone: one event per story that turned done', async () => {
    const before = await summaryOf('building');
    const after = clone(before);
    for (const story of after.sprint?.stories ?? []) if (story.id === '026' || story.id === '027') story.isDone = true;
    if (after.sprint !== null) after.sprint.storiesDone = 3;
    const events = scrumEvents(...maps(before, after));
    expect(kinds(events)).toEqual(['storyDone', 'storyDone']);
    expect(events.map((e) => e.storyId)).toEqual(['026', '027']);
    expect(events[0]).toMatchObject({ sprintId: 'S14', title: 'harbour: story 026 done', body: 'Rotor drive · 3/4 in S14' });
  });

  it('sprintReview: the phase reaches review', async () => {
    const before = await summaryOf('building');
    const after = clone(before);
    if (after.sprint !== null) after.sprint.phase = 'review';
    const events = scrumEvents(...maps(before, after));
    expect(kinds(events)).toEqual(['sprintReview']);
    expect(events[0]).toMatchObject({ sprintId: 'S14', title: 'harbour: sprint S14 is ready for review' });
    // Already in review: not again.
    expect(scrumEvents(...maps(after, clone(after)))).toEqual([]);
  });

  it('sprintDone: the sprint moved to done/, or its phase 4 started', async () => {
    const before = await summaryOf('building');
    const moved = clone(before);
    moved.sprint = null;
    moved.sprintsDone = before.sprintsDone + 1;
    expect(kinds(scrumEvents(...maps(before, moved)))).toEqual(['sprintDone']);

    const releasing = clone(before);
    releasing.sprint = null;
    releasing.releasing = { id: 'S14', title: 'A lamp that turns', step: 'roadmap-check' };
    const events = scrumEvents(...maps(before, releasing));
    expect(kinds(events)).toEqual(['sprintDone']);
    expect(events[0]).toMatchObject({ sprintId: 'S14', title: 'harbour: sprint S14 done' });

    // A sprint that merely went back to planned is not done.
    const dropped = clone(before);
    dropped.sprint = null;
    expect(scrumEvents(...maps(before, dropped))).toEqual([]);
  });

  it('stalled: fires when the flag turns on, not while it stays on', async () => {
    const before = await summaryOf('building');
    const after = clone(before);
    after.attention.stalled = true;
    after.attention.stalledMinutes = 17;
    const events = scrumEvents(...maps(before, after));
    expect(kinds(events)).toEqual(['stalled']);
    expect(events[0]).toMatchObject({ sprintId: 'S14', storyId: '026', title: 'harbour: sprint S14 stalled' });
    expect(events[0]?.body).toContain('No trail for 17 min on 026');
    const later = clone(after);
    later.attention.stalledMinutes = 20;
    expect(scrumEvents(...maps(after, later))).toEqual([]);
  });

  it('blocked: fires for a story that becomes blocked, and again for another one', async () => {
    const before = await summaryOf('building');
    const blocked = clone(before);
    blocked.attention.blocked = true;
    blocked.attention.blockedStory = '026';
    if (blocked.sprint?.focus) {
      blocked.sprint.focus.stage = 'blocked';
      blocked.sprint.focus.step = 'the motor spec is missing';
    }
    const first = scrumEvents(...maps(before, blocked));
    expect(kinds(first)).toEqual(['blocked']);
    expect(first[0]).toMatchObject({ storyId: '026', title: 'harbour: story 026 blocked', body: 'Rotor drive · the motor spec is missing' });
    expect(scrumEvents(...maps(blocked, clone(blocked)))).toEqual([]);

    const other = clone(blocked);
    other.attention.blockedStory = '027';
    expect(scrumEvents(...maps(blocked, other)).map((e) => e.storyId)).toEqual(['027']);
  });

  it('releaseVerdict: a written verdict is announced, a changed one again, `not tracked` never', async () => {
    const none = await summaryOf('releasing', { files: { '.git/ai-scrum/trail.md': null, '.git/ai-scrum/release-checks.jsonl': null } });
    expect(none.release).toBeNull();
    const yes = await summaryOf('releasing');
    const first = scrumEvents(...maps(none, yes));
    expect(kinds(first)).toEqual(['releaseVerdict']);
    expect(first[0]).toMatchObject({ sprintId: 'S09', title: 'harbour: releasable: yes' });
    expect(first[0]?.body).toMatch(/^merge of abc1234 into origin\/main/);
    expect(scrumEvents(...maps(yes, clone(yes)))).toEqual([]);

    const no = await summaryOf('releasing', {
      files: { '.git/ai-scrum/trail.md': '- 2026-11-17 13:00 · S09 · release-check · done · releasable: NO · Test: 2 red\n' },
    });
    const second = scrumEvents(...maps(yes, no));
    expect(second.map((e) => e.title)).toEqual(['harbour: releasable: NO']);
    expect(second[0]?.dedupeKey).not.toBe(first[0]?.dedupeKey);

    const untracked = await summaryOf('releasing', {
      files: { '.git/ai-scrum/trail.md': '- 2026-11-17 14:00 · S09 · release-check · done · releasable: not tracked · stage mvp\n' },
    });
    expect(scrumEvents(...maps(yes, untracked))).toEqual([]);
  });

  it('dedupe keys are stable for the same event and differ between events', async () => {
    const before = await summaryOf('building');
    const after = clone(before);
    for (const story of after.sprint?.stories ?? []) if (story.id === '026') story.isDone = true;
    const a = scrumEvents(...maps(before, after));
    const b = scrumEvents(...maps(clone(before), clone(after)));
    expect(a.map((e) => e.dedupeKey)).toEqual(b.map((e) => e.dedupeKey));
    expect(a[0]?.dedupeKey).toBe(`${KEY}|storyDone|S14|026|`);

    const keys = new Set<string>();
    for (const story of ['026', '027']) {
      const n = clone(before);
      for (const s of n.sprint?.stories ?? []) if (s.id === story) s.isDone = true;
      for (const e of scrumEvents(...maps(before, n))) keys.add(e.dedupeKey);
    }
    expect(keys.size).toBe(2);
  });

  it('a stall after the trail moved on is a new event', async () => {
    const before = await summaryOf('building');
    const stalledAt = (trailAt: number) => {
      const s = clone(before);
      s.attention.stalled = true;
      if (s.sprint !== null) s.sprint.trailAt = trailAt;
      return s;
    };
    const one = scrumEvents(...maps(before, stalledAt(1_000)));
    const two = scrumEvents(...maps(before, stalledAt(2_000)));
    expect(one[0]?.dedupeKey).not.toBe(two[0]?.dedupeKey);
    expect(one[0]?.dedupeKey).toBe(scrumEvents(...maps(before, stalledAt(1_000)))[0]?.dedupeKey);
  });

  it('covers every kind', () => {
    expect([...SCRUM_NOTIFICATION_KINDS].sort()).toEqual(
      ['blocked', 'releaseVerdict', 'sprintDone', 'sprintReview', 'sprintStarted', 'stalled', 'storyDone'],
    );
  });
});

describe('toggles', () => {
  it('defaults follow CONCEPT 8: everything on except story done', () => {
    expect(DEFAULT_SCRUM_NOTIFICATIONS).toEqual({
      sprintStarted: true,
      storyDone: false,
      sprintReview: true,
      sprintDone: true,
      stalled: true,
      blocked: true,
      releaseVerdict: true,
    });
  });

  it('filterByToggles drops switched-off kinds and uses the default for a missing toggle', async () => {
    const before = await summaryOf('building');
    const after = clone(before);
    for (const story of after.sprint?.stories ?? []) if (story.id === '026') story.isDone = true;
    if (after.sprint !== null) after.sprint.phase = 'review';
    const all = scrumEvents(...maps(before, after));
    expect(kinds(all)).toEqual(['storyDone', 'sprintReview']);
    expect(kinds(filterByToggles(all, undefined))).toEqual(['sprintReview']);
    expect(kinds(filterByToggles(all, { storyDone: true }))).toEqual(['storyDone', 'sprintReview']);
    expect(kinds(filterByToggles(all, { sprintReview: false }))).toEqual([]);
    expect(kinds(filterByToggles(all, { ...DEFAULT_SCRUM_NOTIFICATIONS, storyDone: true, sprintReview: false }))).toEqual(['storyDone']);
  });

  it('names a project by its folder, for Windows and WSL paths alike', () => {
    expect(projectNameOf('C:\\development\\Hantsch\\claude\\')).toBe('claude');
    expect(projectNameOf('//wsl.localhost/Ubuntu/home/me/wow-market')).toBe('wow-market');
  });
});
