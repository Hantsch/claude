/** A simulated WSL mount (`base/<distro>/...`) in a temp dir — no WSL needed. */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeFixtureTree, registryEntry, toJsonl, type FixtureTree } from './builders.ts';

/** A real-shaped `/proc/<pid>/stat` line; `starttime` is field 22. */
export function statLine(pid: number, comm: string, startTime: string): string {
  return `${pid} (${comm}) S 1 ${pid} ${pid} 0 -1 4194560 100 0 0 0 1 2 0 0 20 0 1 0 ${startTime} 123456 789 18446744073709551615\n`;
}

export async function writeProc(base: string, distro: string, pid: number, text: string): Promise<void> {
  const dir = join(base, distro, 'proc', String(pid));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'stat'), text, 'utf8');
}

export interface WslFixture {
  /** The simulated `//wsl.localhost`. */
  base: string;
  distro: string;
  claudeDir: string;
  sessionsDir: string;
  projectsDir: string;
  /** Registry entry in a `registryEntry` shape, with a Linux cwd and a jiffies `procStart`. */
  writeSession(options: {
    pid: number;
    sessionId: string;
    cwd: string;
    procStart?: string;
    /** Stamp written to /proc; omitted = no /proc entry (a dead pid). Defaults to `procStart`. */
    procStat?: string | null;
    comm?: string;
  }): Promise<string>;
  writeTranscript(slug: string, sessionId: string, records: readonly Record<string, unknown>[]): Promise<string>;
}

/** `mountBase`: an existing simulated mount to add a distro to (default: a fresh one). */
export async function makeWslFixture(distro = 'Ubuntu', home = 'home/u', mountBase?: string): Promise<WslFixture> {
  const mount: FixtureTree | null = mountBase ? null : await makeFixtureTree('wsl-mount-');
  const base = mountBase ?? mount!.root;
  const claudeDir = join(base, distro, home, '.claude');
  const sessionsDir = join(claudeDir, 'sessions');
  const projectsDir = join(claudeDir, 'projects');
  await mkdir(sessionsDir, { recursive: true });
  await mkdir(projectsDir, { recursive: true });
  return {
    base,
    distro,
    claudeDir,
    sessionsDir,
    projectsDir,
    async writeSession(options) {
      const procStart = options.procStart ?? '631299';
      const entry = {
        ...registryEntry({ pid: options.pid, sessionId: options.sessionId, cwd: options.cwd }),
        procStart,
        entrypoint: 'cli',
        pidDomain: `linux:${options.pid}`,
      };
      const file = join(sessionsDir, `${options.pid}.json`);
      await writeFile(file, JSON.stringify(entry), 'utf8');
      const stamp = options.procStat === undefined ? procStart : options.procStat;
      if (stamp !== null) await writeProc(base, distro, options.pid, statLine(options.pid, options.comm ?? 'claude', stamp));
      return file;
    },
    async writeTranscript(slug, sessionId, records) {
      const dir = join(projectsDir, slug);
      await mkdir(dir, { recursive: true });
      const path = join(dir, `${sessionId}.jsonl`);
      await writeFile(path, toJsonl(records), 'utf8');
      return path;
    },
  };
}
