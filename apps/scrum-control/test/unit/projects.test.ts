/** The projects model (CONCEPT section 3): grouping, sections, attention and order. */

import { describe, expect, it } from 'vitest';
import { normalizePathKey } from '../../src/core/adapters/claude/paths.ts';
import type { OpenFolder } from '../../src/core/projects/openWindows.ts';
import { buildProjects, groupIntoProjects } from '../../src/core/projects/projects.ts';
import { plainSummary, scrumSummary, sessionIn, sprint, summaryMap } from '../fixtures/projects.ts';

const open = (path: string, pid = 100): OpenFolder => ({ path, key: normalizePathKey(path), pid, via: 'lock' });

const CLAUDE = 'c:\\development\\Hantsch\\claude';
const SCOTTY = 'c:\\development\\AIDU\\Nyota\\Frontend-Scotty';
const MMO = 'C:\\development\\Hantsch\\Hantsch-MMO';

describe('groupIntoProjects', () => {
  it('puts a session in the open folder that contains it, the longest match winning', () => {
    const inner = `${CLAUDE}\\plugins\\common`;
    const buckets = groupIntoProjects(
      [open(CLAUDE), open(inner, 200)],
      [sessionIn(`${CLAUDE}\\apps`), sessionIn(`${inner}\\skills`, 'done'), sessionIn(CLAUDE, 'waiting')],
    );
    const byKey = new Map(buckets.map((b) => [b.name, b.sessions.length]));
    expect(byKey.get('claude')).toBe(2);
    expect(byKey.get('common')).toBe(1);
  });

  it('makes a session in no open folder its own project, shared by Windows and WSL sessions of one folder', () => {
    const windows = sessionIn(MMO, 'working');
    const wsl = sessionIn(MMO, 'done', { host: 'wsl:Ubuntu', cwd: '/mnt/c/development/Hantsch/Hantsch-MMO' });
    const buckets = groupIntoProjects([open(CLAUDE)], [windows, wsl]);
    const mmo = buckets.find((b) => b.name === 'Hantsch-MMO')!;
    expect(mmo.sessions).toHaveLength(2);
    expect(mmo.hasWindow).toBe(false);
    expect(mmo.windowPid).toBeNull();
    expect(mmo.key).toBe(normalizePathKey(MMO));
  });

  it('keeps an open folder without sessions as a bucket', () => {
    const [bucket] = groupIntoProjects([open(SCOTTY, 321)], []);
    expect(bucket).toMatchObject({ name: 'Frontend-Scotty', hasWindow: true, windowPid: 321, sessions: [] });
  });
});

describe('buildProjects sections', () => {
  const base = { hidden: [] as string[] };

  it('shows a scrum project with a window and no session, in the scrum section', () => {
    const projects = buildProjects({
      ...base,
      openFolders: [open(SCOTTY)],
      sessions: [],
      summaries: summaryMap(scrumSummary(SCOTTY)),
    });
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ section: 'scrum', hasWindow: true, sessions: [], worstStatus: null, hosts: [] });
    expect(projects[0]!.scrum).not.toBeNull();
  });

  it('shows a scrum project with a session but no window', () => {
    const projects = buildProjects({
      ...base,
      openFolders: [],
      sessions: [sessionIn(MMO, 'working', { host: 'wsl:Ubuntu' })],
      summaries: summaryMap(scrumSummary(MMO)),
    });
    expect(projects[0]).toMatchObject({ section: 'scrum', hasWindow: false, hosts: ['wsl:Ubuntu'] });
  });

  it('drops a scrum project with neither window nor session', () => {
    expect(buildProjects({ ...base, openFolders: [], sessions: [], summaries: summaryMap(scrumSummary(MMO)) })).toEqual([]);
  });

  it('puts a non-scrum project with a session in Other, and drops a non-scrum window without one', () => {
    const projects = buildProjects({
      ...base,
      openFolders: [open(CLAUDE), open(SCOTTY)],
      sessions: [sessionIn(CLAUDE)],
      summaries: summaryMap(plainSummary(CLAUDE), plainSummary(SCOTTY)),
    });
    expect(projects.map((p) => [p.name, p.section, p.scrum])).toEqual([['claude', 'other', null]]);
  });

  it('skips a project whose scan has not finished', () => {
    expect(buildProjects({ ...base, openFolders: [open(CLAUDE)], sessions: [sessionIn(CLAUDE)], summaries: new Map() })).toEqual([]);
  });

  it('drops hidden projects, however the key is spelled', () => {
    const input = {
      openFolders: [open(CLAUDE)],
      sessions: [sessionIn(CLAUDE)],
      summaries: summaryMap(scrumSummary(CLAUDE)),
    };
    expect(buildProjects({ ...input, hidden: [normalizePathKey(CLAUDE)] })).toEqual([]);
    expect(buildProjects({ ...input, hidden: [CLAUDE.toUpperCase()] })).toEqual([]);
    expect(buildProjects({ ...input, hidden: ['c:/elsewhere'] })).toHaveLength(1);
  });
});

describe('buildProjects session facts', () => {
  it('counts statuses, names the worst one, orders the hosts and lists the sessions most urgent first', () => {
    const projects = buildProjects({
      openFolders: [open(CLAUDE)],
      sessions: [
        sessionIn(CLAUDE, 'working'),
        sessionIn(CLAUDE, 'working', { host: 'wsl:Ubuntu' }),
        sessionIn(CLAUDE, 'done', { host: 'wsl:Debian' }),
        sessionIn(CLAUDE, 'waiting', { seen: true }),
      ],
      summaries: summaryMap(scrumSummary(CLAUDE)),
      hidden: [],
    });
    const project = projects[0]!;
    expect(project.worstStatus).toBe('waiting');
    expect(project.statusCounts.map((c) => `${c.status}:${c.count}`)).toEqual(['waiting:1', 'done:1', 'working:2']);
    expect(project.hosts).toEqual(['windows', 'wsl:Debian', 'wsl:Ubuntu']);
    expect(project.sessions.map((s) => s.status)).toEqual(['waiting', 'done', 'working', 'working']);
  });
});

describe('buildProjects attention', () => {
  const attention = (overrides: Partial<ReturnType<typeof scrumSummary>['attention']>) =>
    scrumSummary(CLAUDE, {
      attention: {
        stalled: false,
        stalledMinutes: 0,
        blocked: false,
        blockedStory: null,
        releaseNo: false,
        releaseMissed: false,
        ...overrides,
      },
    });
  const build = (summary = scrumSummary(CLAUDE), sessions = [sessionIn(CLAUDE, 'working')]) =>
    buildProjects({ openFolders: [open(CLAUDE)], sessions, summaries: summaryMap(summary), hidden: [] })[0]!;

  it('is quiet by default', () => {
    expect(build()).toMatchObject({ needsAttention: false, attentionReasons: [] });
  });

  it('turns each scrum flag into a reason', () => {
    expect(build(attention({ stalled: true, stalledMinutes: 18 })).attentionReasons).toEqual(['stalled 18m']);
    expect(build(attention({ blocked: true, blockedStory: '026' })).attentionReasons).toEqual(['blocked 026']);
    expect(build(attention({ releaseNo: true })).attentionReasons).toEqual(['releasable: NO']);
    expect(build(attention({ releaseMissed: true })).attentionReasons).toEqual(['release verdict missed']);
    expect(build(attention({ stalled: true, stalledMinutes: 20, releaseNo: true })).needsAttention).toBe(true);
  });

  it('counts a waiting session until it has been seen, once per project however many wait', () => {
    expect(build(undefined, [sessionIn(CLAUDE, 'waiting')])).toMatchObject({
      needsAttention: true,
      attentionReasons: ['1 session needs you'],
    });
    const two = build(undefined, [sessionIn(CLAUDE, 'waiting'), sessionIn(CLAUDE, 'waiting', { host: 'wsl:Ubuntu' })]);
    expect(two.attentionReasons).toEqual(['2 sessions need you']);
    expect(build(undefined, [sessionIn(CLAUDE, 'waiting', { seen: true })]).needsAttention).toBe(false);
  });

  it('does not treat done or stale sessions as needing you', () => {
    expect(build(undefined, [sessionIn(CLAUDE, 'done'), sessionIn(CLAUDE, 'stale')]).needsAttention).toBe(false);
  });

  it('applies to Other projects too, where only sessions can raise it', () => {
    const project = buildProjects({
      openFolders: [],
      sessions: [sessionIn(MMO, 'waiting')],
      summaries: summaryMap(plainSummary(MMO)),
      hidden: [],
    })[0]!;
    expect(project).toMatchObject({ section: 'other', needsAttention: true });
  });
});

describe('buildProjects order', () => {
  it('lists scrum projects first, then attention, then a running sprint, then by name', () => {
    const paths = {
      zeta: 'c:\\p\\zeta',
      alpha: 'c:\\p\\alpha',
      sprinting: 'c:\\p\\sprinting',
      stalled: 'c:\\p\\stalled',
      other: 'c:\\p\\other',
    };
    const stalled = scrumSummary(paths.stalled, {
      attention: { stalled: true, stalledMinutes: 30, blocked: false, blockedStory: null, releaseNo: false, releaseMissed: false },
    });
    const projects = buildProjects({
      openFolders: [open(paths.zeta), open(paths.alpha), open(paths.sprinting), open(paths.stalled)],
      sessions: [sessionIn(paths.other)],
      summaries: summaryMap(
        scrumSummary(paths.zeta),
        scrumSummary(paths.alpha),
        scrumSummary(paths.sprinting, { sprint: sprint() }),
        stalled,
        plainSummary(paths.other),
      ),
      hidden: [],
    });
    expect(projects.map((p) => p.name)).toEqual(['stalled', 'sprinting', 'alpha', 'zeta', 'other']);
  });
});
