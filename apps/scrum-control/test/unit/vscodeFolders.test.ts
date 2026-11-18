/**
 * The folders VS Code itself knows (CONCEPT section 3): URI to path, `storage.json`'s window
 * state, `workspace.json` records, and the mtime cache that keeps the 5 s tick cheap.
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createVsCodeFolderReader,
  folderFromWorkspace,
  folderUriToPath,
  openedFromStorage,
  type VsCodeFs,
} from '../../src/core/projects/vscodeFolders.ts';

describe('folderUriToPath', () => {
  it('maps local and WSL folders and refuses everything else', () => {
    expect(folderUriToPath('file:///c%3A/development/Hantsch/claude')).toBe('c:\\development\\Hantsch\\claude');
    expect(folderUriToPath('file:///d:/My%20Code/x/')).toBe('d:\\My Code\\x');
    expect(folderUriToPath('vscode-remote://wsl%2Bubuntu/home/u/proj')).toBe('\\\\wsl.localhost\\ubuntu\\home\\u\\proj');
    expect(folderUriToPath('vscode-remote://ssh-remote%2Bbox/home/u')).toBeNull();
    expect(folderUriToPath('untitled:Untitled-1')).toBeNull();
    expect(folderUriToPath('file:///c%3A/bad%E0%A4')).toBeNull();
  });
});

describe('openedFromStorage and folderFromWorkspace', () => {
  it('reads the last active and the opened windows once each, skipping junk', () => {
    const storage = {
      windowsState: {
        lastActiveWindow: { folder: 'file:///c%3A/a' },
        openedWindows: [{ folder: 'file:///c%3A/b' }, { folder: 'file:///c%3A/a' }, { workspace: {} }, null, 7],
      },
    };
    expect(openedFromStorage(storage)).toEqual(['c:\\a', 'c:\\b']);
    expect(openedFromStorage({})).toEqual([]);
    expect(openedFromStorage(null)).toEqual([]);
  });

  it('takes the folder of a workspace record, nothing else', () => {
    expect(folderFromWorkspace({ folder: 'file:///c%3A/x' })).toBe('c:\\x');
    expect(folderFromWorkspace({ workspace: 'file:///c%3A/x.code-workspace' })).toBeNull();
    expect(folderFromWorkspace(null)).toBeNull();
  });
});

describe('createVsCodeFolderReader', () => {
  const appData = 'C:\\appdata';
  const user = join(appData, 'Code', 'User');
  const storagePath = join(user, 'globalStorage', 'storage.json');
  const workspaces = join(user, 'workspaceStorage');

  function fakeFs() {
    const files = new Map<string, string>();
    const mtimes = new Map<string, number>();
    const reads: string[] = [];
    const fs: VsCodeFs = {
      mtimeMs: (path) => mtimes.get(path) ?? null,
      list: (dir) => [
        ...new Set(
          [...files.keys()]
            .filter((path) => path.startsWith(dir + '\\'))
            .map((path) => path.slice(dir.length + 1).split('\\')[0]!),
        ),
      ],
      readText: (path) => {
        reads.push(path);
        return files.get(path) ?? null;
      },
    };
    const workspace = (hash: string, uri: string): void => {
      files.set(join(workspaces, hash, 'workspace.json'), JSON.stringify({ folder: uri }));
    };
    return { fs, files, mtimes, reads, workspace };
  }

  it('merges opened and known folders, and reads only what changed', () => {
    const f = fakeFs();
    f.files.set(storagePath, JSON.stringify({ windowsState: { openedWindows: [{ folder: 'file:///c%3A/open' }] } }));
    f.mtimes.set(storagePath, 1);
    f.workspace('h1', 'file:///c%3A/old');
    f.workspace('h2', 'file:///c%3A/open');
    f.mtimes.set(workspaces, 1);

    const read = createVsCodeFolderReader(appData, f.fs);
    expect(read()).toEqual({ opened: ['c:\\open'], known: ['c:\\open', 'c:\\old'] });
    const first = f.reads.length;
    expect(first).toBe(3);

    // Nothing moved: no file is read again.
    read();
    expect(f.reads).toHaveLength(first);

    // A new workspace folder: only its record is read.
    f.workspace('h3', 'file:///c%3A/new');
    f.mtimes.set(workspaces, 2);
    expect(read().known).toEqual(['c:\\open', 'c:\\old', 'c:\\new']);
    expect(f.reads.slice(first)).toEqual([join(workspaces, 'h3', 'workspace.json')]);
  });

  it('answers nothing without APPDATA or without VS Code', () => {
    expect(createVsCodeFolderReader(undefined)()).toEqual({ opened: [], known: [] });
    expect(createVsCodeFolderReader(appData, fakeFs().fs)()).toEqual({ opened: [], known: [] });
  });
});
