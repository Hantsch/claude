/**
 * WSL liveness (CONCEPT §2): `/proc/<pid>/stat` read through the distro share. The share is a
 * temp dir here — `base/<distro>/proc/<pid>/stat` — so no WSL is needed.
 */

import { describe, expect, it } from 'vitest';
import { parseProcStatStartTime, WslProcessProbe, wslStampMatches } from '../../src/core/hosts/wslProbe.ts';
import { makeFixtureTree } from '../fixtures/builders.ts';
import { statLine, writeProc } from '../fixtures/wsl.ts';

describe('parseProcStatStartTime', () => {
  it('reads field 22 of an ordinary line', () => {
    expect(parseProcStatStartTime(statLine(10101, 'claude', '631299'))).toBe('631299');
  });

  it('counts from the last ")" when comm contains spaces and parentheses', () => {
    expect(parseProcStatStartTime(statLine(7, 'my app', '42'))).toBe('42');
    expect(parseProcStatStartTime(statLine(7, 'a) S 9 9 9 (b', '43'))).toBe('43');
    expect(parseProcStatStartTime(statLine(7, 'x (odd) y)', '44'))).toBe('44');
  });

  it('is null for anything that is not a stat line', () => {
    expect(parseProcStatStartTime('')).toBeNull();
    expect(parseProcStatStartTime('no parens here')).toBeNull();
    expect(parseProcStatStartTime('1 (short) S 1 2 3')).toBeNull();
    expect(parseProcStatStartTime(statLine(1, 'c', 'abc'))).toBeNull();
  });
});

describe('wslStampMatches', () => {
  it('compares for equality, not within a tolerance', () => {
    expect(wslStampMatches('631299', '631299')).toBe(true);
    expect(wslStampMatches('631299', '631300')).toBe(false);
  });

  it('lets an unknown value on either side pass', () => {
    expect(wslStampMatches(null, '5')).toBe(true);
    expect(wslStampMatches('5', undefined)).toBe(true);
  });
});

describe('WslProcessProbe', () => {
  it('is alive when /proc/<pid>/stat exists and dead when it does not', async () => {
    const base = (await makeFixtureTree('wsl-proc-')).root;
    await writeProc(base, 'Ubuntu', 10101, statLine(10101, 'claude', '631299'));
    const probe = new WslProcessProbe({ distro: 'Ubuntu', base });

    expect([...(await probe.alive([10101, 20202]))]).toEqual([10101]);
  });

  it('reports the creation stamp of a live pid, including a comm with spaces and ")"', async () => {
    const base = (await makeFixtureTree('wsl-proc-')).root;
    await writeProc(base, 'Ubuntu', 1, statLine(1, 'weird ) name (', '777'));
    const probe = new WslProcessProbe({ distro: 'Ubuntu', base });

    await probe.alive([1]);
    expect(await probe.creationStamps([1, 2])).toEqual(new Map([[1, '777']]));
  });

  it('answers creationStamps on its own, without a prior alive()', async () => {
    const base = (await makeFixtureTree('wsl-proc-')).root;
    await writeProc(base, 'Ubuntu', 5, statLine(5, 'claude', '888'));
    const probe = new WslProcessProbe({ distro: 'Ubuntu', base });

    expect(await probe.creationStamps([5])).toEqual(new Map([[5, '888']]));
  });

  it('treats a procStart mismatch as a different process', async () => {
    const base = (await makeFixtureTree('wsl-proc-')).root;
    await writeProc(base, 'Ubuntu', 5, statLine(5, 'claude', '888'));
    const probe = new WslProcessProbe({ distro: 'Ubuntu', base });
    const stamps = await probe.creationStamps([5]);

    expect(probe.stampMatches('888', stamps.get(5))).toBe(true);
    expect(probe.stampMatches('887', stamps.get(5))).toBe(false);
  });

  it('only reads the distro it was made for', async () => {
    const base = (await makeFixtureTree('wsl-proc-')).root;
    await writeProc(base, 'Debian', 5, statLine(5, 'claude', '1'));
    const read: string[] = [];
    const probe = new WslProcessProbe({
      distro: 'Ubuntu',
      base,
      readFile: async (path) => {
        read.push(path);
        throw new Error('ENOENT');
      },
    });

    expect((await probe.alive([5])).size).toBe(0);
    expect(read).toHaveLength(1);
    expect(read[0]).toContain('Ubuntu');
    expect(read[0]).not.toContain('Debian');
  });
});
