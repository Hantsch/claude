import { describe, expect, it } from 'vitest';
import type { ProjectScrumSummary, ScrumSprint } from '../../src/core/scrum/types.ts';
import {
  architectRow,
  backlogText,
  compactRow,
  compactSprintLine,
  focusLine,
  hasWslHost,
  meter,
  nextRow,
  parseExpanded,
  phaseRow,
  phaseStrip,
  releaseRow,
  sprintHeadline,
  stepper,
  storyChips,
  techDebtRow,
  timeLeftText,
  trailLine,
  wslDistros,
} from '../../src/renderer/lib/projectCard.ts';

function sprint(over: Partial<ScrumSprint> = {}): ScrumSprint {
  return {
    id: 'S14',
    title: 'Login',
    phase: 'build',
    storiesDone: 2,
    storiesTotal: 4,
    stories: [
      { id: '024', title: 'a', isDone: true },
      { id: '025', title: 'b', isDone: true },
      { id: '026', title: 'c', isDone: false },
      { id: '027', title: 'd', isDone: false },
    ],
    progress: { done: 2, total: 4, unit: 'stories' },
    focus: { id: '026', title: 'Migration', stage: 'implement', step: 'D4 Migration', stepAt: '09:52:01', deliverablesDone: 3, deliverablesTotal: 5 },
    trailAt: 1_000_000,
    avgStoryMinutes: 4.4,
    minutesLeft: 8.6,
    lastTrail: '09:55 026 D4 done',
    ...over,
  };
}

function summary(over: Partial<ProjectScrumSummary> = {}): ProjectScrumSummary {
  return {
    projectPath: 'c:\\dev\\x',
    hasScrum: true,
    readAt: 0,
    error: null,
    version: '4.13.0',
    milestone: { id: 'M3', name: 'Login' },
    phase: '1 · The King moves in',
    milestonesDone: 4,
    milestonesTotal: 6,
    sprint: null,
    releasing: null,
    release: null,
    nextPlanned: null,
    sprintsDone: 3,
    techDebt: { count: 7, limit: 10, due: false },
    architect: { since: 14, every: 20, due: false, lastReview: '2026-10-12' },
    backlog: { open: 23, ready: 4, unplanned: 6 },
    updateHints: [],
    attention: { stalled: false, stalledMinutes: 0, blocked: false, blockedStory: null, releaseNo: false, releaseMissed: false },
    bandLine: 'no sprint',
    ...over,
  };
}

describe('meter', () => {
  it('has no bar without a limit', () => {
    expect(meter(5, 0)).toBeNull();
  });

  it('is green below 80 %, amber from 80 %, red at the limit', () => {
    expect(meter(7, 10)).toMatchObject({ tone: 'ok', filled: 7, cells: 10 });
    expect(meter(8, 10)).toMatchObject({ tone: 'warn', filled: 8 });
    expect(meter(9, 10)).toMatchObject({ tone: 'warn' });
    expect(meter(10, 10)).toMatchObject({ tone: 'bad', filled: 10 });
  });

  it('clamps above the limit and lights one cell for a small value', () => {
    expect(meter(14, 10)).toMatchObject({ tone: 'bad', filled: 10, fraction: 1 });
    expect(meter(1, 40)?.filled).toBe(1);
    expect(meter(0, 10)?.filled).toBe(0);
  });
});

describe('idle rows', () => {
  it('phase names the milestones', () => {
    expect(phaseRow(summary()).text).toBe('1 · The King moves in · 4/6 milestones');
    expect(phaseRow(summary({ milestonesDone: 0, milestonesTotal: 1 })).text).toMatch(/0\/1 milestone$/);
    expect(phaseRow(summary({ phase: null }))).toEqual({ text: 'no roadmap', tone: 'dim' });
  });

  it('release: yes, NO, UNVERIFIED, not tracked, running', () => {
    const release = (kind: 'yes' | 'NO' | 'UNVERIFIED' | 'not tracked', over = {}) =>
      summary({ release: { kind, verdict: `releasable: ${kind}`, step: 'release-check', isRunning: false, sprintId: null, endedAt: null, ...over } });
    expect(releaseRow(release('yes'))).toMatchObject({ text: '✓ yes', tone: 'ok' });
    expect(releaseRow(release('NO'))).toMatchObject({ text: '✗ NO', tone: 'bad', detail: 'releasable: NO' });
    expect(releaseRow(release('UNVERIFIED'))).toMatchObject({ text: 'UNVERIFIED', tone: 'warn' });
    expect(releaseRow(release('not tracked'))).toMatchObject({ text: 'not tracked', tone: 'dim' });
    expect(releaseRow(summary())).toMatchObject({ text: 'not tracked', tone: 'dim' });
    expect(releaseRow(release('NO', { isRunning: true, step: 'roadmap-check' }))).toMatchObject({
      text: 'checking · roadmap check',
      tone: 'info',
    });
  });

  it('tech debt: count / limit with a bar, or "N · no limit" without', () => {
    expect(techDebtRow(summary())).toMatchObject({ text: '7 / 10', due: false });
    expect(techDebtRow(summary({ techDebt: { count: 10, limit: 10, due: true } }))).toMatchObject({
      text: '10 / 10',
      due: true,
      meter: { tone: 'bad' },
    });
    expect(techDebtRow(summary({ techDebt: { count: 3, limit: 0, due: false } }))).toEqual({
      text: '3 · no limit',
      meter: null,
      due: false,
    });
  });

  it('architect: hidden at every 0, otherwise since / every with the last review', () => {
    expect(architectRow(summary({ architect: { since: 4, every: 0, due: false, lastReview: null } }))).toBeNull();
    expect(architectRow(summary())).toMatchObject({ text: '14 / 20', lastReview: 'last review 2026-10-12', meter: { tone: 'ok' } });
    expect(architectRow(summary({ architect: { since: 18, every: 20, due: false, lastReview: null } }))).toMatchObject({
      lastReview: 'never reviewed',
      meter: { tone: 'warn' },
    });
    expect(architectRow(summary({ architect: { since: 21, every: 20, due: true, lastReview: null } }))).toMatchObject({
      due: true,
      meter: { tone: 'bad' },
    });
  });

  it('backlog and next', () => {
    expect(backlogText(summary())).toBe('23 open · 4 ready · 6 unplanned');
    expect(nextRow(summary({ nextPlanned: { id: 'S10', storyCount: 5 } })).text).toBe('S10 planned · 5 stories');
    expect(nextRow(summary({ nextPlanned: { id: 'S10', storyCount: 1 } })).text).toBe('S10 planned · 1 story');
    expect(nextRow(summary())).toEqual({ text: 'none planned', tone: 'dim' });
  });
});

describe('running sprint', () => {
  it('stepper marks the current phase and the ones before it', () => {
    const states = (phase: Parameters<typeof stepper>[0]) => stepper(phase).map((s) => s.state);
    expect(stepper('build').map((s) => s.label)).toEqual(['Clarify', 'Refine', 'Build', 'Gate', 'Review', 'Release']);
    expect(states('build')).toEqual(['done', 'done', 'current', 'todo', 'todo', 'todo']);
    expect(states('clarify')).toEqual(['current', 'todo', 'todo', 'todo', 'todo', 'todo']);
    expect(states('release')).toEqual(['done', 'done', 'done', 'done', 'done', 'current']);
    expect(states('planned')).toEqual(Array(6).fill('todo'));
    expect(states('done')).toEqual(Array(6).fill('done'));
  });

  it('stories become chips: done, focus, todo', () => {
    expect(storyChips(sprint()).map((c) => [c.state, c.text])).toEqual([
      ['done', '✓ 024'],
      ['done', '✓ 025'],
      ['focus', '● 026'],
      ['todo', '027'],
    ]);
    expect(storyChips(sprint({ focus: null })).filter((c) => c.state === 'focus')).toHaveLength(0);
  });

  it('the focus line joins stage and step and carries the start time', () => {
    expect(focusLine(sprint())).toEqual({
      id: '026',
      title: 'Migration',
      stage: 'implementing · D4 Migration',
      blocked: false,
      since: 'since 09:52:01',
      deliverables: { done: 3, total: 5, meter: { cells: 5, filled: 3, fraction: 0.6, tone: 'ok' } },
    });
    expect(focusLine(sprint({ focus: { id: '026', title: 'M', stage: 'blocked', step: 'needs a decision', stepAt: null, deliverablesDone: 0, deliverablesTotal: 0 } }))).toMatchObject({
      stage: 'blocked · needs a decision',
      blocked: true,
      since: null,
    });
    expect(focusLine(sprint({ focus: null }))).toBeNull();
  });

  it('time left rounds and is absent before a story has finished', () => {
    expect(timeLeftText(sprint())).toBe('~9 min left at 4m/story');
    expect(timeLeftText(sprint({ minutesLeft: 80, avgStoryMinutes: 40 }))).toBe('~1h 20m left at 40m/story');
    expect(timeLeftText(sprint({ minutesLeft: null }))).toBeNull();
    expect(timeLeftText(sprint({ avgStoryMinutes: null }))).toBeNull();
  });

  it('the trail line has a relative age and takes the stalled flag over', () => {
    const at = 1_000_000;
    expect(trailLine(sprint(), false, at + 4 * 60_000)).toEqual({ text: '09:55 026 D4 done', age: '4m ago', stalled: false });
    expect(trailLine(sprint(), true, at + 18 * 60_000)).toMatchObject({ age: '18m ago', stalled: true });
    expect(trailLine(sprint({ trailAt: null }), false, at)?.age).toBeNull();
    expect(trailLine(sprint({ lastTrail: null }), false, at)).toBeNull();
    // A clock that is behind the file's mtime never yields a negative age.
    expect(trailLine(sprint(), false, at - 60_000)?.age).toBe('just now');
  });

  it('headline counts refined stories during refine', () => {
    expect(sprintHeadline(sprint())).toBe('S14 Build · 2/4 stories');
    expect(sprintHeadline(sprint({ phase: 'refine', progress: { done: 2, total: 6, unit: 'refined' } }))).toBe('S14 Refine · 2/6 refined');
  });
});

describe('hosts', () => {
  it('spots a WSL host and names its distros', () => {
    expect(hasWslHost(['windows'])).toBe(false);
    expect(hasWslHost(['windows', 'wsl:Ubuntu'])).toBe(true);
    expect(wslDistros(['windows', 'wsl:Ubuntu', 'wsl:Debian'])).toEqual(['Ubuntu', 'Debian']);
  });
});

describe('phase row with a phase name that is only a table rule', () => {
  it('shows the milestone count alone', async () => {
    const { phaseRow } = await import('../../src/renderer/lib/projectCard.ts');
    const row = phaseRow({ phase: '---', milestonesDone: 6, milestonesTotal: 7 } as never);
    expect(row.text).toBe('6/7 milestones');
  });
});

describe('compact row', () => {
  it('a project without ai-scrum state has only a dim placeholder', () => {
    expect(compactRow(null, 0)).toMatchObject({
      sprint: { text: '—', tone: 'dim' },
      percent: null,
      title: null,
      release: null,
      debt: null,
      architect: null,
      age: null,
    });
  });

  it('a running sprint gives headline, percent, title and trail age', () => {
    const row = compactRow(summary({ sprint: sprint() }), 1_000_000 + 4 * 60_000);
    expect(row.sprint).toEqual({ text: 'S14 Build · 2/4 stories', tone: null, title: null });
    expect(row.percent).toBe(50);
    expect(row.title).toBe('Login');
    expect(row.age).toBe('4m ago');
  });

  it('without a sprint it falls back to the milestone and says "no sprint"', () => {
    const row = compactRow(summary(), 0);
    expect(row.sprint).toMatchObject({ text: 'no sprint', tone: 'dim' });
    expect(row.title).toBe('M3 Login');
    expect(row.percent).toBeNull();
  });

  it('colours the meters: red when due, amber near the limit, plain otherwise', () => {
    expect(compactRow(summary({ techDebt: { count: 19, limit: 10, due: true } }), 0).debt).toMatchObject({
      text: '19 / 10',
      tone: 'bad',
    });
    expect(compactRow(summary({ techDebt: { count: 9, limit: 10, due: false } }), 0).debt?.tone).toBe('warn');
    expect(compactRow(summary(), 0).debt?.tone).toBeNull();
    expect(compactRow(summary({ architect: { since: 3, every: 0, due: false, lastReview: null } }), 0).architect).toBeNull();
  });

  it('carries the release verdict as the tooltip', () => {
    const row = compactRow(
      summary({ release: { kind: 'NO', verdict: 'releasable: NO — lint', step: 'release-check', isRunning: false, sprintId: null, endedAt: null } }),
      0,
    );
    expect(row.release).toEqual({ text: '✗ NO', tone: 'bad', title: 'releasable: NO — lint' });
  });
});

describe('compact sprint line', () => {
  it('shows the stepper and, in Build, every story as a chip', () => {
    const line = compactSprintLine(summary({ sprint: sprint() }));
    expect(line?.steps.map((step) => `${step.label}:${step.state}`)).toEqual([
      'Clarify:done',
      'Refine:done',
      'Build:current',
      'Gate:todo',
      'Review:todo',
      'Release:todo',
    ]);
    expect(line?.chips?.map((chip) => chip.text)).toEqual(['✓ 024', '✓ 025', '● 026', '027']);
  });

  it('has no chips outside Build', () => {
    const line = compactSprintLine(summary({ sprint: sprint({ phase: 'refine' }) }));
    expect(line?.steps.find((step) => step.state === 'current')?.label).toBe('Refine');
    expect(line?.chips).toBeNull();
  });

  it('puts a phase-4 release without a sprint at Release, and is null with neither', () => {
    const line = compactSprintLine(summary({ releasing: { id: 'S13', title: 'x', step: null } }));
    expect(line?.steps.find((step) => step.state === 'current')?.label).toBe('Release');
    expect(line?.chips).toBeNull();
    expect(compactSprintLine(summary())).toBeNull();
    expect(compactSprintLine(null)).toBeNull();
  });
});

describe('popover phase strip', () => {
  it('names sprint, phase and - in Build only - the stories done', () => {
    expect(phaseStrip(summary({ sprint: sprint() }))).toMatchObject({
      sprintId: 'S14',
      label: 'Build',
      count: '2/4',
      title: '✓ Clarify · ✓ Refine · ● Build · Gate · Review · Release',
    });
    expect(phaseStrip(summary({ sprint: sprint() }))?.steps.map((step) => `${step.text}:${step.state}`)).toEqual([
      'Cla:done',
      'Ref:done',
      'Build:current',
      'Gate:todo',
      'Rev:todo',
      'Rel:todo',
    ]);
    expect(phaseStrip(summary({ sprint: sprint({ phase: 'refine' }) }))).toMatchObject({ label: 'Refine', count: null });
  });

  it('shows a phase-4 release at Release and is null without a sprint', () => {
    expect(phaseStrip(summary({ releasing: { id: 'S13', title: 'x', step: null } }))).toMatchObject({
      sprintId: 'S13',
      label: 'Release',
      count: null,
    });
    expect(phaseStrip(summary())).toBeNull();
    expect(phaseStrip(null)).toBeNull();
  });

  it('scales the deliverables bar past ten and leaves it out without deliverables', () => {
    const many = focusLine(sprint({ focus: { ...sprint().focus!, deliverablesDone: 6, deliverablesTotal: 12 } }));
    expect(many?.deliverables?.meter).toMatchObject({ cells: 10, filled: 5, tone: 'ok' });
    const none = focusLine(sprint({ focus: { ...sprint().focus!, deliverablesDone: 0, deliverablesTotal: 0 } }));
    expect(none?.deliverables).toBeNull();
  });
});

describe('parseExpanded', () => {
  it('reads a stored list of keys and treats anything else as none', () => {
    expect([...parseExpanded('["a","b"]')]).toEqual(['a', 'b']);
    expect(parseExpanded(null).size).toBe(0);
    expect(parseExpanded('not json').size).toBe(0);
    expect(parseExpanded('{"a":1}').size).toBe(0);
    expect([...parseExpanded('["a",1,null]')]).toEqual(['a']);
  });
});
