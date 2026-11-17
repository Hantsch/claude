/**
 * Which folders have a VS Code window open right now (CONCEPT §3). Pure: the IDE locks, the
 * pid liveness answer, the list of top-level windows and the known project paths are all handed
 * in, so every rule is testable without a desktop.
 *
 * Two sources, in this order:
 *
 *  1. **A lock.** `<root>/ide/*.lock` names a pid and workspace folders. The lock counts when its
 *     pid is alive and - where a window list exists - one of that pid's visible windows is titled
 *     after the folder (one VS Code process owns one window per workspace, so the pid alone is
 *     not enough, and a lock may outlive its window). When the pid owns no window at all (it is an
 *     extension host, not the main process) the check looks at every VS Code window instead.
 *  2. **A title.** A VS Code window whose Claude extension wrote no lock is recognised by its
 *     title naming the folder of a *known* project path. Known paths only - nothing is guessed
 *     from a title, and a folder name that two known projects share is not used at all.
 *
 * Without a window list (the CLI cannot enumerate windows) only pid liveness is available: every
 * live lock counts and the title source is skipped.
 */

import { isPathInside, normalizePathKey } from '../adapters/claude/paths.ts';
import type { IdeWindowRef } from '../model/types.ts';
import { folderBaseName, titleMatches } from './titles.ts';

/** A visible top-level window, as the main process enumerates them. */
export interface TopLevelWindow {
  /** Opaque, unique per window; only used to keep one window from being claimed twice. */
  handle: string;
  pid: number;
  /** File name of the owning executable (`Code.exe`); empty when it could not be told. */
  processName: string;
  title: string;
}

export interface OpenFolder {
  /** The folder as the lock or the known project path spells it. */
  path: string;
  /** `normalizePathKey` of `path`. */
  key: string;
  /** Pid of the process that owns the window (the matched window's, else the lock's). */
  pid: number;
  via: 'lock' | 'title';
}

export interface OpenWindowsInput {
  /** IDE locks of the Windows root. */
  locks: readonly IdeWindowRef[];
  /** Which of the locks' pids are alive. */
  alivePids: ReadonlySet<number>;
  /** Visible top-level windows, or null when they cannot be enumerated. */
  windows: readonly TopLevelWindow[] | null;
  /** Project paths seen in live sessions and in the history index. */
  knownPaths: readonly string[];
}

/** VS Code and its forks, by executable name; falls back to the title when the name is unknown. */
export function isCodeWindow(window: TopLevelWindow): boolean {
  if (window.processName !== '') return /^(code|code - insiders|vscodium|codium)(\.exe)?$/i.test(window.processName);
  return /visual studio code|vscodium/i.test(window.title);
}

export function findOpenFolders(input: OpenWindowsInput): OpenFolder[] {
  const { windows } = input;
  const found = new Map<string, OpenFolder>();
  const claimed = new Set<string>();
  const codeWindows = windows === null ? [] : windows.filter(isCodeWindow);

  for (const lock of input.locks) {
    if (!input.alivePids.has(lock.pid)) continue;
    for (const folder of lock.workspaceFolders) {
      const key = normalizePathKey(folder);
      if (found.has(key)) continue;
      if (windows === null) {
        found.set(key, { path: folder, key, pid: lock.pid, via: 'lock' });
        continue;
      }
      const owned = windows.filter((window) => window.pid === lock.pid);
      const pool = owned.length > 0 ? owned : codeWindows;
      const name = folderBaseName(folder);
      const match = pool.find((window) => !claimed.has(window.handle) && titleMatches(window.title, name, 'segment'));
      if (!match) continue;
      claimed.add(match.handle);
      found.set(key, { path: folder, key, pid: match.pid, via: 'lock' });
    }
  }

  if (windows !== null) {
    const insideOpen = (path: string): boolean => [...found.values()].some((open) => isPathInside(path, open.path));
    // A folder name that two known projects share cannot say which of them the window shows.
    const byName = new Map<string, Set<string>>();
    const known = new Map<string, string>();
    for (const path of input.knownPaths) {
      const key = normalizePathKey(path);
      if (key === '' || known.has(key)) continue;
      known.set(key, path);
      const name = folderBaseName(path).toLowerCase();
      const keys = byName.get(name) ?? new Set<string>();
      keys.add(key);
      byName.set(name, keys);
    }
    for (const [key, path] of known) {
      if (found.has(key) || insideOpen(path)) continue;
      const name = folderBaseName(path);
      if ((byName.get(name.toLowerCase())?.size ?? 0) !== 1) continue;
      const match = codeWindows.find((window) => !claimed.has(window.handle) && titleMatches(window.title, name, 'segment'));
      if (!match) continue;
      claimed.add(match.handle);
      found.set(key, { path, key, pid: match.pid, via: 'title' });
    }
  }

  return [...found.values()];
}
