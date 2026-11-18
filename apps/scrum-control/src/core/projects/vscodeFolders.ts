/**
 * The folders VS Code itself knows (CONCEPT §3): a second source of *known paths* for the
 * open-window detection, so a window whose Claude extension wrote no lock - and whose folder
 * never had a Claude session - is still recognised by its title.
 *
 *  - `opened`: `User/globalStorage/storage.json` → `windowsState` (the last active and the opened
 *    windows). VS Code's own idea of which folders have a window; used to break a tie when two
 *    known folders share a name. It can lag behind, so it never counts as a window by itself.
 *  - `known`: every `User/workspaceStorage/<hash>/workspace.json` → `folder`, i.e. every folder
 *    VS Code ever opened, plus `opened`.
 *
 * Read-only. A `<hash>` folder's `workspace.json` never changes, so each is read once; the list
 * is re-read when the directory's mtime moves, `storage.json` when its own mtime moves.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface VsCodeFolders {
  /** Folders of the windows VS Code lists as open. Windows paths. */
  opened: string[];
  /** Every folder VS Code has a workspace record for, `opened` included. Windows paths. */
  known: string[];
}

export const NO_VSCODE_FOLDERS: VsCodeFolders = { opened: [], known: [] };

/** The user-data folders of VS Code and its forks, under `%APPDATA%`. */
export const VSCODE_FLAVOURS = ['Code', 'Code - Insiders', 'VSCodium'] as const;

/**
 * `file:///c%3A/dev/x` → `c:\dev\x`; `vscode-remote://wsl%2Bubuntu/home/u/x` →
 * `\\wsl.localhost\ubuntu\home\u\x`. Null for anything else (SSH, containers, untitled).
 */
export function folderUriToPath(uri: string): string | null {
  const file = /^file:\/\/\/([a-zA-Z])(?::|%3[aA])(\/.*)?$/.exec(uri);
  if (file) {
    const rest = safeDecode(file[2] ?? '/');
    if (rest === null) return null;
    return `${file[1]}:${rest.replace(/\//g, '\\')}`.replace(/\\$/, '') || null;
  }
  const wsl = /^vscode-remote:\/\/wsl(?:\+|%2[bB])([^/]+)(\/.*)$/.exec(uri);
  if (wsl) {
    const distro = safeDecode(wsl[1]!);
    const rest = safeDecode(wsl[2]!);
    if (distro === null || rest === null) return null;
    return `\\\\wsl.localhost\\${distro}${rest.replace(/\//g, '\\')}`.replace(/\\$/, '');
  }
  return null;
}

function safeDecode(text: string): string | null {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
}

/** The folders of `windowsState` in a parsed `storage.json`. */
export function openedFromStorage(storage: unknown): string[] {
  const state = (storage as { windowsState?: unknown } | null)?.windowsState as
    | { lastActiveWindow?: unknown; openedWindows?: unknown }
    | undefined;
  if (!state || typeof state !== 'object') return [];
  const windows: unknown[] = [state.lastActiveWindow, ...(Array.isArray(state.openedWindows) ? state.openedWindows : [])];
  const paths: string[] = [];
  for (const window of windows) {
    const folder = (window as { folder?: unknown } | null)?.folder;
    if (typeof folder !== 'string') continue;
    const path = folderUriToPath(folder);
    if (path !== null && !paths.includes(path)) paths.push(path);
  }
  return paths;
}

/** The folder of a parsed `workspace.json`, or null. */
export function folderFromWorkspace(workspace: unknown): string | null {
  const folder = (workspace as { folder?: unknown } | null)?.folder;
  return typeof folder === 'string' ? folderUriToPath(folder) : null;
}

/** The file system calls the reader makes; injectable for tests. */
export interface VsCodeFs {
  mtimeMs(path: string): number | null;
  list(dir: string): string[];
  readText(path: string): string | null;
}

const nodeFs: VsCodeFs = {
  mtimeMs: (path) => {
    try {
      return statSync(path).mtimeMs;
    } catch {
      return null;
    }
  },
  list: (dir) => {
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  },
  readText: (path) => {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return null;
    }
  },
};

function parseJson(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** One flavour's user-data folder, cached by mtime. */
class FlavourReader {
  private storageMtime: number | null = null;
  private opened: string[] = [];
  private listMtime: number | null = null;
  private readonly byHash = new Map<string, string | null>();

  constructor(
    private readonly userDir: string,
    private readonly fs: VsCodeFs,
  ) {}

  read(): VsCodeFolders {
    const storagePath = join(this.userDir, 'globalStorage', 'storage.json');
    const storageMtime = this.fs.mtimeMs(storagePath);
    if (storageMtime === null) {
      this.opened = [];
    } else if (storageMtime !== this.storageMtime) {
      this.opened = openedFromStorage(parseJson(this.fs.readText(storagePath)));
    }
    this.storageMtime = storageMtime;

    const workspaces = join(this.userDir, 'workspaceStorage');
    const listMtime = this.fs.mtimeMs(workspaces);
    if (listMtime === null) {
      this.byHash.clear();
    } else if (listMtime !== this.listMtime) {
      const hashes = new Set(this.fs.list(workspaces));
      for (const hash of [...this.byHash.keys()]) if (!hashes.has(hash)) this.byHash.delete(hash);
      for (const hash of hashes) {
        if (this.byHash.has(hash)) continue;
        this.byHash.set(hash, folderFromWorkspace(parseJson(this.fs.readText(join(workspaces, hash, 'workspace.json')))));
      }
    }
    this.listMtime = listMtime;

    const known = [...this.opened];
    for (const path of this.byHash.values()) if (path !== null && !known.includes(path)) known.push(path);
    return { opened: [...this.opened], known };
  }
}

/**
 * A reader over every VS Code flavour under `appData` (`%APPDATA%`). Call the returned function
 * as often as needed: it touches only mtimes until something changed. Never throws.
 */
export function createVsCodeFolderReader(appData: string | null | undefined, fs: VsCodeFs = nodeFs): () => VsCodeFolders {
  if (!appData) return () => NO_VSCODE_FOLDERS;
  const readers = VSCODE_FLAVOURS.map((flavour) => new FlavourReader(join(appData, flavour, 'User'), fs));
  return () => {
    const opened: string[] = [];
    const known: string[] = [];
    for (const reader of readers) {
      try {
        const folders = reader.read();
        opened.push(...folders.opened);
        known.push(...folders.known);
      } catch {
        /* one unreadable flavour does not hide the others */
      }
    }
    return { opened, known };
  };
}
