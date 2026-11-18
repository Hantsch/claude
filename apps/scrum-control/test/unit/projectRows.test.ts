/** The popover's project rows (CONCEPT section 6): summary, row model, listed sessions, scrum block. */

import { describe, expect, it } from 'vitest';
import { normalizePathKey } from '../../src/core/adapters/claude/paths.ts';
import type { OpenFolder } from '../../src/core/projects/openWindows.ts';
import { buildProjects } from '../../src/core/projects/projects.ts';
import type { ProjectView } from '../../src/core/projects/types.ts';
import type { ProjectScrumSummary } from '../../src/core/scrum/types.ts';
import {
  attentionMarks,
  milestoneLabel,
  minutesLeftLabel,
  popoverSections,
  popoverSummary,
  progressModel,
  projectDotStatus,
  projectRowModel,
  scrumBlockModel,
  sessionsToShow,
  sprintRunning,
} from '../../src/renderer/lib/projectRows.ts';
import { plainSummary, scrumSummary, sessionIn, sprint, summaryMap } from '../fixtures/projects.ts';

type Session = ReturnType<typeof sessionIn>;

function view(path: string, summary: ProjectScrumSummary, sessions: Session[] = []): ProjectView {
  const folder: OpenFolder = { path, key: normalizePathKey(path), pid: 7, via: 'lock' };
  const [project] = buildProjects({ openFolders: [folder], sessions, summaries: summaryMap(summary) });
  if (!project) throw new Error('project was not shown');
  return project;
}

const P = 'c:\\p\\claude';
const noAttention = {
  stalled: false,
  stalledMinutes: 0,
  blocked: false,
  blockedStory: null,
  releaseNo: false,
  releaseMissed: false,
};

const building = (path = P, overrides: Partial<ProjectScrumSummary> = {}, sessions: Session[] = []): ProjectView =>
  view(path, scrumSummary(path, { sprint: sprint(), bandLine: 'S14 Build 4/12 · 026 D4/5', ...overrides }), sessions);

describe('popoverSummary', () => {
  it('is null without projects', () => {
    expect(popoverSummary([])).toBeNull();
  });

  it('counts running sprints and projects that need you', () => {
    const stalled = building('c:\\p\\mmo', { attention: { ...noAttention, stalled: true, stalledMinutes: 18 } });
    expect(popoverSummary([building(), stalled])).toBe('2 sprints running · 1 needs you');
  });

  it('says so when nothing runs and pluralises the attention count', () => {
    const idle = view('c:\\p\\idle', scrumSummary('c:\\p\\idle'));
    expect(popoverSummary([idle])).toBe('no sprint running');
    const a = view('c:\\p\\a', scrumSummary('c:\\p\\a'), [sessionIn('c:\\p\\a', 'waiting')]);
    const b = view('c:\\p\\b', scrumSummary('c:\\p\\b'), [sessionIn('c:\\p\\b', 'waiting')]);
    expect(popoverSummary([a, b])).toBe('no sprint running · 2 need you');
    expect(popoverSummary([building()])).toBe('1 sprint running');
  });

  it('counts a sprint in phase 4 as running', () => {
    const releasing = view('c:\\p\\r', scrumSummary('c:\\p\\r', { releasing: { id: 'S09', title: 'x', step: null } }));
    expect(sprintRunning(releasing)).toBe(true);
    expect(popoverSummary([releasing])).toBe('1 sprint running');
  });
});

describe('sessionsToShow', () => {
  it('lists only the project sessions that are tray-worthy, in the project order, from the tray copy', () => {
    const working = sessionIn(P, 'working');
    const done = sessionIn(P, 'done');
    const project = building(P, {}, [done, working]);
    const freshWorking = { ...working, muted: true };
    const shown = sessionsToShow(project, [freshWorking]);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toBe(freshWorking);
  });

  it('lists nothing when no session of the project is tray-worthy', () => {
    expect(sessionsToShow(building(P, {}, [sessionIn(P, 'done')]), [])).toEqual([]);
  });
});

describe('attentionMarks', () => {
  it('marks every reason with an amber warning sign', () => {
    expect(attentionMarks(['stalled 18m', '1 session needs you'])).toEqual([
      { glyph: '⚠', text: 'stalled 18m', tone: 'warn' },
      { glyph: '⚠', text: '1 session needs you', tone: 'warn' },
    ]);
  });
});

describe('projectDotStatus', () => {
  const counts = (status: 'working' | 'done') => [{ status, count: 1 }];

  it('is the attention colour whenever the project needs you', () => {
    expect(projectDotStatus({ needsAttention: true }, counts('working'), true)).toBe('waiting');
  });

  it('is the worst listed session status otherwise', () => {
    expect(projectDotStatus({ needsAttention: false }, counts('done'), false)).toBe('done');
  });

  it('falls back to the sprint, then to a neutral dot, without sessions', () => {
    expect(projectDotStatus({ needsAttention: false }, [], true)).toBe('working');
    expect(projectDotStatus({ needsAttention: false }, [], false)).toBe('ended');
  });
});

describe('progressModel and milestoneLabel', () => {
  it('describes the bar while a sprint runs and drops it otherwise', () => {
    expect(progressModel(scrumSummary(P, { sprint: sprint() }))).toEqual({
      done: 4,
      total: 12,
      percent: 33,
      title: '4 of 12 stories',
    });
    expect(progressModel(scrumSummary(P))).toBeNull();
    const empty = sprint({ progress: { done: 0, total: 0, unit: 'stories' } });
    expect(progressModel(scrumSummary(P, { sprint: empty }))).toBeNull();
    const refining = sprint({ progress: { done: 2, total: 6, unit: 'refined' } });
    expect(progressModel(scrumSummary(P, { sprint: refining }))?.title).toBe('2 of 6 refined');
  });

  it('never lets the bar overshoot', () => {
    const over = sprint({ progress: { done: 9, total: 6, unit: 'stories' } });
    expect(progressModel(scrumSummary(P, { sprint: over }))?.percent).toBe(100);
  });

  it('joins id and name, without repeating an id the name already starts with', () => {
    expect(milestoneLabel(scrumSummary(P, { milestone: { id: 'M3', name: 'Login' } }))).toBe('M3 Login');
    const long = { id: 'M12', name: 'M12 — Phase 2: backend spec for the product-service' };
    expect(milestoneLabel(scrumSummary(P, { milestone: long }))).toBe(long.name);
    expect(milestoneLabel(scrumSummary(P))).toBeNull();
    expect(milestoneLabel(null)).toBeNull();
  });
});

describe('projectRowModel', () => {
  it('builds a scrum row from the summary, the listed sessions and the hosts', () => {
    const wsl = sessionIn(P, 'working', { host: 'wsl:Ubuntu' });
    const win = sessionIn(P, 'working');
    const project = building(P, { milestone: { id: 'M3', name: 'Login' } }, [wsl, win]);
    const row = projectRowModel(project, [wsl, win]);
    expect(row).toMatchObject({
      key: normalizePathKey(P),
      name: 'claude',
      dot: 'working',
      line: 'S14 Build 4/12 · 026 D4/5',
      milestone: 'M3 Login',
      wsl: true,
      wslDistros: ['Ubuntu'],
      canOpenWindow: true,
      running: true,
      attention: [],
    });
    expect(row.counts).toEqual([{ status: 'working', count: 2 }]);
    expect(row.progress?.percent).toBe(33);
  });

  it('shows an idle project with the band line and a neutral dot', () => {
    const idle = view('c:\\p\\idle', scrumSummary('c:\\p\\idle', { bandLine: 'no sprint · next S10 planned' }));
    expect(projectRowModel(idle, [])).toMatchObject({
      line: 'no sprint · next S10 planned',
      dot: 'ended',
      progress: null,
      milestone: null,
      wsl: false,
      counts: [],
    });
  });

  it('carries the attention reasons as marks', () => {
    const project = building(P, { attention: { ...noAttention, stalled: true, stalledMinutes: 18 } });
    const row = projectRowModel(project, []);
    expect(row.dot).toBe('waiting');
    expect(row.attention.map((mark) => mark.text)).toEqual(['stalled 18m']);
  });
});

describe('popoverSections', () => {
  it('splits scrum and other; Other keeps a window without a listed session, drops a project with neither', () => {
    const scrum = building();
    const shownOther = sessionIn('c:\\p\\other', 'done');
    const other = view('c:\\p\\other', plainSummary('c:\\p\\other'), [shownOther]);
    const windowOnly = view('c:\\p\\window', plainSummary('c:\\p\\window'));
    const settled = {
      ...view('c:\\p\\settled', plainSummary('c:\\p\\settled'), [sessionIn('c:\\p\\settled', 'done')]),
      hasWindow: false,
    };
    const sections = popoverSections([scrum, other, windowOnly, settled], [shownOther]);
    expect(sections.scrum.map((row) => row.name)).toEqual(['claude']);
    expect(sections.other.map((row) => row.name)).toEqual(['other', 'window']);
  });

  it('keeps a scrum project that lists no session', () => {
    const sections = popoverSections([building(P, {}, [sessionIn(P, 'done')])], []);
    expect(sections.scrum).toHaveLength(1);
    expect(sections.scrum[0]?.sessions).toEqual([]);
  });
});

describe('scrumBlockModel', () => {
  it('is empty without a summary', () => {
    expect(scrumBlockModel(null)).toEqual({ facts: [], hints: [] });
  });

  it('shows tech debt always, architect only when it is configured', () => {
    const quiet = scrumBlockModel(
      scrumSummary(P, {
        techDebt: { count: 2, limit: 8, due: false },
        architect: { since: 0, every: 0, due: false, lastReview: null },
      }),
    );
    expect(quiet.facts).toEqual([{ label: 'Tech debt', value: '2/8', tone: null }]);
    const configured = scrumBlockModel(
      scrumSummary(P, {
        techDebt: { count: 9, limit: 8, due: true },
        architect: { since: 3, every: 5, due: false, lastReview: null },
      }),
    );
    expect(configured.facts).toEqual([
      { label: 'Tech debt', value: '9/8 · due', tone: 'warn' },
      { label: 'Architect', value: '3/5', tone: null },
    ]);
  });

  it('adds the time left and the next planned sprint, and leaves the release verdict out', () => {
    const block = scrumBlockModel(
      scrumSummary(P, {
        sprint: sprint({ minutesLeft: 75 }),
        release: {
          kind: 'NO',
          verdict: 'releasable: NO · gate red',
          step: 'release-check',
          isRunning: false,
          sprintId: 'S13',
          endedAt: null,
        },
        nextPlanned: { id: 'S15', storyCount: 1 },
        techDebt: { count: 0, limit: 8, due: false },
      }),
    );
    expect(block.facts.map((fact) => [fact.label, fact.value, fact.tone])).toEqual([
      ['Time left', '~1h 15m left', null],
      ['Tech debt', '0/8', null],
      ['Next', 'S15 planned · 1 story', null],
    ]);
  });

  it('passes the update hints through', () => {
    const hint = { plugin: 'ai-scrum', text: 'ai-scrum 1.4.0 available', command: '/ai-scrum:setup' };
    const block = scrumBlockModel(scrumSummary(P, { updateHints: [hint] }));
    expect(block.hints).toEqual([{ text: hint.text, command: hint.command }]);
  });

  it('words the time left', () => {
    expect(minutesLeftLabel(0.2)).toBe('~1m left');
    expect(minutesLeftLabel(25)).toBe('~25m left');
    expect(minutesLeftLabel(120)).toBe('~2h left');
  });
});
