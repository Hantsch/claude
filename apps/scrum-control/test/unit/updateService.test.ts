/**
 * `UpdateService` — the self-update policy, against a fake backend standing in for
 * `electron-updater`: nothing while off, the daily cadence and the failure backoff, download
 * after a positive check, ask once per downloaded version, install only when ready.
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  CHECK_BACKOFF_MS,
  CHECK_INTERVAL_MS,
  UpdateService,
  type UpdateBackend,
  type UpdateCheckResult,
  type UpdateStatus,
} from '../../src/core/updates/updateService.ts';
import type { UpdateStatus as RendererUpdateStatus } from '../../src/shared/ipc.ts';

interface FakeBackend extends UpdateBackend {
  checks: number;
  downloads: number;
  installs: number;
  installOnQuit: boolean[];
  next: UpdateCheckResult | Error;
  downloadError: Error | null;
}

function fakeBackend(next: UpdateCheckResult | Error = { version: '1.0.0', available: false }): FakeBackend {
  const backend: FakeBackend = {
    checks: 0,
    downloads: 0,
    installs: 0,
    installOnQuit: [],
    next,
    downloadError: null,
    async check() {
      backend.checks += 1;
      if (backend.next instanceof Error) throw backend.next;
      return backend.next;
    },
    async download(onProgress) {
      backend.downloads += 1;
      onProgress(10);
      onProgress(55.4);
      if (backend.downloadError) throw backend.downloadError;
      onProgress(100);
    },
    setInstallOnQuit(enabled) {
      backend.installOnQuit.push(enabled);
    },
    installAndRestart() {
      backend.installs += 1;
    },
  };
  return backend;
}

function service(
  backend: FakeBackend,
  options: { enabled?: boolean; clock?: { now: number } } = {},
): { svc: UpdateService; ready: string[]; changes: UpdateStatus[] } {
  const clock = options.clock ?? { now: Date.UTC(2026, 10, 18, 9) };
  const ready: string[] = [];
  const changes: UpdateStatus[] = [];
  const svc = new UpdateService({
    backend,
    currentVersion: '1.0.0',
    enabled: options.enabled ?? true,
    now: () => clock.now,
    onReady: (version) => ready.push(version),
    onChange: (status) => changes.push(status),
  });
  return { svc, ready, changes };
}

describe('UpdateService', () => {
  it('makes no request at all while the setting is off, even when forced', async () => {
    const backend = fakeBackend({ version: '1.1.0', available: true });
    const { svc } = service(backend, { enabled: false });

    const status = await svc.refresh({ force: true });

    expect(backend.checks).toBe(0);
    expect(status.enabled).toBe(false);
    expect(status.lastOutcome).toBe('never');
    // Off also means a downloaded update does not install itself on quit.
    expect(backend.installOnQuit).toEqual([false]);
  });

  it('reports up to date without downloading', async () => {
    const backend = fakeBackend({ version: '1.0.0', available: false });
    const { svc, ready } = service(backend);

    const status = await svc.refresh();

    expect(backend.checks).toBe(1);
    expect(backend.downloads).toBe(0);
    expect(status).toMatchObject({ phase: 'idle', lastOutcome: 'ok', latestVersion: '1.0.0', updateAvailable: false });
    expect(ready).toEqual([]);
  });

  it('downloads an available update, then reports it ready and asks once', async () => {
    const backend = fakeBackend({ version: '1.1.0', available: true });
    const { svc, ready, changes } = service(backend);

    const status = await svc.refresh();

    expect(backend.downloads).toBe(1);
    expect(status).toMatchObject({ phase: 'ready', readyVersion: '1.1.0', downloadPercent: null, updateAvailable: true });
    expect(ready).toEqual(['1.1.0']);
    expect(changes.map((c) => c.phase)).toEqual(['checking', 'downloading', 'downloading', 'downloading', 'downloading', 'ready']);
    expect(changes.filter((c) => c.phase === 'downloading').map((c) => c.downloadPercent)).toEqual([0, 10, 55, 100]);

    // A forced re-check that finds the same version neither downloads nor asks again.
    await svc.refresh({ force: true });
    expect(backend.downloads).toBe(1);
    expect(ready).toEqual(['1.1.0']);
    expect(svc.status().phase).toBe('ready');
  });

  it('keeps to one successful check a day and half an hour after a failure', async () => {
    const clock = { now: Date.UTC(2026, 10, 18, 9) };
    const backend = fakeBackend(new Error('getaddrinfo ENOTFOUND github.com'));
    const { svc } = service(backend, { clock });

    expect((await svc.refresh()).lastOutcome).toBe('failed');
    clock.now += CHECK_BACKOFF_MS - 1;
    await svc.refresh();
    expect(backend.checks).toBe(1);

    clock.now += 1;
    backend.next = { version: '1.0.0', available: false };
    expect((await svc.refresh()).lastOutcome).toBe('ok');
    expect(backend.checks).toBe(2);

    clock.now += CHECK_INTERVAL_MS - 1;
    await svc.refresh();
    expect(backend.checks).toBe(2);
    clock.now += 1;
    await svc.refresh();
    expect(backend.checks).toBe(3);

    // The Settings button bypasses both.
    await svc.refresh({ force: true });
    expect(backend.checks).toBe(4);
  });

  it('reports a failed check with its first line and stays installable afterwards', async () => {
    const backend = fakeBackend(new Error('HttpError: 404\n<html>long body</html>'));
    const { svc } = service(backend);

    const status = await svc.refresh();

    expect(status).toMatchObject({ phase: 'idle', lastOutcome: 'failed', lastError: 'check failed: HttpError: 404' });
    expect(svc.installAndRestart()).toBe(false);
    expect(backend.installs).toBe(0);
  });

  it('a failed download leaves nothing ready and nothing to ask about', async () => {
    const backend = fakeBackend({ version: '1.1.0', available: true });
    backend.downloadError = new Error('sha512 checksum mismatch');
    const { svc, ready } = service(backend);

    const status = await svc.refresh();

    expect(status).toMatchObject({ phase: 'idle', readyVersion: null, lastOutcome: 'failed' });
    expect(status.lastError).toBe('download failed: sha512 checksum mismatch');
    expect(ready).toEqual([]);
  });

  it('installs only once something is ready', async () => {
    const backend = fakeBackend({ version: '1.1.0', available: true });
    const { svc } = service(backend);

    expect(svc.installAndRestart()).toBe(false);
    await svc.refresh();
    expect(svc.installAndRestart()).toBe(true);
    expect(backend.installs).toBe(1);
  });

  it('shares one in-flight check between concurrent callers', async () => {
    const backend = fakeBackend({ version: '1.0.0', available: false });
    const { svc } = service(backend);

    await Promise.all([svc.refresh(), svc.refresh({ force: true }), svc.refresh()]);

    expect(backend.checks).toBe(1);
  });

  it('turning the setting off and on follows through to install-on-quit', () => {
    const backend = fakeBackend();
    const { svc, changes } = service(backend);

    svc.setEnabled(false);
    svc.setEnabled(false);
    svc.setEnabled(true);

    expect(backend.installOnQuit).toEqual([true, false, true]);
    expect(changes.map((c) => c.enabled)).toEqual([false, true]);
  });

  it('a throwing listener breaks neither the check nor the ask', async () => {
    const backend = fakeBackend({ version: '1.1.0', available: true });
    const svc = new UpdateService({
      backend,
      currentVersion: '1.0.0',
      enabled: true,
      onChange: () => {
        throw new Error('renderer gone');
      },
      onReady: () => {
        throw new Error('dialog failed');
      },
    });

    await expect(svc.refresh()).resolves.toMatchObject({ phase: 'ready' });
  });

  it('the renderer copy of UpdateStatus matches the service one', () => {
    expectTypeOf<RendererUpdateStatus>().toEqualTypeOf<UpdateStatus>();
  });
});
