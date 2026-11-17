/**
 * Sessions from Windows AND WSL behind one engine (CONCEPT §2), over a Windows fixture tree
 * plus a simulated `//wsl.localhost` mount (see `test/fixtures/wsl.ts`).
 */

import { appendFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createEngine } from '../../src/core/createEngine.ts';
import type { ExecWsl } from '../../src/core/hosts/roots.ts';
import { DEFAULT_SETTINGS, mergeSettings, type AppSettings } from '../../src/core/model/settings.ts';
import type { SessionView } from '../../src/core/model/types.ts';
import { FakeProbe, LIVE_PID } from '../fixtures/engine.ts';
import {
  T0,
  assistant,
  makeFixtureTree,
  prompt,
  registryEntry,
  toJsonl,
  type FixtureTree,
} from '../fixtures/builders.ts';
import { makeWslFixture, type WslFixture } from '../fixtures/wsl.ts';

const NOW = T0 + 120_000;
const WIN_CWD = 'c:\\development\\Hantsch\\shared-app';
const WSL_CWD = '/mnt/c/development/Hantsch/shared-app';
const WSL_SLUG = '-mnt-c-development-Hantsch-shared-app';

const utf16 = (text: string): Buffer => Buffer.from(text, 'utf16le');
const RUNNING: ExecWsl = async () => utf16('Ubuntu\r\ndocker-desktop\r\n');

function turn(uuid: string, cwd: string, text: string, at = T0 + 1000): Record<string, unknown>[] {
  return [
    { ...prompt(`${uuid}-p`, at, 'hello'), cwd },
    assistant({ uuid: `${uuid}-a`, at: at + 1000, stopReason: 'end_turn', text, cwd }),
  ];
}

interface World {
  win: FixtureTree;
  wsl: WslFixture;
  settings: AppSettings;
}

async function world(overrides: Partial<AppSettings> = {}): Promise<World> {
  const win = await makeFixtureTree('win-claude-');
  const wsl = await makeWslFixture();
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    claudeDir: win.root,
    indexHistoryOnStart: false,
    reading: { ...DEFAULT_SETTINGS.reading, tickIntervalMs: 500 },
    ...overrides,
  };

  // One Windows session and one WSL session in the *same* folder, as seen from each side.
  await win.writeRegistry(LIVE_PID, registryEntry({ pid: LIVE_PID, sessionId: 'win-1', cwd: WIN_CWD }));
  await win.writeTranscript(
    'c--development-Hantsch-shared-app',
    'win-1',
    toJsonl(turn('w', WIN_CWD, 'from windows')),
  );
  await wsl.writeSession({ pid: 10101, sessionId: 'wsl-1', cwd: WSL_CWD });
  await wsl.writeTranscript(WSL_SLUG, 'wsl-1', turn('l', WSL_CWD, 'from wsl'));
  return { win, wsl, settings };
}

function engineFor(w: World, exec: ExecWsl = RUNNING) {
  return createEngine({
    settings: w.settings,
    probe: new FakeProbe(new Set([LIVE_PID])),
    now: () => NOW,
    hosts: { exec, wslBase: w.wsl.base },
  });
}

function byId(views: SessionView[], id: string): SessionView {
  const view = views.find((v) => v.sessionId === id);
  if (!view) throw new Error(`no session ${id} in ${views.map((v) => v.sessionId).join(', ')}`);
  return view;
}

describe('one engine over Windows and WSL roots', () => {
  it('merges sessions from both roots and tags each with its host', async () => {
    const w = await world();
    const { engine, hostRoots } = engineFor(w);
    await engine.refreshNow();

    const views = engine.getLiveSessions();
    expect(views.map((v) => v.sessionId).sort()).toEqual(['win-1', 'wsl-1']);
    expect(byId(views, 'win-1').host).toBe('windows');
    expect(byId(views, 'wsl-1').host).toBe('wsl:Ubuntu');
    expect(hostRoots().map((r) => r.id)).toEqual(['windows', 'wsl:Ubuntu']);
  });

  it('keeps the raw cwd on the session but maps the project to a Windows path', async () => {
    const w = await world();
    const { engine } = engineFor(w);
    await engine.refreshNow();

    const wslView = byId(engine.getLiveSessions(), 'wsl-1');
    expect(wslView.cwd).toBe(WSL_CWD);
    expect(wslView.pid).toBe(10101);
    expect(wslView.project.path).toBe('C:\\development\\Hantsch\\shared-app');
    expect(wslView.project.name).toBe('shared-app');
  });

  it('puts a WSL session in /mnt/c/x and a Windows session in c:\\x into one project', async () => {
    const w = await world();
    const { engine } = engineFor(w);
    await engine.refreshNow();

    const views = engine.getLiveSessions();
    expect(byId(views, 'wsl-1').project.key).toBe(byId(views, 'win-1').project.key);
    expect(byId(views, 'wsl-1').groupKey).toBe(byId(views, 'win-1').groupKey);
  });

  it('reads the WSL transcript through its own root (slug from the raw cwd)', async () => {
    const w = await world();
    const { engine } = engineFor(w);
    await engine.refreshNow();

    const view = byId(engine.getLiveSessions(), 'wsl-1');
    expect(view.transcriptPath).toContain(WSL_SLUG);
    expect(view.lastAssistantText).toBe('from wsl');
    expect(view.status).toBe('done');
    expect(view.alive).toBe(true);
  });

  it('maps a Linux path outside /mnt onto the distro share', async () => {
    const w = await world();
    await w.wsl.writeSession({ pid: 10202, sessionId: 'wsl-2', cwd: '/home/u/proj', procStart: '777' });
    await w.wsl.writeTranscript('-home-u-proj', 'wsl-2', turn('x', '/home/u/proj', 'in home'));
    const { engine } = engineFor(w);
    await engine.refreshNow();

    const view = byId(engine.getLiveSessions(), 'wsl-2');
    expect(view.project.path).toBe('\\\\wsl.localhost\\Ubuntu\\home\\u\\proj');
    expect(view.project.name).toBe('proj');
  });

  it('drops a WSL session whose pid has no /proc entry', async () => {
    const w = await world();
    await w.wsl.writeSession({ pid: 10303, sessionId: 'wsl-dead', cwd: WSL_CWD, procStat: null });
    const { engine } = engineFor(w);
    await engine.refreshNow();

    expect(engine.getLiveSessions().map((v) => v.sessionId).sort()).toEqual(['win-1', 'wsl-1']);
  });

  it('drops a WSL session whose procStart does not match field 22 (a recycled pid)', async () => {
    const w = await world();
    await w.wsl.writeSession({ pid: 10404, sessionId: 'wsl-reused', cwd: WSL_CWD, procStart: '100', procStat: '101' });
    const { engine } = engineFor(w);
    await engine.refreshNow();

    expect(engine.getLiveSessions().map((v) => v.sessionId).sort()).toEqual(['win-1', 'wsl-1']);
  });

  it('sees Windows only, and never runs wsl.exe, when WSL is disabled', async () => {
    const exec = vi.fn(RUNNING);
    const w = await world({ wsl: { enabled: false } });
    const { engine, hostRoots } = engineFor(w, exec);
    await engine.refreshNow();

    expect(engine.getLiveSessions().map((v) => v.sessionId)).toEqual(['win-1']);
    expect(hostRoots().map((r) => r.id)).toEqual(['windows']);
    expect(exec).not.toHaveBeenCalled();
  });

  it('follows the setting at run time', async () => {
    const exec = vi.fn(RUNNING);
    const w = await world();
    const { engine } = engineFor(w, exec);
    await engine.refreshNow();
    expect(engine.getLiveSessions()).toHaveLength(2);

    await engine.updateSettings({ ...w.settings, wsl: { enabled: false } });
    expect(engine.getLiveSessions().map((v) => v.sessionId)).toEqual(['win-1']);

    await engine.updateSettings({ ...w.settings, wsl: { enabled: true } });
    expect(engine.getLiveSessions()).toHaveLength(2);
  });

  it('stays on the Windows root when wsl.exe fails', async () => {
    const w = await world();
    const { engine } = engineFor(w, async () => {
      throw new Error('spawn wsl.exe ENOENT');
    });
    await engine.refreshNow();

    expect(engine.getLiveSessions().map((v) => v.sessionId)).toEqual(['win-1']);
  });

  it('does not touch a stopped distro: only listed distros are read', async () => {
    const w = await world();
    // A second distro on the same mount that wsl.exe does not list (it is stopped).
    const stopped = await makeWslFixture('Debian', 'home/u', w.wsl.base);
    await stopped.writeSession({ pid: 55, sessionId: 'debian-1', cwd: '/home/u/x' });
    const { engine } = engineFor(w);
    await engine.refreshNow();

    expect(engine.getLiveSessions().some((v) => v.sessionId === 'debian-1')).toBe(false);
  });

  it('watches the Windows root only', async () => {
    const w = await world();
    const { adapter, engine } = engineFor(w);
    await engine.refreshNow();

    const roots = adapter.watchRoots();
    expect(roots.length).toBeGreaterThan(0);
    expect(roots.every((r) => r.path.startsWith(w.win.root))).toBe(true);
    expect(roots.some((r) => r.path.includes('wsl-mount-'))).toBe(false);
  });

  it('merges history from both roots, with the project mapped', async () => {
    const w = await world();
    const { adapter } = engineFor(w);
    const entries = [];
    for await (const entry of adapter.indexHistory(new AbortController().signal)) entries.push(entry);

    expect(entries.map((e) => e.sessionId).sort()).toEqual(['win-1', 'wsl-1']);
    const keys = new Set(entries.map((e) => e.project.key));
    expect(keys.size).toBe(1);
  });

  it('routes a detail read to the root that owns the transcript', async () => {
    const w = await world();
    const { adapter, engine } = engineFor(w);
    await engine.refreshNow();
    const path = byId(engine.getLiveSessions(), 'wsl-1').transcriptPath!;

    const detail = await adapter.readDetail('wsl-1', path);
    expect(detail.project.path).toBe('C:\\development\\Hantsch\\shared-app');
    // Without a path every root is asked in turn.
    expect((await adapter.readDetail('wsl-1')).transcriptPath).toBe(path);
  });

  it('picks up a change to a WSL transcript on the tick (no file events there)', async () => {
    const w = await world();
    const { engine, hostRoots } = engineFor(w);
    await engine.start();
    try {
      expect(hostRoots().some((r) => r.kind === 'wsl')).toBe(true);
      expect(byId(engine.getLiveSessions(), 'wsl-1').lastAssistantText).toBe('from wsl');

      const transcript = byId(engine.getLiveSessions(), 'wsl-1').transcriptPath!;
      const lines = turn('n', WSL_CWD, 'second answer', T0 + 5000)
        .map((r) => JSON.stringify(r))
        .join('\n');
      await appendFile(transcript, `${lines}\n`, 'utf8');

      const deadline = Date.now() + 6_000;
      let text: string | null = null;
      while (Date.now() < deadline) {
        text = byId(engine.getLiveSessions(), 'wsl-1').lastAssistantText;
        if (text === 'second answer') break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(text).toBe('second answer');
    } finally {
      await engine.stop();
    }
  });
});

describe('settings', () => {
  it('defaults wsl.enabled to true and validates it like the other flags', () => {
    expect(DEFAULT_SETTINGS.wsl).toEqual({ enabled: true });
    expect(mergeSettings({}).wsl.enabled).toBe(true);
    expect(mergeSettings({ wsl: { enabled: false } }).wsl.enabled).toBe(false);
    expect(mergeSettings({ wsl: { enabled: 'no' } }).wsl.enabled).toBe(true);
    expect(mergeSettings({ wsl: 3 }).wsl.enabled).toBe(true);
  });

  it('does not share the wsl object with the defaults', () => {
    const merged = mergeSettings({ wsl: { enabled: false } });
    expect(DEFAULT_SETTINGS.wsl.enabled).toBe(true);
    expect(merged.wsl).not.toBe(DEFAULT_SETTINGS.wsl);
  });
});
