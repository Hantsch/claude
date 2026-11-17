/**
 * How a window title names a folder. Pure string work, shared by the focus code in `main/`
 * (`win32.ts`) and by the open-window detection here, so the two can never disagree about what
 * `claude [WSL: Ubuntu] - Visual Studio Code` is a title of.
 */

/**
 * How a hint is allowed to match a window title.
 *
 *  - `segment` - the title, cut at ` - `, contains a part that *is* the hint. VS Code builds
 *    its titles as `file - rootName - Visual Studio Code`, so the workspace name is a whole
 *    segment; requiring that is what keeps `q2` from matching `q2-launcher` and a folder from
 *    matching a file that merely mentions it. Remote and profile decorations (`rootName
 *    [WSL: Ubuntu]`, `rootName (Profile)`) still count.
 *  - `substring` - anywhere in the title. Weaker, and only used for the hint we trust most.
 *  - `title` - the whole title, verbatim. That is what a process's `MainWindowTitle` is, so
 *    it is the only honest way to use one as a hint.
 */
export type HintMode = 'segment' | 'substring' | 'title';

/** `hint` is compared case-insensitively. */
export function titleMatches(title: string, hint: string, mode: HintMode): boolean {
  const lower = title.toLowerCase();
  const wanted = hint.toLowerCase();
  if (mode === 'title') return lower.trim() === wanted;
  if (mode === 'substring') return lower.includes(wanted);
  return lower
    .split(' - ')
    .map((part) => part.trim())
    // `folder [WSL: Ubuntu]` and `folder (Profile)` are the same workspace, decorated.
    .some((part) => part === wanted || part.startsWith(`${wanted} [`) || part.startsWith(`${wanted} (`));
}

/** Last segment of a folder path (either separator), or the whole text when there is none. */
export function folderBaseName(folder: string): string {
  const parts = folder
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .filter(Boolean);
  return parts[parts.length - 1] ?? folder;
}
