/**
 * The scanner's file access on Node's `fs/promises` (CONCEPT §4). Read-only: a missing file is
 * `null`, a missing directory is `[]`, anything else (permissions, a busy file) throws so the
 * monitor can report it instead of showing a project as empty.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Reader } from './parser.ts';

/** Directory listings above this many files skip the per-file `stat` (requirements folders). */
const STAT_LIMIT = 64;

const MISSING = new Set(['ENOENT', 'ENOTDIR']);

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && MISSING.has((error as { code?: string }).code ?? '');
}

export function createFsReader(configDir: string | null): Reader {
  return {
    configDir,
    async read(path) {
      try {
        return await readFile(path, 'utf8');
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    async list(path) {
      let entries;
      try {
        entries = await readdir(path, { withFileTypes: true });
      } catch (error) {
        if (isMissing(error)) return [];
        throw error;
      }
      // The trail's heartbeat is the mtime of a file in a small sprint folder; a requirements
      // folder with hundreds of stories has no use for one.
      const wantTimes = entries.length <= STAT_LIMIT;
      return Promise.all(
        entries.map(async (entry) => {
          const isDir = entry.isDirectory();
          if (isDir || !wantTimes) return { name: entry.name, isDir };
          try {
            return { name: entry.name, isDir, mtimeMs: (await stat(join(path, entry.name))).mtimeMs };
          } catch {
            return { name: entry.name, isDir };
          }
        }),
      );
    },
  };
}
