/**
 * Scrum fixtures: small ai-scrum projects in the real file formats, written for these tests
 * (synthetic content, no copy of a real project). Each folder under `test/fixtures/scrum/` is
 * copied into a fresh temp directory so a test can change files and set the trail's mtime —
 * the heartbeat the stall rule reads. A folder named `_git` stands for `.git`, which a
 * repository cannot contain as a tracked path.
 */

import { cp, mkdir, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { makeTempDir } from '../tempDir.ts';

const HERE = new URL('./', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1');

export interface ScrumProjectOptions {
  /** Files to add or replace, by path relative to the project; `null` deletes one. `.git/` is allowed here. */
  files?: Record<string, string | null>;
  /** How old each running sprint's progress.md is made, relative to `now`. Default: just written. */
  trailAgeMs?: number;
  now?: number;
}

export async function scrumProject(fixture: string, options: ScrumProjectOptions = {}): Promise<string> {
  const dir = await makeTempDir('sc-scrum-');
  const root = join(dir, fixture);
  await cp(join(HERE, fixture), root, { recursive: true });
  if ((await readdir(root)).includes('_git')) {
    await cp(join(root, '_git'), join(root, '.git'), { recursive: true });
    await rm(join(root, '_git'), { recursive: true, force: true });
  }

  for (const [path, content] of Object.entries(options.files ?? {})) {
    const target = join(root, path);
    if (content === null) {
      await rm(target, { force: true });
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }

  const at = new Date((options.now ?? Date.now()) - (options.trailAgeMs ?? 0));
  const sprints = join(root, 'docs', 'sprints');
  for (const entry of await readdir(sprints, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || !/^S\d+$/.test(entry.name)) continue;
    await utimes(join(sprints, entry.name, 'progress.md'), at, at).catch(() => undefined);
  }
  return root;
}
