/**
 * Liveness of a Linux pid inside a running WSL distro (CONCEPT §2 "Liveness in WSL").
 *
 * No `wsl.exe` process per tick: the distro's `/proc` is readable from Windows through the
 * same UNC share the transcripts come from. `/proc/<pid>/stat` existing means the process
 * exists; field 22 (`starttime`, clock ticks since boot) is what the registry stores as
 * `procStart`, so a recycled pid is told apart exactly like the Windows probe does it with
 * creation times — but compared for equality, not within a tolerance.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProcessProbe } from '../registry/liveness.ts';
import { DEFAULT_WSL_BASE } from './roots.ts';

/** Field number of `starttime` in `proc(5)`. */
const STARTTIME_FIELD = 22;
/** `state` is field 3, the first one after the `comm` field that closes with `)`. */
const FIRST_FIELD_AFTER_COMM = 3;

/**
 * `starttime` out of the text of `/proc/<pid>/stat`, or null when it is not there.
 *
 * `comm` (field 2) is the executable name in parentheses and may itself contain spaces and
 * parentheses (`1234 (my (odd) app) S ...`), so fields are counted from the *last* `)`.
 */
export function parseProcStatStartTime(stat: string): string | null {
  const close = stat.lastIndexOf(')');
  if (close < 0) return null;
  const fields = stat
    .slice(close + 1)
    .trim()
    .split(/\s+/);
  const value = fields[STARTTIME_FIELD - FIRST_FIELD_AFTER_COMM];
  return value !== undefined && /^\d+$/.test(value) ? value : null;
}

/** Equality, with "unknown on either side" passing — a probe must not call a session stale on a guess. */
export function wslStampMatches(expected: string | null, actual: string | null | undefined): boolean {
  if (!expected || !actual) return true;
  return expected.trim() === actual.trim();
}

export interface WslProbeOptions {
  distro: string;
  /** Where distro shares are mounted. Default `//wsl.localhost`. */
  base?: string;
  /** Replaces the file read, for tests. Rejects when the file does not exist. */
  readFile?: (path: string) => Promise<string>;
}

export class WslProcessProbe implements ProcessProbe {
  private readonly procDir: string;
  private readonly read: (path: string) => Promise<string>;
  /** Stamp of every pid the last `alive()` saw, so `creationStamps()` does not read the file twice. */
  private readonly seen = new Map<number, string | null>();

  constructor(options: WslProbeOptions) {
    this.procDir = join(options.base ?? DEFAULT_WSL_BASE, options.distro, 'proc');
    this.read = options.readFile ?? ((path) => readFile(path, 'utf8'));
  }

  async alive(pids: readonly number[]): Promise<Set<number>> {
    const live = new Set<number>();
    this.seen.clear();
    await Promise.all(
      pids.map(async (pid) => {
        const text = await this.readStat(pid);
        if (text === null) return;
        live.add(pid);
        this.seen.set(pid, parseProcStatStartTime(text));
      }),
    );
    return live;
  }

  async creationStamps(pids: readonly number[]): Promise<Map<number, string>> {
    const stamps = new Map<number, string>();
    await Promise.all(
      pids.map(async (pid) => {
        let stamp: string | null | undefined = this.seen.get(pid);
        if (stamp === undefined) {
          const text = await this.readStat(pid);
          stamp = text === null ? null : parseProcStatStartTime(text);
        }
        if (stamp) stamps.set(pid, stamp);
      }),
    );
    return stamps;
  }

  stampMatches(expected: string | null, actual: string | null | undefined): boolean {
    return wslStampMatches(expected, actual);
  }

  /** Text of `/proc/<pid>/stat`; null when the process (or the share) is gone. */
  private async readStat(pid: number): Promise<string | null> {
    if (!Number.isInteger(pid) || pid <= 0) return null;
    try {
      return await this.read(join(this.procDir, String(pid), 'stat'));
    } catch {
      return null;
    }
  }
}
