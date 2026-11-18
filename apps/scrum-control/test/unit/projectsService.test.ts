/**
 * ProjectsService with fakes: the engine, the monitor, the window list and pid liveness are all
 * injected, so every rule (baseline, dedupe, toggles, hiding, the monitor's inputs) is driven by
 * hand.
 */

import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { normalizePathKey } from '../../src/core/adapters/claude/paths.ts';
import type { EngineSnapshot } from '../../src/core/engine.ts';
import { DEFAULT_SETTINGS } from '../../src/core/model/settings.ts';
import type { IdeWindowRef, SessionView } from '../../src/core/model/types.ts';
import type { TopLevelWindow } from '../../src/core/projects/openWindows.ts';
import { ProjectsService, type ProjectsMonitor } from '../../src/core/projects/service.ts';
import type { ProjectView } from '../../src/core/projects/types.ts';
import type { ProjectScrumSummary, ScrumNotification } from '../../src/core/scrum/types.ts';
import { plainSummary, scrumSummary, sessionIn, sprint, summaryMap } from '../fixtures/projects.ts';

const CLAUDE = 'c:\\development\\Hantsch\\claude';
const MMO = 'C:\\development\\Hantsch\\Hantsch-MMO';

class FakeEngine extends EventEmitter {
  sessions: SessionView[] = [];
  locks: IdeWindowRef[] = [];
  known: string[] = [];

  getSnapshot(): EngineSnapshot {
    return {
      sessions: this.sessions,
      projects: this.known.map((path) => ({ path, name: path, key: normalizePathKey(path) })),
    } as unknown as EngineSnapshot;
  }

  getIdeWindows(): IdeWindowRef[] {
    return this.locks;
  }

  tick(): void {
    this.emit('sessions', this.getSnapshot());
  }
}

class FakeMonitor extends EventEmitter {
  watched: string[] = [];
  working = new Map<string, boolean>();
  data = new Map<string, ProjectScrumSummary>();
  refreshed = 0;
  disposed = false;

  setProjects(paths: readonly string[]): void {
    this.watched = [...paths];
  }

  setWorking(key: string, working: boolean): void {
    this.working.set(normalizePathKey(key), working);
  }

  summaries(): Map<string, ProjectScrumSummary> {
    return new Map(this.data);
  }

  async refresh(): Promise<void> {
    this.refreshed += 1;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }

  /** The scanner publishing a summary. */
  publish(summary: ProjectScrumSummary): void {
    this.data.set(normalizePathKey(summary.projectPath), summary);
    this.emit('change', normalizePathKey(summary.projectPath));
  }
}

const lock = (pid: number, folder: string): IdeWindowRef => ({
  pid,
  ideName: 'Visual Studio Code',
  workspaceFolders: [folder],
  source: `ide/${pid}.lock`,
});

interface Harness {
  engine: FakeEngine;
  monitor: FakeMonitor;
  service: ProjectsService;
  projects: ProjectView[][];
  toasts: ScrumNotification[][];
  settings: { scrumNotifications: typeof DEFAULT_SETTINGS.scrumNotifications };
  windows: { current: readonly TopLevelWindow[] | null | 'throw' };
  vscode: { opened: string[]; known: string[]; calls: number };
}

function harness(): Harness {
  const engine = new FakeEngine();
  const monitor = new FakeMonitor();
  const settings = {
    scrumNotifications: { ...DEFAULT_SETTINGS.scrumNotifications },
  };
  const windows: Harness['windows'] = { current: null };
  const vscode: Harness['vscode'] = { opened: [], known: [], calls: 0 };
  const service = new ProjectsService({
    engine,
    monitor: monitor as unknown as ProjectsMonitor,
    settings: () => settings,
    listWindows: () => {
      if (windows.current === 'throw') throw new Error('enumeration failed');
      return windows.current;
    },
    alivePids: async (pids) => new Set(pids),
    vscodeFolders: () => {
      vscode.calls += 1;
      return vscode;
    },
  });
  const h: Harness = { engine, monitor, service, projects: [], toasts: [], settings, windows, vscode };
  service.on('projects', (list) => h.projects.push(list));
  service.on('scrumNotifications', (list) => h.toasts.push(list));
  return h;
}

describe('ProjectsService projects', () => {
  it('follows the open folders and the homes of live sessions, and tells the monitor who works', async () => {
    const h = harness();
    h.engine.locks = [lock(100, CLAUDE)];
    h.engine.sessions = [sessionIn(`${CLAUDE}\\apps`, 'working'), sessionIn(MMO, 'done')];
    await h.service.start();

    expect(h.monitor.watched.sort()).toEqual([CLAUDE, MMO].sort());
    expect(h.monitor.working.get(normalizePathKey(CLAUDE))).toBe(true);
    expect(h.monitor.working.get(normalizePathKey(MMO))).toBe(false);
  });

  it('builds the views from the monitor summaries and emits when they change', async () => {
    const h = harness();
    h.engine.locks = [lock(100, CLAUDE)];
    h.engine.sessions = [sessionIn(CLAUDE, 'working')];
    await h.service.start();
    // Nothing scanned yet: the project is not shown rather than shown in the wrong section.
    expect(h.service.getProjects()).toEqual([]);

    h.monitor.publish(scrumSummary(CLAUDE, { sprint: sprint(), bandLine: 'S14 Build 4/12' }));
    await h.service.recompute();
    expect(h.service.getProjects().map((p) => [p.name, p.section, p.hasWindow])).toEqual([['claude', 'scrum', true]]);
    expect(h.service.getProject(normalizePathKey(CLAUDE))?.scrum?.bandLine).toBe('S14 Build 4/12');
    const emitted = h.projects.length;
    expect(emitted).toBeGreaterThan(0);

    // A pass that finds nothing new emits nothing.
    await h.service.recompute();
    h.engine.tick();
    await h.service.recompute();
    expect(h.projects).toHaveLength(emitted);
  });

  it('recomputes on every engine refresh, so a closed window disappears on the next tick', async () => {
    const h = harness();
    h.engine.locks = [lock(100, CLAUDE)];
    h.windows.current = [{ handle: '1', pid: 100, processName: 'Code.exe', title: 'claude - Visual Studio Code' }];
    h.monitor.data = summaryMap(scrumSummary(CLAUDE));
    await h.service.start();
    expect(h.service.getProjects()).toHaveLength(1);

    h.windows.current = [];
    h.engine.tick();
    await h.service.recompute();
    expect(h.service.getProjects()).toEqual([]);
  });

  it('finds a window without a lock by its title, for a known project', async () => {
    const h = harness();
    h.engine.known = [MMO];
    h.windows.current = [{ handle: '1', pid: 7, processName: 'Code.exe', title: 'Hantsch-MMO [WSL: Ubuntu] - Visual Studio Code' }];
    h.monitor.data = summaryMap(scrumSummary(MMO));
    await h.service.start();
    expect(h.service.getProjects()[0]).toMatchObject({ name: 'Hantsch-MMO', hasWindow: true, windowPid: 7 });
  });

  it('survives a window enumeration that throws, falling back to the locks', async () => {
    const h = harness();
    h.engine.locks = [lock(100, CLAUDE)];
    h.windows.current = 'throw';
    h.monitor.data = summaryMap(scrumSummary(CLAUDE));
    await h.service.start();
    expect(h.service.getProjects()).toHaveLength(1);
  });

  it('finds a window that has neither lock nor session through the folders VS Code knows, and lists it in Other', async () => {
    const h = harness();
    const kingdom = 'c:\\development\\Hantsch\\T-T-Agent-Kingdom';
    h.vscode.known = [kingdom];
    h.windows.current = [{ handle: '1', pid: 7, processName: 'Code.exe', title: 'notes.md - T-T-Agent-Kingdom - Visual Studio Code' }];
    h.monitor.data = summaryMap(plainSummary(kingdom));
    await h.service.start();
    expect(h.service.getProjects().map((p) => [p.name, p.section, p.hasWindow, p.sessions.length])).toEqual([
      ['T-T-Agent-Kingdom', 'other', true, 0],
    ]);
    expect(h.monitor.watched).toEqual([kingdom]);
  });

  it('does not ask VS Code for folders when windows cannot be enumerated', async () => {
    const h = harness();
    h.vscode.known = [CLAUDE];
    h.monitor.data = summaryMap(plainSummary(CLAUDE));
    await h.service.start();
    expect(h.vscode.calls).toBe(0);
    expect(h.service.getProjects()).toEqual([]);
  });

  it('stops listening and disposes the monitor', async () => {
    const h = harness();
    await h.service.start();
    await h.service.dispose();
    expect(h.monitor.disposed).toBe(true);
    expect(h.engine.listenerCount('sessions')).toBe(0);
    expect(h.monitor.listenerCount('change')).toBe(0);
  });
});

describe('ProjectsService scrum notifications', () => {
  const quiet = scrumSummary(CLAUDE, { bandLine: 'no sprint' });
  const started = scrumSummary(CLAUDE, { sprint: sprint({ id: 'S14' }), bandLine: 'S14 Build 0/12' });

  async function running(): Promise<Harness> {
    const h = harness();
    h.engine.locks = [lock(100, CLAUDE)];
    h.monitor.data = summaryMap(quiet);
    await h.service.start();
    return h;
  }

  it('announces nothing for the first computation, the baseline', async () => {
    const h = harness();
    h.engine.locks = [lock(100, CLAUDE)];
    h.monitor.data = summaryMap(started);
    await h.service.start();
    expect(h.toasts).toEqual([]);
  });

  it('announces a sprint that starts after the baseline, once', async () => {
    const h = await running();
    h.monitor.publish(started);
    await h.service.recompute();
    expect(h.toasts).toHaveLength(1);
    expect(h.toasts[0]![0]).toMatchObject({ kind: 'sprintStarted', projectName: 'claude', sprintId: 'S14' });

    // The same event again - the sprint flickers away and back - is not announced twice.
    h.monitor.publish(quiet);
    await h.service.recompute();
    h.monitor.publish(started);
    await h.service.recompute();
    expect(h.toasts).toHaveLength(1);
  });

  it('honours the toggles', async () => {
    const h = await running();
    h.settings.scrumNotifications = { ...h.settings.scrumNotifications, sprintStarted: false };
    h.monitor.publish(started);
    await h.service.recompute();
    expect(h.toasts).toEqual([]);
  });

  it('keeps storyDone off by default and announces it when switched on', async () => {
    const h = await running();
    const withStories = (done: number) =>
      scrumSummary(CLAUDE, {
        sprint: sprint({
          stories: [
            { id: '025', title: 'a', isDone: done >= 1 },
            { id: '026', title: 'b', isDone: done >= 2 },
          ],
        }),
        bandLine: 'S14',
      });
    h.monitor.publish(withStories(0));
    await h.service.recompute();
    h.toasts.length = 0;

    h.monitor.publish(withStories(1));
    await h.service.recompute();
    expect(h.toasts).toEqual([]);

    h.settings.scrumNotifications = { ...h.settings.scrumNotifications, storyDone: true };
    h.monitor.publish(withStories(2));
    await h.service.recompute();
    expect(h.toasts[0]?.map((n) => n.kind)).toEqual(['storyDone']);
  });

  it('stays silent about a project that appears after the baseline', async () => {
    const h = await running();
    h.engine.locks = [lock(100, CLAUDE), lock(100, MMO)];
    h.monitor.publish(scrumSummary(MMO, { sprint: sprint({ id: 'S03' }), bandLine: 'S03 Build' }));
    await h.service.recompute();
    expect(h.toasts).toEqual([]);
  });
});
