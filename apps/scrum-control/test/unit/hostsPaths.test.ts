/** Path mapping between WSL and Windows (CONCEPT §2 "Paths") and what it does to project keys. */

import { describe, expect, it } from 'vitest';
import { normalizePathKey, projectRefForCwd } from '../../src/core/adapters/claude/paths.ts';
import { toLinuxPath, toWindowsPath } from '../../src/core/hosts/paths.ts';

describe('toWindowsPath', () => {
  it('maps /mnt/<drive>/<rest> to <DRIVE>:\\<rest>', () => {
    expect(toWindowsPath('/mnt/c/development/Hantsch/wow-market-guide', 'wsl:Ubuntu')).toBe(
      'C:\\development\\Hantsch\\wow-market-guide',
    );
    expect(toWindowsPath('/mnt/d/x/', 'wsl:Ubuntu')).toBe('D:\\x');
    expect(toWindowsPath('/mnt/c', 'wsl:Ubuntu')).toBe('C:\\');
  });

  it('maps any other Linux path onto the distro share', () => {
    expect(toWindowsPath('/home/hantsch/proj', 'wsl:Ubuntu')).toBe('\\\\wsl.localhost\\Ubuntu\\home\\hantsch\\proj');
    expect(toWindowsPath('/', 'wsl:Debian')).toBe('\\\\wsl.localhost\\Debian');
  });

  it('does not take /mnt/wsl or /mnt/wslg for a drive', () => {
    expect(toWindowsPath('/mnt/wslg/x', 'wsl:Ubuntu')).toBe('\\\\wsl.localhost\\Ubuntu\\mnt\\wslg\\x');
  });

  it('leaves a Windows cwd, and everything from the Windows host, unchanged', () => {
    expect(toWindowsPath('c:\\dev\\x', 'wsl:Ubuntu')).toBe('c:\\dev\\x');
    expect(toWindowsPath('\\\\wsl.localhost\\Ubuntu\\home\\u', 'wsl:Ubuntu')).toBe('\\\\wsl.localhost\\Ubuntu\\home\\u');
    expect(toWindowsPath('/mnt/c/x', 'windows')).toBe('/mnt/c/x');
    expect(toWindowsPath('c:\\dev\\x', 'windows')).toBe('c:\\dev\\x');
  });

  it('accepts a HostRoot as well as an id', () => {
    const root = {
      id: 'wsl:Ubuntu',
      kind: 'wsl',
      distro: 'Ubuntu',
      claudeDir: '//wsl.localhost/Ubuntu/root/.claude',
    } as const;
    expect(toWindowsPath('/mnt/c/a', root)).toBe('C:\\a');
  });
});

describe('toLinuxPath', () => {
  it('maps a drive path to /mnt and a path on the distro share back to a Linux path', () => {
    expect(toLinuxPath('C:\\development\\x', 'Ubuntu')).toBe('/mnt/c/development/x');
    expect(toLinuxPath('D:\\', 'Ubuntu')).toBe('/mnt/d');
    expect(toLinuxPath('\\\\wsl.localhost\\Ubuntu\\home\\u\\p', 'Ubuntu')).toBe('/home/u/p');
    expect(toLinuxPath('\\\\wsl$\\Ubuntu\\home\\u', 'ubuntu')).toBe('/home/u');
  });

  it('has no answer for a path Linux cannot reach', () => {
    expect(toLinuxPath('\\\\wsl.localhost\\Debian\\home\\u', 'Ubuntu')).toBeNull();
    expect(toLinuxPath('\\\\server\\share\\x', 'Ubuntu')).toBeNull();
  });

  it('round-trips with toWindowsPath', () => {
    for (const linux of ['/mnt/c/development/x', '/home/hantsch/proj']) {
      const windows = toWindowsPath(linux, 'wsl:Ubuntu');
      expect(toLinuxPath(windows, 'Ubuntu')).toBe(linux);
    }
  });
});

describe('project identity across hosts', () => {
  it('gives a WSL session in /mnt/c/x and a Windows session in c:\\x the same key', () => {
    const wsl = projectRefForCwd(toWindowsPath('/mnt/c/development/X', 'wsl:Ubuntu'));
    const win = projectRefForCwd('c:\\development\\X');
    expect(wsl.key).toBe(win.key);
    expect(wsl.name).toBe('X');
  });

  it('gives the forward-slash and legacy spellings of a share path one key', () => {
    const mapped = normalizePathKey(toWindowsPath('/home/u/p', 'wsl:Ubuntu'));
    expect(normalizePathKey('//wsl.localhost/Ubuntu/home/u/p')).toBe(mapped);
    expect(normalizePathKey('\\\\wsl$\\Ubuntu\\home\\u\\p')).toBe(mapped);
  });
});
