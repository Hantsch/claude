/**
 * The Projects tab is the main window's first and default one. vitest runs without a render
 * harness here, so this pins the wiring by source, the way `showInMainWindow.test.ts` does:
 * the main-process side (`MainTab`, the default, `--show projects`) and the renderer side.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relative: string): string {
  return readFileSync(
    new URL(`../../src/${relative}`, import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1'),
    'utf8',
  );
}

describe('Projects tab wiring', () => {
  it('the main process knows the tab and opens it by default', () => {
    expect(source('main/windows.ts')).toContain("export type MainTab = 'projects' | 'sessions' | 'history' | 'settings'");
    expect(source('main/windows.ts')).toContain("openMain(tab: MainTab = 'projects'");
  });

  it('--show accepts every tab and falls back to Projects', () => {
    const index = source('main/index.ts');
    expect(index).toContain("['projects', 'sessions', 'history', 'settings', 'popover']");
    expect(index).not.toMatch(/return 'sessions';/);
  });

  it('the renderer lists Projects first, lands on it by default and renders ProjectsView', () => {
    const app = source('renderer/App.tsx');
    expect(app).toContain("const TABS: readonly MainTab[] = ['projects', 'sessions', 'history', 'settings']");
    expect(app).toContain("?? 'projects'");
    expect(app).toContain('<ProjectsView />');
  });

  it('the view asks once on mount and then follows the push', () => {
    const view = source('renderer/components/ProjectsView.tsx');
    expect(view).toContain('api.getProjects()');
    expect(view).toContain('api.onProjectsChanged');
  });

  it('settings offers a toggle for every scrum notification kind, WSL and the roots - and no unhide', () => {
    const settings = source('renderer/components/SettingsView.tsx');
    expect(settings).toContain('SCRUM_NOTIFICATION_KINDS.map');
    expect(settings).toContain('scrumNotifications');
    expect(settings).toContain('wsl: { ...settings.wsl');
    expect(settings).not.toContain('unhideProject');
    expect(settings).toContain('api.getHostRoots()');
  });
});
