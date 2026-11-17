/**
 * The window list the projects service reads on every tick (CONCEPT §3).
 *
 * Enumerating windows is a synchronous FFI call and resolving each owner's executable name is
 * one more per process, so the answer is cached for a couple of seconds and the executable
 * names for as long as the pid lives. It never throws and never blocks on anything slow:
 * `null` means "windows cannot be enumerated here" (no FFI), which the service reads as "fall
 * back to pid liveness alone".
 */

import type { TopLevelWindow } from '../../core/projects/openWindows.ts';
import { isNativeFocusAvailable, listWindows, processImageName, type WindowInfo } from './win32.ts';

export interface WindowListerOptions {
  /** How long an enumeration is reused. */
  ttlMs?: number;
  now?: () => number;
  /** Replaceable for tests. */
  available?: () => boolean;
  enumerate?: () => WindowInfo[];
  processName?: (pid: number) => string;
}

export function createWindowLister(options: WindowListerOptions = {}): () => TopLevelWindow[] | null {
  const ttlMs = options.ttlMs ?? 2_000;
  const now = options.now ?? (() => Date.now());
  const available = options.available ?? isNativeFocusAvailable;
  const enumerate = options.enumerate ?? listWindows;
  const processName = options.processName ?? processImageName;

  const names = new Map<number, string>();
  let cached: TopLevelWindow[] | null = null;
  let cachedAt = Number.NEGATIVE_INFINITY;

  return () => {
    const at = now();
    if (at - cachedAt < ttlMs) return cached;
    cachedAt = at;
    try {
      if (!available()) {
        cached = null;
        return null;
      }
      const windows = enumerate();
      const seen = new Set<number>();
      cached = windows.map((window) => {
        seen.add(window.pid);
        let name = names.get(window.pid);
        if (name === undefined) {
          name = processName(window.pid);
          // An unknown name is retried on the next enumeration: the process may not be readable yet.
          if (name !== '') names.set(window.pid, name);
        }
        return { handle: window.handle, pid: window.pid, processName: name, title: window.title };
      });
      for (const pid of [...names.keys()]) if (!seen.has(pid)) names.delete(pid);
    } catch {
      cached = null;
    }
    return cached;
  };
}
