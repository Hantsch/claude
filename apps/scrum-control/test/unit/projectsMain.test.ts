/**
 * The pieces around the projects service: its settings, the cached window list, focusing a
 * project's window, and the CLI's project lines.
 */

import { describe, expect, it, vi } from 'vitest';
import { formatProjectLines } from '../../src/cli/format.ts';
import { normalizePathKey } from '../../src/core/adapters/claude/paths.ts';
import { DEFAULT_SETTINGS, mergeSettings } from '../../src/core/model/settings.ts';
import { buildProjects } from '../../src/core/projects/projects.ts';
import { DEFAULT_SCRUM_NOTIFICATIONS } from '../../src/core/scrum/types.ts';
import { WindowFocuser } from '../../src/main/focus/focuser.ts';
import type { WindowInfo } from '../../src/main/focus/win32.ts';
import { createWindowLister } from '../../src/main/focus/windowList.ts';
import { plainSummary, scrumSummary, sessionIn, sprint, summaryMap } from '../fixtures/projects.ts';

describe('settings: scrum notifications', () => {
  it('defaults to the CONCEPT section 8 toggles', () => {
    const settings = mergeSettings(undefined);
    expect(settings.scrumNotifications).toEqual(DEFAULT_SCRUM_NOTIFICATIONS);
    expect(settings.scrumNotifications.storyDone).toBe(false);
    expect(settings.scrumNotifications.stalled).toBe(true);
  });

  it('drops the retired hidden-projects list of an older settings file', () => {
    expect(mergeSettings({ projects: { hidden: ['c:/a'] } })).not.toHaveProperty('projects');
  });

  it('merges toggles over the defaults, one kind at a time, ignoring non-booleans and unknown kinds', () => {
    const settings = mergeSettings({ scrumNotifications: { storyDone: true, stalled: false, blocked: 'no', bogus: true } });
    expect(settings.scrumNotifications).toEqual({ ...DEFAULT_SCRUM_NOTIFICATIONS, storyDone: true, stalled: false });
  });

  it('never shares the default objects between merges', () => {
    const a = mergeSettings(undefined);
    a.scrumNotifications.storyDone = true;
    expect(DEFAULT_SETTINGS.scrumNotifications.storyDone).toBe(false);
  });

  it('survives a round trip through JSON', () => {
    const first = mergeSettings({ scrumNotifications: { storyDone: true } });
    expect(mergeSettings(JSON.parse(JSON.stringify(first)))).toEqual(first);
  });
});

describe('createWindowLister', () => {
  const info = (pid: number, title: string): WindowInfo => ({ handle: `h${pid}${title.length}`, pid, title });

  it('adds the executable name per window and reuses the answer within the ttl', () => {
    let at = 0;
    const enumerate = vi.fn(() => [info(1, 'a - Visual Studio Code'), info(2, 'b')]);
    const processName = vi.fn((pid: number) => (pid === 1 ? 'Code.exe' : 'notepad.exe'));
    const list = createWindowLister({ ttlMs: 1_000, now: () => at, available: () => true, enumerate, processName });

    expect(list()).toEqual([
      { handle: info(1, 'a - Visual Studio Code').handle, pid: 1, processName: 'Code.exe', title: 'a - Visual Studio Code' },
      { handle: info(2, 'b').handle, pid: 2, processName: 'notepad.exe', title: 'b' },
    ]);
    at = 999;
    list();
    expect(enumerate).toHaveBeenCalledTimes(1);
    at = 1_000;
    list();
    expect(enumerate).toHaveBeenCalledTimes(2);
    // The names are cached for as long as the pid has a window.
    expect(processName).toHaveBeenCalledTimes(2);
  });

  it('retries a name it could not read and forgets pids that are gone', () => {
    let at = 0;
    let windows = [info(1, 'x')];
    const processName = vi.fn(() => '');
    const list = createWindowLister({ ttlMs: 0, now: () => (at += 1), available: () => true, enumerate: () => windows, processName });
    list();
    list();
    expect(processName).toHaveBeenCalledTimes(2);
    windows = [];
    expect(list()).toEqual([]);
  });

  it('is null where windows cannot be enumerated, and never throws', () => {
    expect(createWindowLister({ available: () => false })()).toBeNull();
    const broken = createWindowLister({
      available: () => true,
      enumerate: () => {
        throw new Error('boom');
      },
    });
    expect(broken()).toBeNull();
  });
});

describe('WindowFocuser.focusProject', () => {
  const windows: WindowInfo[] = [
    { handle: '1', pid: 100, title: 'claude - Visual Studio Code' },
    { handle: '2', pid: 100, title: 'Frontend-Scotty - Visual Studio Code' },
    { handle: '3', pid: 200, title: 'claude-control - Visual Studio Code' },
    { handle: '4', pid: 300, title: 'Hantsch-MMO [WSL: Ubuntu] - Visual Studio Code' },
    { handle: '5', pid: 400, title: 'claude - Notepad' },
  ];

  function focuser(activate = vi.fn(() => ({ activated: true, flashed: false }))) {
    return { activate, focuser: new WindowFocuser({ ideWindows: () => [], listWindows: () => windows, activateWindow: activate }) };
  }

  it('activates the window of the owning pid whose title names the folder', () => {
    const { activate, focuser: f } = focuser();
    const result = f.focusProject({ path: 'c:\\development\\AIDU\\Nyota\\Frontend-Scotty', windowPid: 100 });
    expect(activate).toHaveBeenCalledWith('2');
    expect(result).toMatchObject({ ok: true, method: 'vscode', target: 'Frontend-Scotty - Visual Studio Code' });
  });

  it('picks the right one of several windows of the same process', () => {
    const { activate, focuser: f } = focuser();
    f.focusProject({ path: 'c:\\development\\Hantsch\\claude', windowPid: 100 });
    expect(activate).toHaveBeenCalledWith('1');
  });

  it('falls back to any VS Code window titled after the folder, WSL first, when there is no pid', () => {
    const { activate, focuser: f } = focuser();
    f.focusProject({ path: 'C:\\development\\Hantsch\\Hantsch-MMO', windowPid: null });
    expect(activate).toHaveBeenCalledWith('4');
  });

  it('never matches a longer name, nor a window that is not VS Code', () => {
    const { activate, focuser: f } = focuser();
    // `claude` is a title segment of window 1 only; `claude-control` and the Notepad window are not it.
    f.focusProject({ path: 'c:\\x\\claude', windowPid: null });
    expect(activate).toHaveBeenCalledWith('1');
    const none = f.focusProject({ path: 'c:\\x\\unrelated', windowPid: 100 });
    expect(none).toMatchObject({ ok: false, method: 'none', cwd: 'c:\\x\\unrelated' });
    expect(none.message).toContain('unrelated');
  });

  it('reports a refused activation as flashed, and never throws', () => {
    const flashing = focuser(vi.fn(() => ({ activated: false, flashed: true })));
    expect(flashing.focuser.focusProject({ path: 'c:\\x\\claude', windowPid: 100 })).toMatchObject({ ok: false, flashed: true });
    const broken = new WindowFocuser({
      ideWindows: () => [],
      listWindows: () => {
        throw new Error('no ffi');
      },
    });
    expect(broken.focusProject({ path: 'c:\\x\\claude', windowPid: 1 })).toMatchObject({ ok: false });
  });
});

describe('cli formatProjectLines', () => {
  const claude = 'c:\\development\\Hantsch\\claude';
  const open = [{ path: claude, key: normalizePathKey(claude), pid: 1, via: 'lock' as const }];

  it('prints the sprint line, the window, the sessions per status and the hosts', () => {
    const [project] = buildProjects({
      openFolders: open,
      sessions: [sessionIn(claude, 'working'), sessionIn(claude, 'working', { host: 'wsl:Ubuntu' }), sessionIn(claude, 'done')],
      summaries: summaryMap(scrumSummary(claude, { sprint: sprint(), bandLine: 'S14 Build 4/12 · 026 D4/5', milestone: { id: 'M3', name: 'Login' } })),
    });
    const lines = formatProjectLines(project!, '◐');
    expect(lines[0]).toBe('  ◐ claude                 S14 Build 4/12 · 026 D4/5 · M3 Login');
    expect(lines[1]).toBe('      window: open · 1 done, 2 working · hosts: windows, wsl:Ubuntu');
  });

  it('shows attention and a project with neither sessions nor sprint', () => {
    const [project] = buildProjects({
      openFolders: open,
      sessions: [],
      summaries: summaryMap(
        scrumSummary(claude, {
          attention: { stalled: true, stalledMinutes: 18, blocked: false, blockedStory: null, releaseNo: false, releaseMissed: false },
        }),
      ),
    });
    expect(formatProjectLines(project!, '!')).toEqual([
      '  ! claude                 no sprint',
      '      window: open · no sessions · ATTENTION: stalled 18m',
    ]);
  });

  it('prints an Other project without a sprint line', () => {
    const [project] = buildProjects({ openFolders: [], sessions: [sessionIn(claude)], summaries: summaryMap(plainSummary(claude)) });
    expect(formatProjectLines(project!, '◐')[0]).toBe('  ◐ claude');
  });
});
