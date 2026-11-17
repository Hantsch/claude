import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizePathKey } from '../../src/core/adapters/claude/paths.ts';
import {
  DEBOUNCE_MS,
  FAST_POLL_MS,
  SLOW_POLL_MS,
  ScrumMonitor,
  isWatchablePath,
  type ScrumMonitorOptions,
  type ScrumTimers,
  type WatcherFactory,
} from '../../src/core/scrum/monitor.ts';
import { scan, type Reader } from '../../src/core/scrum/parser.ts';
import { scrumProject } from '../fixtures/scrum/project.ts';

const MIN = 60_000;
const PROJECT = 'C:/proj';

/** Time by hand: timers run when the test advances the clock, never on their own. */
class ManualClock implements ScrumTimers {
  now = Date.UTC(2026, 10, 17, 12, 0, 0);
  private id = 0;
  private tasks = new Map<number, { at: number; fn: () => void }>();

  setTimeout(fn: () => void, ms: number): unknown {
    const id = ++this.id;
    this.tasks.set(id, { at: this.now + ms, fn });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.tasks.delete(handle as number);
  }

  get pending(): number {
    return this.tasks.size;
  }

  async advance(ms: number): Promise<void> {
    const end = this.now + ms;
    for (;;) {
      const due = [...this.tasks].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (due === undefined) break;
      this.tasks.delete(due[0]);
      this.now = due[1].at;
      due[1].fn();
      await settle();
    }
    this.now = end;
    await settle();
  }
}

/** Lets every promise chain of a scan run to its end. */
async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await new Promise<void>((resolve) => setImmediate(resolve));
}

/** An in-memory project: files by absolute path, mtimes for the trail files. */
function memoryReader(files: Record<string, string>, mtimes: Record<string, number> = {}): Reader & { files: Record<string, string> } {
  return {
    files,
    configDir: null,
    read: async (path) => files[path] ?? null,
    list: async (path) => {
      const prefix = `${path}/`;
      const seen = new Map<string, boolean>();
      for (const file of Object.keys(files)) {
        if (!file.startsWith(prefix)) continue;
        const rest = file.slice(prefix.length);
        const name = rest.split('/')[0] ?? rest;
        seen.set(name, (seen.get(name) ?? false) || rest.includes('/'));
      }
      return [...seen].map(([name, isDir]) => ({ name, isDir, mtimeMs: mtimes[`${prefix}${name}`] }));
    },
  };
}

const PROFILE = 'requirements-path: docs/requirements\nsprints-path: docs/sprints\n';
const idleFiles = (): Record<string, string> => ({
  [`${PROJECT}/.claude/ai-scrum.md`]: PROFILE,
  [`${PROJECT}/.claude/ai-scrum.lock`]: '{ "ai-scrum-version": "4.13.0", "files": {} }',
  [`${PROJECT}/docs/ROADMAP.md`]: '# Roadmap\n',
});
const runningSprint: Record<string, string> = {
  [`${PROJECT}/docs/sprints/S14/sprint.md`]: '---\nsprint: S14\nstatus: in-progress\n---\n\n# Sprint S14 - Lamp\n\n## Stories\n\n- [ ] 026 - Rotor\n',
  [`${PROJECT}/docs/sprints/S14/progress.md`]: '- 2026-11-17 09:51 · 026 · build · started\n',
};

interface Harness {
  clock: ManualClock;
  monitor: ScrumMonitor;
  scans: string[];
  watches: { paths: string[]; fire: () => void; closed: boolean }[];
  reader: ReturnType<typeof memoryReader>;
  changes: string[];
}

const open: ScrumMonitor[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((m) => m.dispose()));
});

function harness(files: Record<string, string>, options: ScrumMonitorOptions = {}, mtimes: Record<string, number> = {}): Harness {
  const clock = new ManualClock();
  const reader = memoryReader(files, mtimes);
  const scans: string[] = [];
  const watches: Harness['watches'] = [];
  const watcherFactory: WatcherFactory = (paths, onChange) => {
    const w = { paths, fire: onChange, closed: false };
    watches.push(w);
    return {
      close: () => {
        w.closed = true;
      },
    };
  };
  const monitor = new ScrumMonitor({
    reader,
    now: () => clock.now,
    timers: clock,
    watcherFactory,
    ...options,
    scan: async (r, root, now) => {
      scans.push(root);
      return (options.scan ?? scan)(r, root, now);
    },
  });
  open.push(monitor);
  const changes: string[] = [];
  monitor.on('change', (key: string) => changes.push(key));
  return { clock, monitor, scans, watches, reader, changes };
}

describe('ScrumMonitor', () => {
  it('scans a project when it is added and keys its summary by the normalized path', async () => {
    const h = harness(idleFiles());
    h.monitor.setProjects([PROJECT]);
    await settle();
    expect(h.scans).toEqual([PROJECT]);
    const summaries = h.monitor.summaries();
    expect([...summaries.keys()]).toEqual([normalizePathKey(PROJECT)]);
    const summary = summaries.get(normalizePathKey(PROJECT));
    expect(summary).toMatchObject({ projectPath: PROJECT, hasScrum: true, error: null, bandLine: 'no sprint', version: '4.13.0' });
    expect(h.changes).toEqual([normalizePathKey(PROJECT)]);
  });

  it('keeps one entry for paths that differ only in case or separators, and never rescans on setProjects', async () => {
    const h = harness(idleFiles());
    h.monitor.setProjects([PROJECT, 'c:\\proj\\']);
    await settle();
    expect(h.monitor.summaries().size).toBe(1);
    h.monitor.setProjects([PROJECT]);
    await settle();
    expect(h.scans).toHaveLength(1);
  });

  it('forgets a project that is dropped, and stops its timers and watcher', async () => {
    const h = harness(idleFiles());
    h.monitor.setProjects([PROJECT]);
    await settle();
    h.changes.length = 0;
    h.monitor.setProjects([]);
    expect(h.monitor.summaries().size).toBe(0);
    expect(h.changes).toEqual([normalizePathKey(PROJECT)]);
    expect(h.watches[0]?.closed).toBe(true);
    expect(h.clock.pending).toBe(0);
    await h.clock.advance(5 * MIN);
    expect(h.scans).toHaveLength(1);
  });

  describe('watching', () => {
    it('watches .claude and the sprints path of the profile for a local project', async () => {
      const files = idleFiles();
      files[`${PROJECT}/.claude/ai-scrum.md`] = 'sprints-path: planning/sprints/\n';
      const h = harness(files);
      h.monitor.setProjects([PROJECT]);
      await settle();
      // First the default, then the profile's own once the scan has read it.
      expect(h.watches.map((w) => w.paths)).toEqual([
        [`${PROJECT}/.claude`, `${PROJECT}/docs/sprints`],
        [`${PROJECT}/.claude`, `${PROJECT}/planning/sprints`],
      ]);
      expect(h.watches[0]?.closed).toBe(true);
      expect(h.watches[1]?.closed).toBe(false);
    });

    it('coalesces a burst of file events into one rescan, 500 ms after the last one', async () => {
      const h = harness(idleFiles());
      h.monitor.setProjects([PROJECT]);
      await settle();
      expect(DEBOUNCE_MS).toBe(500);
      const watch = h.watches[h.watches.length - 1];
      expect(watch).toBeDefined();
      watch?.fire();
      await h.clock.advance(300);
      watch?.fire();
      await h.clock.advance(300);
      watch?.fire();
      // 600 ms after the first event, 300 after the last: still waiting.
      await h.clock.advance(499);
      expect(h.scans).toHaveLength(1);
      await h.clock.advance(1);
      expect(h.scans).toHaveLength(2);
      await h.clock.advance(1_000);
      expect(h.scans).toHaveLength(2);
    });

    it('shows a change made to the files after the debounce', async () => {
      const h = harness(idleFiles());
      h.monitor.setProjects([PROJECT]);
      await settle();
      expect(h.monitor.summaries().get(normalizePathKey(PROJECT))?.sprint).toBeNull();
      Object.assign(h.reader.files, runningSprint);
      h.changes.length = 0;
      h.watches[h.watches.length - 1]?.fire();
      await h.clock.advance(DEBOUNCE_MS);
      expect(h.monitor.summaries().get(normalizePathKey(PROJECT))?.sprint?.id).toBe('S14');
      expect(h.changes).toEqual([normalizePathKey(PROJECT)]);
    });

    it('does not watch a WSL path; it is polled instead', async () => {
      const wsl = '//wsl.localhost/Ubuntu/home/me/proj';
      const files = Object.fromEntries(Object.entries(idleFiles()).map(([k, v]) => [k.replace(PROJECT, wsl), v]));
      const h = harness(files);
      h.monitor.setProjects([wsl]);
      await settle();
      expect(h.watches).toEqual([]);
      expect(h.monitor.summaries().get(normalizePathKey(wsl))?.hasScrum).toBe(true);
      await h.clock.advance(SLOW_POLL_MS);
      expect(h.scans).toHaveLength(2);
      expect(isWatchablePath('\\\\wsl.localhost\\Ubuntu\\home\\me\\proj')).toBe(false);
      expect(isWatchablePath('C:\\development\\x')).toBe(true);
      expect(isWatchablePath('d:/x')).toBe(true);
    });
  });

  describe('polling', () => {
    it('polls an idle project every 60 s', async () => {
      const h = harness(idleFiles());
      h.monitor.setProjects([PROJECT]);
      await settle();
      expect(SLOW_POLL_MS).toBe(60_000);
      await h.clock.advance(59_999);
      expect(h.scans).toHaveLength(1);
      await h.clock.advance(1);
      expect(h.scans).toHaveLength(2);
      await h.clock.advance(60_000);
      expect(h.scans).toHaveLength(3);
    });

    it('polls every 15 s while the project\'s sprint runs, and slows down when it ends', async () => {
      const files = { ...idleFiles(), ...runningSprint };
      const h = harness(files);
      h.monitor.setProjects([PROJECT]);
      await settle();
      expect(FAST_POLL_MS).toBe(15_000);
      await h.clock.advance(14_999);
      expect(h.scans).toHaveLength(1);
      await h.clock.advance(1);
      expect(h.scans).toHaveLength(2);
      await h.clock.advance(15_000);
      expect(h.scans).toHaveLength(3);

      // The sprint is finished: the next scan sees it and the cadence drops to 60 s.
      for (const k of Object.keys(runningSprint)) delete files[k];
      await h.clock.advance(15_000);
      expect(h.scans).toHaveLength(4);
      await h.clock.advance(59_999);
      expect(h.scans).toHaveLength(4);
      await h.clock.advance(1);
      expect(h.scans).toHaveLength(5);
    });

    it('polls every 15 s while a release check runs', async () => {
      const files = {
        ...idleFiles(),
        [`${PROJECT}/.git/ai-scrum/trail.md`]: '- 2026-11-17 11:03 · S09 · release-check · started · watch /tmp/x.log\n',
      };
      const h = harness(files);
      h.monitor.setProjects([PROJECT]);
      await settle();
      expect(h.monitor.summaries().get(normalizePathKey(PROJECT))?.release?.isRunning).toBe(true);
      await h.clock.advance(15_000);
      expect(h.scans).toHaveLength(2);
    });

    it('polls every 15 s while a session of the project works, 60 s again once it stops', async () => {
      const h = harness(idleFiles());
      h.monitor.setProjects([PROJECT]);
      await settle();
      h.monitor.setWorking(normalizePathKey(PROJECT), true);
      await h.clock.advance(15_000);
      expect(h.scans).toHaveLength(2);
      await h.clock.advance(15_000);
      expect(h.scans).toHaveLength(3);
      h.monitor.setWorking(normalizePathKey(PROJECT), false);
      await h.clock.advance(59_999);
      expect(h.scans).toHaveLength(3);
      await h.clock.advance(1);
      expect(h.scans).toHaveLength(4);
    });

    it('a working session elsewhere does not speed this project up', async () => {
      const h = harness(idleFiles());
      h.monitor.setProjects([PROJECT]);
      await settle();
      h.monitor.setWorking('c:/other', true);
      await h.clock.advance(30_000);
      expect(h.scans).toHaveLength(1);
    });
  });

  it('setWorking re-reads nothing but changes the stall verdict at once', async () => {
    const key = normalizePathKey(PROJECT);
    const trail = `${PROJECT}/docs/sprints/S14`;
    const h = harness({ ...idleFiles(), ...runningSprint }, {}, { [`${trail}/progress.md`]: Date.UTC(2026, 10, 17, 12, 0, 0) - 20 * MIN });
    h.monitor.setProjects([PROJECT]);
    await settle();
    expect(h.monitor.summaries().get(key)?.attention).toMatchObject({ stalled: true, stalledMinutes: 20 });

    h.changes.length = 0;
    h.monitor.setWorking(key, true);
    expect(h.monitor.summaries().get(key)?.attention.stalled).toBe(false);
    expect(h.changes).toEqual([key]);
    h.monitor.setWorking(key, true);
    expect(h.changes).toHaveLength(1);
    h.monitor.setWorking(key, false);
    expect(h.monitor.summaries().get(key)?.attention.stalled).toBe(true);
    expect(h.scans).toHaveLength(1);
  });

  it('only emits change when the summary differs, not for a new read time', async () => {
    const h = harness(idleFiles());
    h.monitor.setProjects([PROJECT]);
    await settle();
    h.changes.length = 0;
    await h.clock.advance(SLOW_POLL_MS);
    expect(h.scans).toHaveLength(2);
    expect(h.changes).toEqual([]);
    expect(h.monitor.summaries().get(normalizePathKey(PROJECT))?.readAt).toBe(h.clock.now);
  });

  describe('a scan that throws', () => {
    it('yields a summary with `error` set, keeps the last read, and recovers on the next scan', async () => {
      let fail = false;
      const h = harness({ ...idleFiles(), ...runningSprint }, {
        scan: async (r, root, now) => {
          if (fail) throw new Error('EBUSY: resource busy');
          return scan(r, root, now);
        },
      });
      const key = normalizePathKey(PROJECT);
      h.monitor.setProjects([PROJECT]);
      await settle();
      expect(h.monitor.summaries().get(key)?.error).toBeNull();

      fail = true;
      await h.monitor.refresh(PROJECT);
      const broken = h.monitor.summaries().get(key);
      expect(broken?.error).toBe('EBUSY: resource busy');
      expect(broken?.sprint?.id).toBe('S14');

      // The monitor is still alive and polls on.
      fail = false;
      await h.clock.advance(FAST_POLL_MS);
      expect(h.monitor.summaries().get(key)?.error).toBeNull();
    });

    it('a project whose first scan fails has an empty summary with the error', async () => {
      const h = harness(idleFiles(), {
        scan: async () => {
          throw 'plain string failure';
        },
      });
      h.monitor.setProjects([PROJECT]);
      await settle();
      expect(h.monitor.summaries().get(normalizePathKey(PROJECT))).toMatchObject({
        projectPath: PROJECT,
        hasScrum: false,
        error: 'plain string failure',
      });
    });

    it('one project failing does not stop the others', async () => {
      const other = 'C:/other';
      const files = { ...idleFiles(), ...Object.fromEntries(Object.entries(idleFiles()).map(([k, v]) => [k.replace(PROJECT, other), v])) };
      const h = harness(files, {
        scan: async (r, root, now) => {
          if (root === PROJECT) throw new Error('boom');
          return scan(r, root, now);
        },
      });
      h.monitor.setProjects([PROJECT, other]);
      await settle();
      expect(h.monitor.summaries().get(normalizePathKey(PROJECT))?.error).toBe('boom');
      expect(h.monitor.summaries().get(normalizePathKey(other))?.error).toBeNull();
    });
  });

  it('refresh(path) rescans one project, refresh() all, and a refresh during a scan runs once more', async () => {
    const other = 'C:/other';
    const files = { ...idleFiles(), ...Object.fromEntries(Object.entries(idleFiles()).map(([k, v]) => [k.replace(PROJECT, other), v])) };
    let release: () => void = () => undefined;
    let hold = false;
    const h = harness(files, {
      scan: async (r, root, now) => {
        if (hold) await new Promise<void>((resolve) => (release = resolve));
        return scan(r, root, now);
      },
    });
    h.monitor.setProjects([PROJECT, other]);
    await settle();
    expect(h.scans).toEqual([PROJECT, other]);
    await h.monitor.refresh(PROJECT);
    expect(h.scans).toEqual([PROJECT, other, PROJECT]);
    await h.monitor.refresh();
    expect(h.scans).toHaveLength(5);

    hold = true;
    const first = h.monitor.refresh(PROJECT);
    await settle();
    const second = h.monitor.refresh(PROJECT);
    const third = h.monitor.refresh(PROJECT);
    await settle();
    hold = false;
    release();
    await Promise.all([first, second, third]);
    // The scan in flight plus exactly one more for the two requests that came while it ran.
    expect(h.scans).toHaveLength(7);
  });

  it('dispose clears every timer, closes every watcher and stops scanning', async () => {
    const h = harness({ ...idleFiles(), ...runningSprint });
    h.monitor.setProjects([PROJECT]);
    await settle();
    h.watches[h.watches.length - 1]?.fire();
    await h.monitor.dispose();
    expect(h.clock.pending).toBe(0);
    expect(h.watches.every((w) => w.closed)).toBe(true);
    await h.clock.advance(10 * MIN);
    expect(h.scans).toHaveLength(1);
    await h.monitor.refresh();
    h.monitor.setProjects([PROJECT]);
    await settle();
    expect(h.scans).toHaveLength(1);
  });

  it('never writes: the files it was given are unchanged', async () => {
    const files = { ...idleFiles(), ...runningSprint };
    const before = JSON.stringify(files);
    const h = harness(files);
    h.monitor.setProjects([PROJECT]);
    await settle();
    await h.clock.advance(3 * MIN);
    expect(JSON.stringify(files)).toBe(before);
  });
});

describe('ScrumMonitor on the real file system', () => {
  it('sees a sprint start after a file change under docs/sprints (real chokidar, real timers)', async () => {
    const root = await scrumProject('idle');
    const key = normalizePathKey(root);
    const monitor = new ScrumMonitor({ debounceMs: 50 });
    open.push(monitor);
    monitor.setProjects([root]);
    await vi.waitFor(() => expect(monitor.summaries().get(key)?.bandLine).toBe('no sprint · next S10 planned'), { timeout: 5_000 });
    // Give chokidar a moment to finish its initial scan before the file changes.
    await new Promise((resolve) => setTimeout(resolve, 800));
    const dir = join(root, 'docs', 'sprints', 'S10');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'sprint.md'),
      '---\nsprint: S10\nstatus: in-progress\n---\n\n# Sprint S10 - Cranes that lift\n\n## Stories\n\n- [ ] 031 - Crane controller\n',
    );
    await vi.waitFor(() => expect(monitor.summaries().get(key)?.sprint?.id).toBe('S10'), { timeout: 8_000 });
  });
});
