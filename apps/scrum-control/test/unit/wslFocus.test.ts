/**
 * Jump to a WSL session (CONCEPT §2): no process chain, no IDE lock — the VS Code window whose
 * title carries the project folder's name is focused, and nothing ever throws.
 */

import { describe, expect, it, vi } from 'vitest';
import type { SessionView } from '../../src/core/model/types.ts';
import { WindowFocuser, folderHints } from '../../src/main/focus/focuser.ts';
import { pickCodeWindow, type WindowInfo } from '../../src/main/focus/win32.ts';
import { WindowProbe } from '../../src/main/focus/windowProbe.ts';

const windows: WindowInfo[] = [
  { handle: '1', pid: 100, title: 'shared-app - Visual Studio Code' },
  { handle: '2', pid: 100, title: 'other - Visual Studio Code' },
  { handle: '3', pid: 200, title: 'shared-app [WSL: Ubuntu] - Visual Studio Code' },
  { handle: '4', pid: 300, title: 'shared-app - Notepad' },
];

function session(cwd: string, host: SessionView['host'] = 'wsl:Ubuntu'): SessionView {
  return {
    host,
    cwd,
    pid: 10101,
    project: { path: cwd, name: 'x', key: cwd },
  } as SessionView;
}

describe('pickCodeWindow', () => {
  it('prefers the [WSL: ...] window of the folder', () => {
    const picked = pickCodeWindow(windows, folderHints('/mnt/c/development/Hantsch/shared-app'));
    expect(picked?.handle).toBe('3');
  });

  it('falls back to a plain VS Code window titled after the folder', () => {
    const picked = pickCodeWindow(windows.filter((w) => w.handle !== '3'), folderHints('/home/u/shared-app'));
    expect(picked?.handle).toBe('1');
  });

  it('never picks a window that does not name the folder, nor a non-VS Code one', () => {
    expect(pickCodeWindow(windows, folderHints('/home/u/unrelated'))).toBeNull();
    expect(pickCodeWindow([windows[3]!], folderHints('/home/u/shared-app'))).toBeNull();
    expect(pickCodeWindow([], folderHints('/home/u/shared-app'))).toBeNull();
  });
});

describe('WindowFocuser for a WSL session', () => {
  it('activates the matching VS Code window and walks no process chain', async () => {
    const activate = vi.fn(() => ({ activated: true, flashed: false }));
    const focuser = new WindowFocuser({
      ideWindows: () => [{ pid: 10101, ideName: 'Visual Studio Code', workspaceFolders: ['/home/u/shared-app'], source: 'x' }],
      listWindows: () => windows,
      activateWindow: activate,
    });

    const result = await focuser.focus(session('/mnt/c/development/Hantsch/shared-app'));

    expect(activate).toHaveBeenCalledWith('3');
    expect(result).toMatchObject({ ok: true, method: 'vscode', target: 'shared-app [WSL: Ubuntu] - Visual Studio Code' });
  });

  it('reports a flashed taskbar button when activation is refused', async () => {
    const focuser = new WindowFocuser({
      ideWindows: () => [],
      listWindows: () => windows,
      activateWindow: () => ({ activated: false, flashed: true }),
    });
    const result = await focuser.focus(session('/home/u/shared-app'));
    expect(result).toMatchObject({ ok: false, flashed: true, method: 'vscode' });
  });

  it('says so, and offers the cwd, when no window names the folder', async () => {
    const focuser = new WindowFocuser({ ideWindows: () => [], listWindows: () => windows });
    const result = await focuser.focus(session('/home/u/unrelated'));
    expect(result).toMatchObject({ ok: false, method: 'none', cwd: '/home/u/unrelated' });
    expect(result.message).toContain('unrelated');
  });

  it('does not throw when window enumeration does', async () => {
    const focuser = new WindowFocuser({
      ideWindows: () => [],
      listWindows: () => {
        throw new Error('boom');
      },
    });
    const result = await focuser.focus(session('/home/u/shared-app'));
    expect(result.ok).toBe(false);
    expect(result.method).toBe('none');
  });
});

describe('WindowProbe and WSL sessions', () => {
  it('never probes a Linux pid, even when two sessions share a folder', () => {
    const picked = WindowProbe.candidatePids([
      { pid: 1, cwd: '/home/u/x', host: 'wsl:Ubuntu' },
      { pid: 2, cwd: '/home/u/x', host: 'wsl:Ubuntu' },
      { pid: 3, cwd: 'C:/a', host: 'windows' },
      { pid: 4, cwd: 'C:/a', host: 'windows' },
    ]);
    expect(picked.sort()).toEqual([3, 4]);
  });
});
