/**
 * Host roots (CONCEPT §2): the Windows `~/.claude` plus one root per Claude home inside every
 * *running* WSL distro.
 *
 * Two rules carry the whole file:
 *  - Only distros that `wsl.exe -l --running -q` lists are ever touched. Reading
 *    `\\wsl.localhost\<distro>` of a stopped distro boots it.
 *  - Discovery never throws. No `wsl.exe`, no distros, an unreadable share — each of those is
 *    "no WSL roots", never an error, so the Windows side keeps working.
 */

import { execFile } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveClaudePaths } from '../adapters/claude/paths.ts';
import type { HostId } from '../model/types.ts';
import { WSL_UNC_HOST } from './paths.ts';

export interface HostRoot {
  id: HostId;
  kind: 'windows' | 'wsl';
  /** Distro name for a WSL root, null for Windows. */
  distro: string | null;
  /** A directory Node can read: a plain path for Windows, `//wsl.localhost/<distro>/...` for WSL. */
  claudeDir: string;
}

/** Output of `wsl.exe`, raw — it is UTF-16LE and must be decoded by the caller. */
export type ExecWsl = (args: readonly string[]) => Promise<Buffer | string>;

/** The two file-system questions discovery asks. Injectable so tests need no WSL. */
export interface HostFs {
  /** Entry names of a directory; rejects when it cannot be read. */
  readdir(path: string): Promise<string[]>;
  isDirectory(path: string): Promise<boolean>;
}

export interface DiscoverOptions {
  /** `settings.claudeDir` — the Windows root override. */
  claudeDir?: string | null;
  /** Default true. False means the Windows root only and no `wsl.exe` call. */
  wslEnabled?: boolean;
  /** Replaces `wsl.exe -l --running -q`. */
  exec?: ExecWsl;
  fs?: HostFs;
  /** Where distro shares are mounted. Default `//wsl.localhost`. */
  wslBase?: string;
}

export const DEFAULT_WSL_BASE = `//${WSL_UNC_HOST}`;
/** How long a discovery result is reused. */
export const DISCOVERY_TTL_MS = 60_000;

const WSL_EXE_TIMEOUT_MS = 5_000;
/** Names that can be a distro. Anything with a space is an error message, not a name. */
const DISTRO_NAME = /^[\w.\-]+$/;

/**
 * `wsl.exe` writes UTF-16LE (with a BOM on some builds) and CRLF; `WSL_UTF8=1` setups write
 * UTF-8. Decode either, drop NULs, BOM and CR, skip blanks, and never return a distro that
 * Docker Desktop owns.
 */
export function decodeDistroList(output: Buffer | string): string[] {
  let text: string;
  if (typeof output === 'string') {
    text = output;
  } else if (output.length >= 2 && output[0] === 0xff && output[1] === 0xfe) {
    text = output.subarray(2).toString('utf16le');
  } else if (output.includes(0)) {
    text = output.toString('utf16le');
  } else {
    text = output.toString('utf8');
  }
  const names: string[] = [];
  for (const line of text.replace(/\0/g, '').replace(/\uFEFF/g, '').split(/\r?\n/)) {
    const name = line.replace(/\r/g, '').trim();
    if (!name || !DISTRO_NAME.test(name)) continue;
    if (name.toLowerCase().startsWith('docker-desktop')) continue;
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/** Running distros, or `[]` when `wsl.exe` is missing, fails or times out. */
export async function listRunningDistros(exec: ExecWsl = defaultExecWsl): Promise<string[]> {
  try {
    return decodeDistroList(await exec(['-l', '--running', '-q']));
  } catch {
    return [];
  }
}

/**
 * Every root, Windows first. Fresh each call — use `createRootDiscovery` for the cached form
 * the engine uses.
 */
export async function discoverRoots(options: DiscoverOptions = {}): Promise<HostRoot[]> {
  const roots: HostRoot[] = [
    { id: 'windows', kind: 'windows', distro: null, claudeDir: resolveClaudePaths(options.claudeDir).root },
  ];
  if (options.wslEnabled === false) return roots;

  try {
    const fs = options.fs ?? nodeFs;
    const base = options.wslBase ?? DEFAULT_WSL_BASE;
    for (const distro of await listRunningDistros(options.exec)) {
      roots.push(...(await rootsOfDistro(distro, base, fs)));
    }
  } catch {
    // Discovery is best effort by contract; whatever was found before the failure stands.
  }
  return roots;
}

/** Each `.claude` under `/home/<user>` and `/root` of one distro that has `sessions/` or `projects/`. */
async function rootsOfDistro(distro: string, base: string, fs: HostFs): Promise<HostRoot[]> {
  const distroDir = join(base, distro);
  const candidates: string[] = [];
  try {
    for (const user of (await fs.readdir(join(distroDir, 'home'))).sort()) {
      candidates.push(join(distroDir, 'home', user, '.claude'));
    }
  } catch {
    // No /home (or it could not be read): /root may still be there.
  }
  candidates.push(join(distroDir, 'root', '.claude'));

  const roots: HostRoot[] = [];
  for (const claudeDir of candidates) {
    const hasState =
      (await safeIsDirectory(fs, join(claudeDir, 'sessions'))) ||
      (await safeIsDirectory(fs, join(claudeDir, 'projects')));
    if (hasState) roots.push({ id: `wsl:${distro}`, kind: 'wsl', distro, claudeDir });
  }
  return roots;
}

async function safeIsDirectory(fs: HostFs, path: string): Promise<boolean> {
  try {
    return await fs.isDirectory(path);
  } catch {
    return false;
  }
}

export interface RootDiscovery {
  /** Cached for `ttlMs`; concurrent callers share one run. Never rejects. */
  roots(): Promise<HostRoot[]>;
  /** The most recent result without waiting (empty before the first run). */
  lastKnown(): HostRoot[];
  /** Forget the cache, e.g. after the WSL setting was toggled. */
  invalidate(): void;
}

/** `discoverRoots` behind a cache, so the engine's 5 s tick runs it at most once per `ttlMs`. */
export function createRootDiscovery(
  options: DiscoverOptions | (() => DiscoverOptions),
  extra: { ttlMs?: number; now?: () => number } = {},
): RootDiscovery {
  const ttlMs = extra.ttlMs ?? DISCOVERY_TTL_MS;
  const now = extra.now ?? (() => Date.now());
  const resolve = typeof options === 'function' ? options : () => options;
  let cached: { at: number; roots: HostRoot[] } | null = null;
  let inFlight: Promise<HostRoot[]> | null = null;

  return {
    roots(): Promise<HostRoot[]> {
      if (cached && now() - cached.at < ttlMs) return Promise.resolve(cached.roots);
      if (inFlight) return inFlight;
      const run = discoverRoots(resolve())
        .catch(() => cached?.roots ?? [])
        .then((roots) => {
          cached = { at: now(), roots };
          return roots;
        })
        .finally(() => {
          inFlight = null;
        });
      inFlight = run;
      return run;
    },
    lastKnown(): HostRoot[] {
      return cached?.roots ?? [];
    },
    invalidate(): void {
      cached = null;
    },
  };
}

const nodeFs: HostFs = {
  readdir: (path) => readdir(path),
  async isDirectory(path) {
    return (await stat(path)).isDirectory();
  },
};

function defaultExecWsl(args: readonly string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      reject(new Error('wsl.exe only exists on Windows'));
      return;
    }
    execFile(
      'wsl.exe',
      [...args],
      { encoding: 'buffer', windowsHide: true, timeout: WSL_EXE_TIMEOUT_MS, maxBuffer: 64 * 1024 },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
}
