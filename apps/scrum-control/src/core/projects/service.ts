/**
 * `ProjectsService`: the glue between the session engine, the open VS Code windows and the
 * scrum monitor (CONCEPT §3, §4, §8).
 *
 * On every engine refresh (the 5 s tick and every file change), every scrum change and every
 * settings change it
 *
 *  1. recomputes the open folders from the IDE locks, pid liveness and the window list;
 *  2. keeps the scrum monitor on the right projects, and tells it which ones have a working
 *     session (that drives the stall rule and the poll rate);
 *  3. builds the `ProjectView`s and emits `projects` when they differ from the last ones;
 *  4. turns summary changes into toasts: `scrumNotifications`, each dedupe key at most once for
 *     the life of the service. The first computation is the baseline and announces nothing.
 *
 * Everything it touches is injectable. It never writes anything.
 */

import { EventEmitter } from 'node:events';
import type { EngineSnapshot } from '../engine.ts';
import type { AppSettings } from '../model/settings.ts';
import type { IdeWindowRef } from '../model/types.ts';
import { isAliveSync } from '../registry/liveness.ts';
import { filterByToggles, scrumEvents } from '../scrum/events.ts';
import { ScrumMonitor } from '../scrum/monitor.ts';
import type { ProjectScrumSummary, ScrumNotification } from '../scrum/types.ts';
import { findOpenFolders, type OpenFolder, type TopLevelWindow } from './openWindows.ts';
import { buildProjects, groupIntoProjects } from './projects.ts';
import type { ProjectView } from './types.ts';
import { NO_VSCODE_FOLDERS, type VsCodeFolders } from './vscodeFolders.ts';

/** What the service needs from the engine. */
export interface ProjectsEngine {
  on(event: 'sessions', listener: (snapshot: EngineSnapshot) => void): unknown;
  off(event: 'sessions', listener: (snapshot: EngineSnapshot) => void): unknown;
  getSnapshot(): EngineSnapshot;
  getIdeWindows(): IdeWindowRef[];
}

/** The part of the monitor the service drives; `ScrumMonitor` satisfies it. */
export type ProjectsMonitor = Pick<ScrumMonitor, 'setProjects' | 'setWorking' | 'summaries' | 'refresh' | 'dispose' | 'on' | 'off'>;

export interface ProjectsServiceOptions {
  engine: ProjectsEngine;
  settings: () => Pick<AppSettings, 'scrumNotifications'>;
  /** The scrum monitor. Default: a real one reading `configDir`. */
  monitor?: ProjectsMonitor;
  /** The Claude Code config directory the default monitor reads plugin versions from. */
  configDir?: string | null;
  /** Visible top-level windows, or null when they cannot be enumerated. Must be cheap and must not throw. */
  listWindows?: () => readonly TopLevelWindow[] | null;
  /** Which of these pids are alive. Default: signal-0 liveness. */
  alivePids?: (pids: readonly number[]) => Promise<ReadonlySet<number>>;
  /** The folders VS Code itself knows (`createVsCodeFolderReader`). Must be cheap and must not throw. Default: none. */
  vscodeFolders?: () => VsCodeFolders;
}

export interface ProjectsServiceEvents {
  projects: (projects: ProjectView[]) => void;
  scrumNotifications: (notifications: ScrumNotification[]) => void;
}

export class ProjectsService {
  private readonly emitter = new EventEmitter();
  private readonly engine: ProjectsEngine;
  private readonly monitor: ProjectsMonitor;
  private readonly settings: ProjectsServiceOptions['settings'];
  private readonly listWindows: () => readonly TopLevelWindow[] | null;
  private readonly alivePids: (pids: readonly number[]) => Promise<ReadonlySet<number>>;
  private readonly vscodeFolders: () => VsCodeFolders;

  private projects: ProjectView[] = [];
  private openFolders: OpenFolder[] = [];
  private fingerprint = '';
  private baseline: Map<string, ProjectScrumSummary> | undefined;
  private readonly announced = new Set<string>();

  private running: Promise<void> | null = null;
  private again = false;
  private started = false;
  private disposed = false;

  private readonly onSessions = (): void => {
    void this.recompute();
  };
  private readonly onScrumChange = (): void => {
    void this.recompute();
  };

  constructor(options: ProjectsServiceOptions) {
    this.engine = options.engine;
    this.settings = options.settings;
    this.monitor = options.monitor ?? new ScrumMonitor({ configDir: options.configDir ?? null });
    this.listWindows = options.listWindows ?? (() => null);
    this.alivePids =
      options.alivePids ?? (async (pids) => new Set(pids.filter((pid) => isAliveSync(pid))));
    this.vscodeFolders = options.vscodeFolders ?? (() => NO_VSCODE_FOLDERS);
  }

  on<K extends keyof ProjectsServiceEvents>(event: K, listener: ProjectsServiceEvents[K]): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  off<K extends keyof ProjectsServiceEvents>(event: K, listener: ProjectsServiceEvents[K]): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /** Subscribes to the engine and the monitor and computes once (the baseline). */
  async start(): Promise<void> {
    if (this.started || this.disposed) return;
    this.started = true;
    this.engine.on('sessions', this.onSessions);
    this.monitor.on('change', this.onScrumChange);
    await this.recompute();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.engine.off('sessions', this.onSessions);
    this.monitor.off('change', this.onScrumChange);
    this.emitter.removeAllListeners();
    await this.monitor.dispose();
  }

  /** The current projects, most urgent first. */
  getProjects(): ProjectView[] {
    return this.projects;
  }

  getProject(key: string): ProjectView | undefined {
    return this.projects.find((project) => project.key === key);
  }

  /** Settings changed (notification toggles): recompute now. */
  refreshSettings(): Promise<void> {
    return this.recompute();
  }

  /** Re-reads every project's ai-scrum files, then recomputes. */
  async refreshScrum(): Promise<void> {
    await this.monitor.refresh();
    await this.recompute();
  }

  /** Serialized: a call while one runs asks for one more pass instead of racing it. */
  recompute(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.running !== null) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          await this.computeOnce();
        } while (this.again && !this.disposed);
      } catch {
        // A failed pass keeps the previous projects; the next tick tries again.
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  // --- internals ---

  private async computeOnce(): Promise<void> {
    const snapshot = this.engine.getSnapshot();
    const settings = this.settings();

    const locks = this.engine.getIdeWindows();
    const alive = locks.length > 0 ? await this.alivePids([...new Set(locks.map((lock) => lock.pid))]) : new Set<number>();
    if (this.disposed) return;

    let windows: readonly TopLevelWindow[] | null = null;
    try {
      windows = this.listWindows();
    } catch {
      windows = null;
    }
    let vscode: VsCodeFolders = NO_VSCODE_FOLDERS;
    if (windows !== null) {
      try {
        vscode = this.vscodeFolders();
      } catch {
        vscode = NO_VSCODE_FOLDERS;
      }
    }
    this.openFolders = findOpenFolders({
      locks,
      alivePids: alive,
      windows,
      knownPaths: [...snapshot.projects.map((project) => project.path), ...vscode.known],
      openedPaths: vscode.opened,
    });

    // The monitor follows the shown projects: open folders and the homes of live sessions.
    const buckets = groupIntoProjects(this.openFolders, snapshot.sessions);
    this.monitor.setProjects(buckets.map((bucket) => bucket.path));
    for (const bucket of buckets) {
      this.monitor.setWorking(bucket.key, bucket.sessions.some((session) => session.status === 'working'));
    }

    const summaries = this.monitor.summaries();
    const projects = buildProjects({
      openFolders: this.openFolders,
      sessions: snapshot.sessions,
      summaries,
    });

    this.announce(summaries, settings.scrumNotifications);

    const fingerprint = JSON.stringify(projects);
    if (fingerprint === this.fingerprint) return;
    this.fingerprint = fingerprint;
    this.projects = projects;
    this.emitter.emit('projects', projects);
  }

  private announce(
    summaries: Map<string, ProjectScrumSummary>,
    toggles: AppSettings['scrumNotifications'],
  ): void {
    const previous = this.baseline;
    this.baseline = summaries;
    const fresh = filterByToggles(scrumEvents(previous, summaries), toggles).filter(
      (notification) => !this.announced.has(notification.dedupeKey),
    );
    if (fresh.length === 0) return;
    for (const notification of fresh) this.announced.add(notification.dedupeKey);
    this.emitter.emit('scrumNotifications', fresh);
  }
}
