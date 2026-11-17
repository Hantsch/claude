/**
 * Host roots (CONCEPT §2): decoding `wsl.exe -l --running -q`, which distros are touched,
 * which `.claude` folders become roots, and the 60 s cache. A temp dir plays the
 * `//wsl.localhost` mount, so none of this needs WSL.
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createRootDiscovery,
  decodeDistroList,
  discoverRoots,
  type ExecWsl,
  type HostFs,
} from '../../src/core/hosts/roots.ts';
import { makeFixtureTree } from '../fixtures/builders.ts';

/** What `wsl.exe` writes: UTF-16LE, CRLF, sometimes a BOM. */
function utf16(text: string, bom = false): Buffer {
  const body = Buffer.from(text, 'utf16le');
  return bom ? Buffer.concat([Buffer.from([0xff, 0xfe]), body]) : body;
}

const RUNNING: ExecWsl = async () => utf16('Ubuntu\r\ndocker-desktop\r\n\r\n');
const NO_FS: HostFs = { readdir: async () => [], isDirectory: async () => false };

async function mount(): Promise<string> {
  return (await makeFixtureTree('wsl-mount-')).root;
}

async function claudeHome(base: string, distro: string, home: string, dirs: string[]): Promise<string> {
  const claudeDir = join(base, distro, home, '.claude');
  await mkdir(claudeDir, { recursive: true });
  for (const dir of dirs) await mkdir(join(claudeDir, dir), { recursive: true });
  return claudeDir;
}

describe('decodeDistroList', () => {
  it('decodes UTF-16LE with CRLF, with and without a BOM', () => {
    expect(decodeDistroList(utf16('Ubuntu\r\nDebian\r\n'))).toEqual(['Ubuntu', 'Debian']);
    expect(decodeDistroList(utf16('Ubuntu\r\nDebian\r\n', true))).toEqual(['Ubuntu', 'Debian']);
  });

  it('strips NULs, BOM and CR from a string that was decoded the wrong way', () => {
    expect(decodeDistroList('\uFEFFU\0b\0u\0n\0t\0u\0\r\n')).toEqual(['Ubuntu']);
  });

  it('accepts UTF-8 output (WSL_UTF8=1)', () => {
    expect(decodeDistroList(Buffer.from('Ubuntu-24.04\n', 'utf8'))).toEqual(['Ubuntu-24.04']);
  });

  it('skips docker-desktop and docker-desktop-data, blanks and message lines', () => {
    const text = 'docker-desktop\r\nUbuntu\r\nDocker-Desktop-Data\r\n\r\nThere are no running distributions.\r\n';
    expect(decodeDistroList(utf16(text))).toEqual(['Ubuntu']);
  });
});

describe('discoverRoots', () => {
  it('returns the Windows root and one root per running distro home', async () => {
    const base = await mount();
    const ubuntu = await claudeHome(base, 'Ubuntu', 'home/hantsch', ['sessions', 'projects']);
    const windowsDir = join(base, 'win-claude');

    const roots = await discoverRoots({ claudeDir: windowsDir, exec: RUNNING, wslBase: base });

    expect(roots.map((r) => r.id)).toEqual(['windows', 'wsl:Ubuntu']);
    expect(roots[0]).toMatchObject({ kind: 'windows', distro: null, claudeDir: windowsDir });
    expect(roots[1]).toEqual({ id: 'wsl:Ubuntu', kind: 'wsl', distro: 'Ubuntu', claudeDir: ubuntu });
  });

  it('detects every /home/*/.claude and /root/.claude that has sessions/ or projects/', async () => {
    const base = await mount();
    const a = await claudeHome(base, 'Ubuntu', 'home/alice', ['sessions']);
    const b = await claudeHome(base, 'Ubuntu', 'home/bob', ['projects']);
    await claudeHome(base, 'Ubuntu', 'home/carol', ['plugins']); // a .claude with neither: not a root
    await mkdir(join(base, 'Ubuntu', 'home', 'dave'), { recursive: true }); // no .claude at all
    const root = await claudeHome(base, 'Ubuntu', 'root', ['sessions']);

    const roots = await discoverRoots({ claudeDir: join(base, 'w'), exec: RUNNING, wslBase: base });

    expect(roots.filter((r) => r.kind === 'wsl').map((r) => r.claudeDir)).toEqual([a, b, root]);
  });

  it('never touches a distro that is not running', async () => {
    const base = await mount();
    await claudeHome(base, 'Debian', 'home/x', ['sessions']); // exists, but is stopped
    await claudeHome(base, 'Ubuntu', 'home/x', ['sessions']);
    const touched: string[] = [];
    const fs: HostFs = {
      readdir: async (path) => {
        touched.push(path);
        return [];
      },
      isDirectory: async (path) => {
        touched.push(path);
        return false;
      },
    };

    await discoverRoots({ exec: RUNNING, wslBase: base, fs });

    expect(touched.length).toBeGreaterThan(0);
    expect(touched.filter((path) => /debian|docker-desktop/i.test(path))).toEqual([]);
    expect(touched.every((path) => path.includes('Ubuntu'))).toBe(true);
  });

  it('falls back to the Windows root when wsl.exe is missing or fails', async () => {
    const exec: ExecWsl = async () => {
      throw new Error('spawn wsl.exe ENOENT');
    };
    const roots = await discoverRoots({ claudeDir: 'C:\\x\\.claude', exec });
    expect(roots.map((r) => r.id)).toEqual(['windows']);
  });

  it('never throws, even when the file system does', async () => {
    const fs: HostFs = {
      readdir: async () => {
        throw new Error('EIO');
      },
      isDirectory: async () => {
        throw new Error('EIO');
      },
    };
    const roots = await discoverRoots({ exec: RUNNING, fs });
    expect(roots.map((r) => r.id)).toEqual(['windows']);
  });

  it('does not call wsl.exe at all when WSL is disabled', async () => {
    const exec = vi.fn(RUNNING);
    const roots = await discoverRoots({ wslEnabled: false, exec });
    expect(roots.map((r) => r.id)).toEqual(['windows']);
    expect(exec).not.toHaveBeenCalled();
  });
});

describe('createRootDiscovery', () => {
  it('runs wsl.exe at most once per 60 s and again after', async () => {
    let at = 1_000_000;
    const exec = vi.fn(RUNNING);
    const discovery = createRootDiscovery({ exec, fs: NO_FS }, { now: () => at });

    await discovery.roots();
    at += 59_000;
    await discovery.roots();
    expect(exec).toHaveBeenCalledTimes(1);

    at += 2_000;
    await discovery.roots();
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it('shares one run between concurrent callers and can be invalidated', async () => {
    const exec = vi.fn(RUNNING);
    const discovery = createRootDiscovery({ exec, fs: NO_FS });

    await Promise.all([discovery.roots(), discovery.roots(), discovery.roots()]);
    expect(exec).toHaveBeenCalledTimes(1);

    discovery.invalidate();
    await discovery.roots();
    expect(exec).toHaveBeenCalledTimes(2);
  });
});
