/**
 * Open VS Code windows (CONCEPT section 3): IDE locks cross-checked against window titles, and
 * the title-only fallback for known project paths.
 */

import { describe, expect, it } from 'vitest';
import type { IdeWindowRef } from '../../src/core/model/types.ts';
import { findOpenFolders, isCodeWindow, type TopLevelWindow } from '../../src/core/projects/openWindows.ts';
import { folderBaseName, titleMatches } from '../../src/core/projects/titles.ts';

const lock = (pid: number, ...folders: string[]): IdeWindowRef => ({
  pid,
  ideName: 'Visual Studio Code',
  workspaceFolders: folders,
  source: `ide/${pid}.lock`,
});

let handles = 0;
const win = (pid: number, title: string, processName = 'Code.exe'): TopLevelWindow => ({
  handle: String(++handles),
  pid,
  processName,
  title,
});

const folders = (found: ReturnType<typeof findOpenFolders>): string[] => found.map((f) => `${f.path}|${f.via}|${f.pid}`);

describe('titleMatches and folderBaseName', () => {
  it('matches whole title segments, tolerating remote and profile decorations', () => {
    expect(titleMatches('file.ts - claude - Visual Studio Code', 'claude', 'segment')).toBe(true);
    expect(titleMatches('claude [WSL: Ubuntu] - Visual Studio Code', 'claude', 'segment')).toBe(true);
    expect(titleMatches('claude (Work) - Visual Studio Code', 'CLAUDE', 'segment')).toBe(true);
    expect(titleMatches('claude-control - Visual Studio Code', 'claude', 'segment')).toBe(false);
    expect(titleMatches('claude-control - Visual Studio Code', 'claude', 'substring')).toBe(true);
  });

  it('takes the last segment of either separator style', () => {
    expect(folderBaseName('c:\\development\\Hantsch\\claude')).toBe('claude');
    expect(folderBaseName('//wsl.localhost/Ubuntu/home/u/proj/')).toBe('proj');
    expect(folderBaseName('proj')).toBe('proj');
  });
});

describe('isCodeWindow', () => {
  it('knows VS Code and its forks by executable, and falls back to the title when the name is unknown', () => {
    expect(isCodeWindow(win(1, 'x', 'Code.exe'))).toBe(true);
    expect(isCodeWindow(win(1, 'x', 'Code - Insiders.exe'))).toBe(true);
    expect(isCodeWindow(win(1, 'x', 'notepad.exe'))).toBe(false);
    expect(isCodeWindow(win(1, 'proj - Visual Studio Code', ''))).toBe(true);
    expect(isCodeWindow(win(1, 'proj - Notepad', ''))).toBe(false);
  });
});

describe('findOpenFolders from locks', () => {
  const a = 'c:\\development\\Hantsch\\claude';
  const b = 'c:\\development\\AIDU\\Nyota\\Frontend-Scotty';

  it('counts a lock whose pid is alive and owns a window titled after the folder', () => {
    const windows = [win(100, 'README.md - claude - Visual Studio Code'), win(100, 'Frontend-Scotty - Visual Studio Code')];
    const found = findOpenFolders({ locks: [lock(100, a), lock(100, b)], alivePids: new Set([100]), windows, knownPaths: [] });
    expect(folders(found)).toEqual([`${a}|lock|100`, `${b}|lock|100`]);
  });

  it('drops a lock whose pid is dead', () => {
    const windows = [win(100, 'claude - Visual Studio Code')];
    expect(findOpenFolders({ locks: [lock(100, a)], alivePids: new Set(), windows, knownPaths: [] })).toEqual([]);
  });

  it('drops a lock whose process owns windows but none titled after the folder (the window was closed)', () => {
    const windows = [win(100, 'other - Visual Studio Code')];
    expect(findOpenFolders({ locks: [lock(100, a)], alivePids: new Set([100]), windows, knownPaths: [] })).toEqual([]);
  });

  it('looks at every VS Code window when the lock pid owns none (an extension host)', () => {
    const windows = [win(200, 'claude - Visual Studio Code'), win(300, 'claude - Notepad', 'notepad.exe')];
    const found = findOpenFolders({ locks: [lock(100, a)], alivePids: new Set([100]), windows, knownPaths: [] });
    expect(folders(found)).toEqual([`${a}|lock|200`]);
  });

  it('counts every live lock when there is no window list (the CLI), and skips the title fallback', () => {
    const found = findOpenFolders({
      locks: [lock(100, a), lock(101, b)],
      alivePids: new Set([100]),
      windows: null,
      knownPaths: ['c:\\other\\proj'],
    });
    expect(folders(found)).toEqual([`${a}|lock|100`]);
  });

  it('lists a folder once even when two locks name it, and gives each window to one folder only', () => {
    const windows = [win(100, 'claude - Visual Studio Code')];
    const found = findOpenFolders({
      locks: [lock(100, a), lock(100, a.toUpperCase())],
      alivePids: new Set([100]),
      windows,
      knownPaths: [],
    });
    expect(found).toHaveLength(1);
  });

  it('tolerates a WSL-decorated title', () => {
    const windows = [win(100, 'claude [WSL: Ubuntu] - Visual Studio Code')];
    expect(findOpenFolders({ locks: [lock(100, a)], alivePids: new Set([100]), windows, knownPaths: [] })).toHaveLength(1);
  });
});

describe('findOpenFolders from titles', () => {
  const mmo = 'C:\\development\\Hantsch\\Hantsch-MMO';

  it('finds a window without a lock when its title names the folder of a known project path', () => {
    const windows = [win(100, 'Hantsch-MMO [WSL: Ubuntu] - Visual Studio Code')];
    const found = findOpenFolders({ locks: [], alivePids: new Set(), windows, knownPaths: [mmo] });
    expect(folders(found)).toEqual([`${mmo}|title|100`]);
  });

  it('guesses nothing: a title that names no known path opens no folder', () => {
    const windows = [win(100, 'Something-Else - Visual Studio Code')];
    expect(findOpenFolders({ locks: [], alivePids: new Set(), windows, knownPaths: [mmo] })).toEqual([]);
  });

  it('ignores windows that are not VS Code', () => {
    const windows = [win(100, 'Hantsch-MMO - Notepad', 'notepad.exe')];
    expect(findOpenFolders({ locks: [], alivePids: new Set(), windows, knownPaths: [mmo] })).toEqual([]);
  });

  it('skips a folder name that two known projects share', () => {
    const windows = [win(100, 'app - Visual Studio Code')];
    const found = findOpenFolders({ locks: [], alivePids: new Set(), windows, knownPaths: ['c:\\a\\app', 'c:\\b\\app'] });
    expect(found).toEqual([]);
  });

  it('breaks a shared folder name by the folders VS Code lists as open, and only when exactly one is', () => {
    const windows = [win(100, 'app - Visual Studio Code')];
    const knownPaths = ['c:\\a\\app', 'c:\\b\\app'];
    const pick = (openedPaths: string[]) =>
      folders(findOpenFolders({ locks: [], alivePids: new Set(), windows, knownPaths, openedPaths }));
    expect(pick(['C:\\B\\app'])).toEqual(['c:\\b\\app|title|100']);
    expect(pick(['c:\\a\\app', 'c:\\b\\app'])).toEqual([]);
    expect(pick(['c:\\elsewhere'])).toEqual([]);
  });

  it('never takes a folder named like the app, whose name is a segment of every title', () => {
    const windows = [win(100, 'x.md - claude - Visual Studio Code')];
    const found = findOpenFolders({ locks: [], alivePids: new Set(), windows, knownPaths: ['c:\\tools\\Visual Studio Code'] });
    expect(found).toEqual([]);
  });

  it('does not reopen a folder a lock already found, nor claim the lock window again', () => {
    const a = 'c:\\development\\Hantsch\\claude';
    const windows = [win(100, 'claude - Visual Studio Code')];
    const found = findOpenFolders({
      locks: [lock(100, a)],
      alivePids: new Set([100]),
      windows,
      knownPaths: [a, 'c:\\elsewhere\\claude'],
    });
    expect(folders(found)).toEqual([`${a}|lock|100`]);
  });

  it('skips a known path inside an open folder', () => {
    const a = 'c:\\dev\\mono';
    const windows = [win(100, 'mono - Visual Studio Code'), win(100, 'src - Visual Studio Code')];
    const found = findOpenFolders({
      locks: [lock(100, a)],
      alivePids: new Set([100]),
      windows,
      knownPaths: ['c:\\dev\\mono\\src'],
    });
    expect(folders(found)).toEqual([`${a}|lock|100`]);
  });
});
