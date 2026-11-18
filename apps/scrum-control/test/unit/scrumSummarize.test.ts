import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFsReader } from '../../src/core/scrum/reader.ts';
import { scan } from '../../src/core/scrum/parser.ts';
import { STALL_MS, summarize } from '../../src/core/scrum/summarize.ts';
import { scrumProject, type ScrumProjectOptions } from '../fixtures/scrum/project.ts';
import { makeTempDir } from '../fixtures/tempDir.ts';

const MIN = 60_000;

async function read(fixture: string, options: ScrumProjectOptions & { working?: boolean } = {}) {
  const now = options.now ?? Date.now();
  const root = await scrumProject(fixture, { ...options, now });
  const snapshot = await scan(createFsReader(null), root, now);
  return { root, now, snapshot, summary: summarize(snapshot, { now, hasWorkingSession: options.working ?? false }) };
}

describe('createFsReader', () => {
  it('answers null for a missing file and [] for a missing directory', async () => {
    const reader = createFsReader('C:/cfg');
    const dir = await makeTempDir('sc-reader-');
    expect(reader.configDir).toBe('C:/cfg');
    expect(await reader.read(join(dir, 'nope.md'))).toBeNull();
    expect(await reader.list(join(dir, 'nope'))).toEqual([]);
    // A file where a directory is expected is also just "nothing there".
    await writeFile(join(dir, 'file.txt'), 'x');
    expect(await reader.list(join(dir, 'file.txt'))).toEqual([]);
    expect(await reader.read(join(dir, 'file.txt', 'inner'))).toBeNull();
  });

  it('lists files with their mtime and directories without one', async () => {
    const dir = await makeTempDir('sc-reader-');
    await mkdir(join(dir, 'sub'));
    await writeFile(join(dir, 'a.md'), 'hello');
    const list = await createFsReader(null).list(dir);
    expect(list.find((e) => e.name === 'sub')).toEqual({ name: 'sub', isDir: true });
    const file = list.find((e) => e.name === 'a.md');
    expect(file?.isDir).toBe(false);
    expect(file?.mtimeMs).toBeGreaterThan(0);
    expect(await createFsReader(null).read(join(dir, 'a.md'))).toBe('hello');
  });
});

describe('summarize', () => {
  it('a project without ai-scrum has no scrum and an empty band line', async () => {
    const { summary, root } = await read('no-scrum');
    expect(summary.hasScrum).toBe(false);
    expect(summary.projectPath).toBe(root);
    expect(summary.sprint).toBeNull();
    expect(summary.bandLine).toBe('');
    expect(summary.error).toBeNull();
  });

  it('an idle project shows its planned sprint, milestones, debt and backlog', async () => {
    const { summary } = await read('idle');
    expect(summary.hasScrum).toBe(true);
    expect(summary.version).toBe('4.13.0');
    expect(summary.bandLine).toBe('no sprint · next S10 planned');
    expect(summary.sprint).toBeNull();
    expect(summary.nextPlanned).toEqual({ id: 'S10', storyCount: 3 });
    expect(summary.sprintsDone).toBe(1);
    expect(summary.phase).toBe('2 - Harbour');
    expect(summary.milestone).toEqual({ id: 'M2', name: 'Cranes' });
    expect(summary.milestonesDone).toBe(1);
    expect(summary.milestonesTotal).toBe(3);
    // Two roadmap items plus the open `kind: debt` story, against the profile's limit of 3.
    expect(summary.techDebt).toEqual({ count: 3, limit: 3, due: true });
    // Two stories done in INDEX.md, none noted by a review: 2 of 5.
    expect(summary.architect).toMatchObject({ since: 2, every: 5, due: false, lastReview: null });
    expect(summary.backlog).toEqual({ open: 5, ready: 3, unplanned: 2 });
    expect(summary.attention).toEqual({
      stalled: false,
      stalledMinutes: 0,
      blocked: false,
      blockedStory: null,
      releaseNo: false,
      releaseMissed: false,
    });
  });

  it('says "no sprint" when nothing is planned either', async () => {
    const { summary } = await read('idle', { files: { 'docs/sprints/S10/sprint.md': null } });
    expect(summary.bandLine).toBe('no sprint');
    expect(summary.nextPlanned).toBeNull();
  });

  it('a sprint in build names its stories, focus story, step and time left', async () => {
    const { summary } = await read('building', { trailAgeMs: 2 * MIN });
    const sprint = summary.sprint;
    expect(sprint).not.toBeNull();
    expect(sprint).toMatchObject({
      id: 'S14',
      title: 'A lamp that turns',
      phase: 'build',
      storiesDone: 1,
      storiesTotal: 4,
      progress: { done: 1, total: 4, unit: 'stories' },
      avgStoryMinutes: 30,
      minutesLeft: 90,
    });
    expect(sprint?.focus).toEqual({
      id: '026',
      title: 'Rotor drive',
      stage: 'implement',
      step: 'D2 Motor mount',
      stepAt: '2026-11-17 10:06',
      deliverablesDone: 1,
      deliverablesTotal: 5,
    });
    expect(sprint?.lastTrail).toBe('2026-11-17 10:06 · 026 · D2 Motor mount · started');
    expect(sprint?.stories.map((s) => [s.id, s.isDone])).toEqual([
      ['025', true],
      ['026', false],
      ['027', false],
      ['028', false],
    ]);
    // S14 Build 1/4, the story in focus, deliverable 2 of its 5.
    expect(summary.bandLine).toBe('S14 Build 1/4 · 026 D2/5');
    expect(summary.milestone).toEqual({ id: 'M3', name: 'Lighthouse' });
    expect(summary.attention.stalled).toBe(false);
  });

  it('ignores story durations the trail clock cannot have measured (mixed date and bare time)', async () => {
    const { summary } = await read('building', {
      files: {
        'docs/sprints/S14/progress.md':
          '- 08:30:50 · 025 · build · started\n- 2026-11-17 09:50 · 025 · story · done\n- 2026-11-17 09:51 · 026 · build · started\n',
      },
    });
    expect(summary.sprint?.avgStoryMinutes).toBeNull();
    expect(summary.sprint?.minutesLeft).toBeNull();
  });

  it('the refine phase counts refined stories', async () => {
    const { summary } = await read('building', {
      files: {
        'docs/sprints/S14/progress.md': '- 2026-11-17 09:00 · refine · 025 026 027 028 · started\n',
        'docs/requirements/027-story.md': '---\nid: 027\ntitle: Fog horn\nstatus: draft\n---\n',
        'docs/requirements/028-story.md': '---\nid: 028\ntitle: Keeper log\nstatus: draft\n---\n',
      },
    });
    expect(summary.sprint?.phase).toBe('refine');
    expect(summary.sprint?.progress).toEqual({ done: 2, total: 4, unit: 'refined' });
    expect(summary.sprint?.focus).toBeNull();
    expect(summary.bandLine).toBe('S14 Refine 2/4');
  });

  it('gate and review phases come from the trail', async () => {
    const trail = (last: string) =>
      `- 2026-11-17 09:51 · 026 · build · started\n- 2026-11-17 12:00 · gate · e2e-all · ${last}\n`;
    const started = await read('building', { files: { 'docs/sprints/S14/progress.md': trail('started') } });
    expect(started.summary.sprint?.phase).toBe('gate');
    expect(started.summary.bandLine).toBe('S14 Gate 1/4');
    const done = await read('building', { files: { 'docs/sprints/S14/progress.md': trail('done') } });
    expect(done.summary.sprint?.phase).toBe('review');
    expect(done.summary.bandLine).toBe('S14 Review 1/4');
  });

  describe('stalled', () => {
    it('is not stalled while the trail is fresh', async () => {
      const { summary } = await read('building', { trailAgeMs: 14 * MIN });
      expect(summary.attention.stalled).toBe(false);
      expect(summary.attention.stalledMinutes).toBe(0);
    });

    it('is stalled when the trail has been silent for 15 minutes and no session works', async () => {
      const { summary } = await read('building', { trailAgeMs: 18 * MIN + 30_000 });
      expect(summary.attention.stalled).toBe(true);
      expect(summary.attention.stalledMinutes).toBe(18);
      expect(summary.sprint?.trailAt).not.toBeNull();
    });

    it('the threshold is 15 minutes, inclusive', async () => {
      const now = Date.now();
      const { snapshot } = await read('building', { now, trailAgeMs: STALL_MS });
      expect(STALL_MS).toBe(15 * MIN);
      expect(summarize(snapshot, { now, hasWorkingSession: false }).attention.stalled).toBe(true);
      expect(summarize(snapshot, { now: now - 1, hasWorkingSession: false }).attention.stalled).toBe(false);
    });

    it('a working session of the project means the sprint is quiet, not stalled', async () => {
      const { summary } = await read('building', { trailAgeMs: 40 * MIN, working: true });
      expect(summary.attention.stalled).toBe(false);
      expect(summary.attention.stalledMinutes).toBe(0);
    });

    it('a project with no sprint in progress is never stalled', async () => {
      const { summary } = await read('idle', { trailAgeMs: 90 * MIN });
      expect(summary.attention.stalled).toBe(false);
    });
  });

  it('a blocked story is an attention flag with its reason as the step', async () => {
    const { summary } = await read('building', {
      files: {
        'docs/sprints/S14/progress.md':
          '- 2026-11-17 09:51 · 026 · build · started\n- 2026-11-17 10:20 · 026 · blocked: the motor spec is missing\n',
      },
    });
    expect(summary.attention.blocked).toBe(true);
    expect(summary.attention.blockedStory).toBe('026');
    expect(summary.sprint?.focus).toMatchObject({ stage: 'blocked', step: 'the motor spec is missing' });
    expect(summary.bandLine).toBe('S14 Build 1/4 · 026 blocked');
  });

  describe('release', () => {
    it('a verdict of yes is no attention, and a missed one is', async () => {
      const { summary } = await read('releasing');
      expect(summary.release).toMatchObject({
        kind: 'yes',
        step: 'release-check',
        isRunning: false,
        sprintId: 'S09',
        endedAt: '2026-11-17 11:15',
      });
      expect(summary.release?.verdict).toMatch(/^releasable: yes · merge of abc1234/);
      expect(summary.attention.releaseNo).toBe(false);
      expect(summary.attention.releaseMissed).toBe(true);
      expect(summary.bandLine).toBe('no sprint');
    });

    it('a verdict of NO is an attention flag until a check runs again', async () => {
      const no = '- 2026-11-17 11:15 · S09 · release-check · done · releasable: NO · Test: 2 red\n';
      const { summary } = await read('releasing', { files: { '.git/ai-scrum/trail.md': no } });
      expect(summary.release?.kind).toBe('NO');
      expect(summary.attention.releaseNo).toBe(true);

      const rerun = `${no}- 2026-11-17 12:00 · S09 · release-check · started · watch /tmp/x.log\n`;
      const again = await read('releasing', { files: { '.git/ai-scrum/trail.md': rerun } });
      expect(again.summary.release?.isRunning).toBe(true);
      expect(again.summary.attention.releaseNo).toBe(false);
    });

    it('a finished sprint whose phase 4 runs is `releasing` and shows in the band line', async () => {
      const running = [
        '- 2026-11-17 11:00 · S09 · roadmap-check · started',
        '- 2026-11-17 11:02 · S09 · roadmap-check · done',
        '- 2026-11-17 11:03 · S09 · release-check · started · watch /tmp/x.log',
      ].join('\n');
      const { summary } = await read('releasing', { files: { '.git/ai-scrum/trail.md': running } });
      expect(summary.sprint).toBeNull();
      expect(summary.releasing).toEqual({ id: 'S09', title: 'Docks open', step: 'release-check' });
      expect(summary.release?.isRunning).toBe(true);
      expect(summary.bandLine).toBe('S09 Release 2/2 · Release check');
    });

    it('`not tracked` is a verdict kind but no attention', async () => {
      const line = '- 2026-11-17 11:15 · S09 · release-check · done · releasable: not tracked · stage mvp\n';
      const { summary } = await read('releasing', { files: { '.git/ai-scrum/trail.md': line } });
      expect(summary.release?.kind).toBe('not tracked');
      expect(summary.attention.releaseNo).toBe(false);
    });
  });

  it('is plain JSON: it survives a round trip through IPC unchanged', async () => {
    const { summary } = await read('building', { trailAgeMs: 20 * MIN });
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
  });

  it('update hints name a project copy that lags behind its installed plugin', async () => {
    const root = await scrumProject('idle', {
      files: {
        'cfg/plugins/installed_plugins.json': JSON.stringify({
          plugins: { 'ai-scrum@hantsch': [{ scope: 'user', version: '4.20.0' }] },
        }),
      },
    });
    const snapshot = await scan(createFsReader(join(root, 'cfg')), root, Date.now());
    const summary = summarize(snapshot, { now: Date.now(), hasWorkingSession: false });
    expect(summary.updateHints).toEqual([
      {
        plugin: 'ai-scrum',
        text: 'ai-scrum in this project is 4.13.0, plugin is 4.20.0',
        command: '/ai-scrum:setup',
      },
    ]);
  });
});
