/** The tray's tile, badge and tooltip from the projects (CONCEPT section 5). */

import { describe, expect, it } from 'vitest';
import type { OpenFolder } from '../../src/core/projects/openWindows.ts';
import { normalizePathKey } from '../../src/core/adapters/claude/paths.ts';
import { buildProjects } from '../../src/core/projects/projects.ts';
import {
  TRAY_TILE_ICON,
  TRAY_TOOLTIP_MAX,
  fitTooltip,
  projectMenuLabel,
  sprintLabel,
  trayStateFromProjects,
} from '../../src/core/projects/trayState.ts';
import type { ProjectView } from '../../src/core/projects/types.ts';
import type { ProjectScrumSummary } from '../../src/core/scrum/types.ts';
import { plainSummary, scrumSummary, sessionIn, sprint, summaryMap } from '../fixtures/projects.ts';

function project(path: string, summary: ProjectScrumSummary, sessions: ReturnType<typeof sessionIn>[] = []): ProjectView {
  const folder: OpenFolder = { path, key: normalizePathKey(path), pid: 1, via: 'lock' };
  const [view] = buildProjects({ openFolders: [folder], sessions, summaries: summaryMap(summary) });
  if (!view) throw new Error('project was not shown');
  return view;
}

const building = (path: string, bandLine = 'S14 Build 4/12 · 026 D4/5'): ProjectView =>
  project(path, scrumSummary(path, { sprint: sprint(), bandLine }));

const stalled = (path: string): ProjectView =>
  project(
    path,
    scrumSummary(path, {
      sprint: sprint(),
      bandLine: 'S03 Refine 2/6',
      attention: { stalled: true, stalledMinutes: 18, blocked: false, blockedStory: null, releaseNo: false, releaseMissed: false },
    }),
  );

describe('trayStateFromProjects', () => {
  it('is idle with no projects, and says so', () => {
    expect(trayStateFromProjects([])).toEqual({ tile: 'idle', badge: 0, tooltip: 'No sprint running' });
  });

  it('is idle while projects exist but no sprint runs', () => {
    const quiet = project('c:\\p\\quiet', scrumSummary('c:\\p\\quiet'));
    expect(trayStateFromProjects([quiet])).toMatchObject({ tile: 'idle', badge: 0, tooltip: 'No sprint running' });
  });

  it('shows the sprint tile and one tooltip line per running sprint', () => {
    const state = trayStateFromProjects([building('c:\\p\\claude'), building('c:\\p\\mmo', 'S30 Build 6/10 · 202 D1/7')]);
    expect(state.tile).toBe('sprint');
    expect(state.badge).toBe(0);
    expect(state.tooltip).toBe('S14 Build 4/12 · claude\nS30 Build 6/10 · mmo');
  });

  it('counts a sprint in its release phase as running', () => {
    const releasing = project(
      'c:\\p\\rel',
      scrumSummary('c:\\p\\rel', { releasing: { id: 'S09', title: 'x', step: 'release-check' }, bandLine: 'S09 Release 2/2 · Release check' }),
    );
    expect(trayStateFromProjects([releasing])).toMatchObject({ tile: 'sprint', tooltip: 'S09 Release 2/2 · rel' });
  });

  it('turns to attention and counts projects, not sessions', () => {
    const waiting = project('c:\\p\\w', scrumSummary('c:\\p\\w'), [sessionIn('c:\\p\\w', 'waiting'), sessionIn('c:\\p\\w', 'waiting', { host: 'wsl:Ubuntu' })]);
    const state = trayStateFromProjects([building('c:\\p\\claude'), stalled('c:\\p\\mmo'), waiting]);
    expect(state.tile).toBe('attention');
    expect(state.badge).toBe(2);
    expect(state.tooltip).toBe('S14 Build 4/12 · claude\nS03 Refine 2/6 · mmo\n2 projects need you');
  });

  it('turns to attention for a waiting session in a project with no sprint', () => {
    const other = project('c:\\p\\o', plainSummary('c:\\p\\o'), [sessionIn('c:\\p\\o', 'waiting')]);
    expect(trayStateFromProjects([other])).toEqual({
      tile: 'attention',
      badge: 1,
      tooltip: 'No sprint running\n1 project needs you',
    });
  });

  it('ignores a waiting session that has been seen', () => {
    const seen = project('c:\\p\\s', scrumSummary('c:\\p\\s'), [sessionIn('c:\\p\\s', 'waiting', { seen: true })]);
    expect(trayStateFromProjects([seen]).tile).toBe('idle');
  });

  it('maps the tiles onto the shapes tray-icons already draws', () => {
    expect(TRAY_TILE_ICON).toEqual({ idle: 'none', sprint: 'working', attention: 'waiting' });
  });
});

describe('sprintLabel and projectMenuLabel', () => {
  it('shortens the band line to the sprint, its phase and its progress', () => {
    expect(sprintLabel(building('c:\\p\\x'))).toBe('S14 Build 4/12');
    expect(sprintLabel(building('c:\\p\\x', 'S09 Release 2/2'))).toBe('S09 Release 2/2');
  });

  it('adds the reasons to the menu label', () => {
    expect(projectMenuLabel(stalled('c:\\p\\mmo'))).toBe('mmo — S03 Refine 2/6 · stalled 18m');
    expect(projectMenuLabel(project('c:\\p\\q', scrumSummary('c:\\p\\q')))).toBe('q — no sprint');
  });
});

describe('fitTooltip', () => {
  it('leaves a short tooltip alone', () => {
    expect(fitTooltip(['a', 'b'])).toBe('a\nb');
  });

  it('never exceeds the 127 characters Windows shows', () => {
    const lines = Array.from({ length: 12 }, (_, i) => `S${10 + i} Build ${i}/12 · a-rather-long-project-name-${i}`);
    const text = fitTooltip(lines);
    expect(text.length).toBeLessThanOrEqual(TRAY_TOOLTIP_MAX);
    expect(text.split('\n')[0]).toBe(lines[0]);
    expect(text).toMatch(/\n\+\d+ more$/);
  });

  it('counts the hidden lines exactly', () => {
    const lines = Array.from({ length: 8 }, (_, i) => `S${i} Build 1/2 · p${i}`.padEnd(30, 'x'));
    const text = fitTooltip(lines);
    const shown = text.split('\n').length - 1;
    expect(text.endsWith(`+${lines.length - shown} more`)).toBe(true);
  });

  it('cuts a single line that is too long', () => {
    const text = fitTooltip(['x'.repeat(300)]);
    expect(text).toHaveLength(TRAY_TOOLTIP_MAX);
    expect(text.endsWith('…')).toBe(true);
  });

  it('stays within the limit for real projects too', () => {
    const many = Array.from({ length: 10 }, (_, i) => building(`c:\\p\\project-number-${i}`));
    expect(trayStateFromProjects(many).tooltip.length).toBeLessThanOrEqual(TRAY_TOOLTIP_MAX);
  });
});
