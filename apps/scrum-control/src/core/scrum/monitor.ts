/**
 * Keeps one `ProjectScrumSummary` per project fresh (CONCEPT §4). Read-only: it scans files and
 * never writes anything, into a project or anywhere else.
 *
 * Refresh policy:
 *  - once when a project is added;
 *  - a trailing 500 ms debounce after a change under the project's `.claude/` or its sprints
 *    path, for local (drive-letter) paths. `\\wsl.localhost\…` paths get no watcher: file events
 *    over the 9P share are unreliable, so they are polled;
 *  - a poll every 15 s while the project's sprint or release check runs or one of its sessions
 *    works, else every 60 s.
 *
 * The clock, the timers, the reader, the watcher factory and the scanner are injectable, so a
 * test drives time by hand. A scan that throws yields a summary with `error` set and never
 * stops the monitor.
 */

import { EventEmitter } from 'node:events';
import { watch } from 'chokidar';
import { normalizePathKey } from '../adapters/claude/paths.ts';
import { createFsReader } from './reader.ts';
import { scan } from './parser.ts';
import type { Reader, Snapshot } from './parser.ts';
import { emptySummary, summarize } from './summarize.ts';
import type { ProjectScrumSummary } from './types.ts';

export const DEBOUNCE_MS = 500;
export const FAST_POLL_MS = 15_000;
export const SLOW_POLL_MS = 60_000;
const DEFAULT_SPRINTS_PATH = 'docs/sprints';

export interface ScrumWatcher {
  close(): void | Promise<void>;
}

/** Starts watching `paths`; `onChange` fires for every file event, the monitor debounces. */
export type WatcherFactory = (paths: string[], onChange: () => void, onError: (error: Error) => void) => ScrumWatcher;

export interface ScrumTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface ScrumMonitorOptions {
  /** The Claude Code config directory the scanner reads plugin versions from. Default: none. */
  configDir?: string | null;
  reader?: Reader;
  now?: () => number;
  timers?: ScrumTimers;
  watcherFactory?: WatcherFactory;
  /** Replaceable for tests. */
  scan?: (reader: Reader, root: string, now: number) => Promise<Snapshot>;
  debounceMs?: number;
  fastPollMs?: number;
  slowPollMs?: number;
}

/** Local (drive-letter) paths are watched; UNC paths of a WSL distro are not. */
export function isWatchablePath(projectPath: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(projectPath);
}

/** Events under a Claude Code worktree or session store would only be noise. */
const WATCH_IGNORED = /[\\/]\.claude[\\/](worktrees|projects|plugins|todos)([\\/]|$)/;

const defaultTimers: ScrumTimers = {
  setTimeout: (fn, ms) => {
    const handle = setTimeout(fn, ms);
    // A pending poll must not hold the process open on shutdown.
    handle.unref?.();
    return handle;
  },
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

const chokidarFactory: WatcherFactory = (paths, onChange, onError) => {
  const watcher = watch(paths, {
    ignoreInitial: true,
    depth: 3,
    followSymlinks: false,
    usePolling: false,
    ignored: (path) => WATCH_IGNORED.test(path),
  });
  watcher.on('all', () => onChange());
  watcher.on('error', (error) => onError(error instanceof Error ? error : new Error(String(error))));
  return { close: () => watcher.close() };
};

interface ProjectState {
  path: string;
  key: string;
  working: boolean;
  snapshot: Snapshot | null;
  summary: ProjectScrumSummary | null;
  watchTargets: string;
  watcher: ScrumWatcher | null;
  debounce: unknown;
  poll: unknown;
  running: Promise<void> | null;
  rerun: boolean;
  disposed: boolean;
}

export class ScrumMonitor extends EventEmitter {
  private readonly projects = new Map<string, ProjectState>();
  private readonly reader: Reader;
  private readonly now: () => number;
  private readonly timers: ScrumTimers;
  private readonly watcherFactory: WatcherFactory;
  private readonly scanFn: (reader: Reader, root: string, now: number) => Promise<Snapshot>;
  private readonly debounceMs: number;
  private readonly fastPollMs: number;
  private readonly slowPollMs: number;
  private disposed = false;

  constructor(options: ScrumMonitorOptions = {}) {
    super();
    this.reader = options.reader ?? createFsReader(options.configDir ?? null);
    this.now = options.now ?? (() => Date.now());
    this.timers = options.timers ?? defaultTimers;
    this.watcherFactory = options.watcherFactory ?? chokidarFactory;
    this.scanFn = options.scan ?? scan;
    this.debounceMs = options.debounceMs ?? DEBOUNCE_MS;
    this.fastPollMs = options.fastPollMs ?? FAST_POLL_MS;
    this.slowPollMs = options.slowPollMs ?? SLOW_POLL_MS;
  }

  /** The projects to follow. New ones are scanned at once, dropped ones forgotten. */
  setProjects(paths: readonly string[]): void {
    if (this.disposed) return;
    const wanted = new Map<string, string>();
    for (const path of paths) {
      const key = normalizePathKey(path);
      if (!wanted.has(key)) wanted.set(key, path);
    }
    for (const [key, state] of [...this.projects]) {
      if (wanted.has(key)) continue;
      this.stop(state);
      this.projects.delete(key);
      this.emit('change', key);
    }
    for (const [key, path] of wanted) {
      if (this.projects.has(key)) continue;
      const state: ProjectState = {
        path,
        key,
        working: false,
        snapshot: null,
        summary: null,
        watchTargets: '',
        watcher: null,
        debounce: null,
        poll: null,
        running: null,
        rerun: false,
        disposed: false,
      };
      this.projects.set(key, state);
      this.startWatcher(state, this.watchTargetsFor(state, DEFAULT_SPRINTS_PATH));
      this.schedulePoll(state);
      void this.refreshState(state);
    }
  }

  /** A session of the project is (not) `working`: the stall rule and the poll rate follow. */
  setWorking(projectKey: string, working: boolean): void {
    const state = this.projects.get(normalizePathKey(projectKey));
    if (state === undefined || state.working === working) return;
    state.working = working;
    // The flag only changes how the files already read are summarized: no rescan.
    if (state.snapshot !== null) this.publish(state, this.summaryOf(state, state.snapshot, this.now()));
    this.schedulePoll(state);
  }

  /** Re-reads one project (by path), or all of them. Resolves when the scans are done. */
  async refresh(path?: string): Promise<void> {
    if (this.disposed) return;
    if (path === undefined) {
      await Promise.all([...this.projects.values()].map((state) => this.refreshState(state)));
      return;
    }
    const state = this.projects.get(normalizePathKey(path));
    if (state !== undefined) await this.refreshState(state);
  }

  summaries(): Map<string, ProjectScrumSummary> {
    const out = new Map<string, ProjectScrumSummary>();
    for (const [key, state] of this.projects) {
      if (state.summary !== null) out.set(key, state.summary);
    }
    return out;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const closing = [...this.projects.values()].map((state) => this.stop(state));
    this.projects.clear();
    this.removeAllListeners();
    await Promise.all(closing);
  }

  // --- internals ---

  private refreshState(state: ProjectState): Promise<void> {
    if (state.disposed) return Promise.resolve();
    if (state.running !== null) {
      // A scan is in flight and may have read the files before this change: go round again.
      state.rerun = true;
      return state.running;
    }
    state.running = (async () => {
      try {
        do {
          state.rerun = false;
          await this.scanOnce(state);
        } while (state.rerun && !state.disposed);
      } finally {
        state.running = null;
      }
    })();
    return state.running;
  }

  private async scanOnce(state: ProjectState): Promise<void> {
    const at = this.now();
    let summary: ProjectScrumSummary;
    try {
      const snapshot = await this.scanFn(this.reader, state.path, at);
      if (state.disposed) return;
      state.snapshot = snapshot;
      summary = this.summaryOf(state, snapshot, at);
      this.startWatcher(state, this.watchTargetsFor(state, await this.sprintsPath(state)));
    } catch (error) {
      if (state.disposed) return;
      const message = error instanceof Error ? error.message : String(error);
      // Keep what was last read, so one failed read does not blank the project.
      summary = { ...(state.summary ?? emptySummary(state.path, at)), readAt: at, error: message };
    }
    this.publish(state, summary);
    this.schedulePoll(state);
  }

  private summaryOf(state: ProjectState, snapshot: Snapshot, at: number): ProjectScrumSummary {
    return summarize(snapshot, { now: at, hasWorkingSession: state.working });
  }

  private publish(state: ProjectState, summary: ProjectScrumSummary): void {
    const before = state.summary;
    state.summary = summary;
    if (before === null || fingerprint(before) !== fingerprint(summary)) this.emit('change', state.key);
  }

  /** Fast while a sprint or release check runs or a session works, slow otherwise. */
  private isBusy(state: ProjectState): boolean {
    const s = state.summary;
    return state.working || (s !== null && (s.sprint !== null || s.releasing !== null || s.release?.isRunning === true));
  }

  private schedulePoll(state: ProjectState): void {
    if (state.poll !== null) this.timers.clearTimeout(state.poll);
    if (state.disposed) return;
    state.poll = this.timers.setTimeout(
      () => {
        state.poll = null;
        void this.refreshState(state);
      },
      this.isBusy(state) ? this.fastPollMs : this.slowPollMs,
    );
  }

  /** What to watch: the profile's directory and the sprints path, local projects only. */
  private watchTargetsFor(state: ProjectState, sprintsPath: string): string[] {
    if (!isWatchablePath(state.path)) return [];
    const root = state.path.replace(/[\\/]+$/, '');
    return [`${root}/.claude`, `${root}/${sprintsPath}`];
  }

  /** The sprints path as the profile names it, relative to the project. */
  private async sprintsPath(state: ProjectState): Promise<string> {
    try {
      const profile = await this.reader.read(`${state.path.replace(/[\\/]+$/, '')}/.claude/ai-scrum.md`);
      const value = /^sprints-path:[ \t]*(\S+)/m.exec(profile ?? '')?.[1];
      return value === undefined ? DEFAULT_SPRINTS_PATH : value.replace(/\/+$/, '');
    } catch {
      return DEFAULT_SPRINTS_PATH;
    }
  }

  private startWatcher(state: ProjectState, targets: string[]): void {
    const signature = targets.join('\n');
    if (signature === state.watchTargets || state.disposed) return;
    state.watchTargets = signature;
    void closeQuietly(state.watcher);
    state.watcher = null;
    if (targets.length === 0) return;
    try {
      state.watcher = this.watcherFactory(
        targets,
        () => this.onFileChange(state),
        () => {
          /* A watcher that fails leaves the poll as the fallback. */
        },
      );
    } catch {
      state.watcher = null;
    }
  }

  private onFileChange(state: ProjectState): void {
    if (state.disposed) return;
    if (state.debounce !== null) this.timers.clearTimeout(state.debounce);
    state.debounce = this.timers.setTimeout(() => {
      state.debounce = null;
      void this.refreshState(state);
    }, this.debounceMs);
  }

  private stop(state: ProjectState): Promise<void> {
    state.disposed = true;
    if (state.debounce !== null) this.timers.clearTimeout(state.debounce);
    if (state.poll !== null) this.timers.clearTimeout(state.poll);
    state.debounce = null;
    state.poll = null;
    const watcher = state.watcher;
    state.watcher = null;
    return closeQuietly(watcher);
  }
}

/** The summary without its read time, which changes on every scan. */
function fingerprint(summary: ProjectScrumSummary): string {
  return JSON.stringify({ ...summary, readAt: 0 });
}

async function closeQuietly(watcher: ScrumWatcher | null): Promise<void> {
  try {
    await watcher?.close();
  } catch {
    /* Closing a watcher that already failed is not worth reporting. */
  }
}
