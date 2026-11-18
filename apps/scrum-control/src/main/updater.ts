/**
 * The `electron-updater` side of the opt-in self-update — the only file that imports it.
 *
 * Scrum Control is installed per user by an NSIS installer. A release carries that installer,
 * its `.blockmap` (for differential downloads) and `latest.yml` (version, file name, SHA-512).
 * `electron-updater`'s GitHub provider asks `github.com/Hantsch/claude/releases/latest` for the
 * newest release — plugin releases no longer create GitHub releases, so that is always Scrum
 * Control's — reads `latest.yml` from it, downloads the installer into its own cache
 * (`%LOCALAPPDATA%\scrum-control-updater`, apart from claude-control's) and verifies the SHA-512
 * before anything runs. The policy around it (when to check, the setting, when to ask) is
 * `core/updates/updateService.ts`'s `UpdateService`; this file only adapts the library to it.
 *
 * Installing: `quitAndInstall(true, true)` runs the installer silently and starts the new version
 * afterwards ("Install and restart"). Without that, `autoInstallOnAppQuit` installs it silently
 * on the next ordinary quit and the next start is the new version.
 *
 * Only a packaged Windows build gets an updater at all: a dev run has no installer to replace
 * and no `app-update.yml`, so it constructs nothing and can request nothing.
 */

import { app, dialog, Notification } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  UpdateService,
  type UpdateBackend,
  type UpdateCheckResult,
  type UpdateStatus,
} from '../core/updates/updateService.ts';

/** The slice of `electron-updater`'s `NsisUpdater` this file uses. */
interface NsisUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  logger: unknown;
  checkForUpdates(): Promise<{ isUpdateAvailable?: boolean; updateInfo: { version: string } } | null>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(event: 'download-progress', listener: (info: { percent: number }) => void): unknown;
  removeListener(event: 'download-progress', listener: (info: { percent: number }) => void): unknown;
}

/**
 * Loaded on first use, so a run with updates off never even loads the library. `NsisUpdater` is
 * taken directly instead of the lazy `autoUpdater` getter: this is a Windows-only app, and Node's
 * static named-export detection does not see that getter in a packaged bundle (q2-launcher hit
 * exactly that); a plain class export has no such trap, `default` is the fallback either way.
 */
async function createNsisUpdater(): Promise<NsisUpdaterLike> {
  const mod = (await import('electron-updater')) as unknown as {
    NsisUpdater?: new () => NsisUpdaterLike;
    default?: { NsisUpdater?: new () => NsisUpdaterLike };
  };
  const NsisUpdater = mod.NsisUpdater ?? mod.default?.NsisUpdater;
  if (!NsisUpdater) throw new Error('electron-updater exposed no NsisUpdater');
  const updater = new NsisUpdater();
  // The service decides when to download; nothing happens behind its back.
  updater.autoDownload = false;
  // Must be true when a download completes — that is when the quit handler is armed. The
  // service turns it off again when the setting goes off; the handler re-reads it at quit.
  updater.autoInstallOnAppQuit = true;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  // Errors reach the service as rejections; the library's own console chatter is not needed.
  updater.logger = null;
  return updater;
}

/** The backend over a lazily created `NsisUpdater`. */
function nsisBackend(): UpdateBackend {
  let updater: Promise<NsisUpdaterLike> | null = null;
  let loaded: NsisUpdaterLike | null = null;
  let installOnQuit = true;
  const get = (): Promise<NsisUpdaterLike> => {
    updater ??= createNsisUpdater().then((instance) => {
      instance.autoInstallOnAppQuit = installOnQuit;
      loaded = instance;
      return instance;
    });
    // A failed construction is retried on the next call rather than cached forever.
    updater.catch(() => {
      updater = null;
    });
    return updater;
  };

  return {
    async check(): Promise<UpdateCheckResult> {
      const instance = await get();
      // Armed again before every check: a download started by it completes with the flag on.
      instance.autoInstallOnAppQuit = true;
      const result = await instance.checkForUpdates();
      if (!result) throw new Error('the updater is not active in this build');
      return { version: result.updateInfo.version, available: result.isUpdateAvailable === true };
    },
    async download(onProgress): Promise<void> {
      const instance = await get();
      const listener = (info: { percent: number }): void => onProgress(info.percent);
      instance.on('download-progress', listener);
      try {
        await instance.downloadUpdate();
      } finally {
        instance.removeListener('download-progress', listener);
      }
    },
    setInstallOnQuit(enabled: boolean): void {
      installOnQuit = enabled;
      if (loaded) loaded.autoInstallOnAppQuit = enabled;
    },
    installAndRestart(): void {
      if (!loaded) throw new Error('nothing has been downloaded');
      loaded.quitAndInstall(true, true);
    },
  };
}

export interface CreateUpdaterOptions {
  enabled: boolean;
  onChange: (status: UpdateStatus) => void;
}

/**
 * The update service for this run, or null where no update can be applied (dev, unpackaged,
 * not Windows). A download that completes while the app runs is offered once with a dialog;
 * "Later" leaves it to install quietly on the next quit.
 */
export function createUpdater(options: CreateUpdaterOptions): UpdateService | null {
  if (!app.isPackaged || process.platform !== 'win32') return null;
  const service: UpdateService = new UpdateService({
    backend: nsisBackend(),
    currentVersion: app.getVersion(),
    enabled: options.enabled,
    onChange: options.onChange,
    onReady: (version) => {
      void askToInstall(version).then((install) => {
        if (install) service.installAndRestart();
      });
    },
  });
  return service;
}

async function askToInstall(version: string): Promise<boolean> {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Scrum Control',
    message: `Scrum Control ${withV(version)} is ready to install`,
    detail:
      'Install it now and restart Scrum Control? Choose Later and it installs quietly the next ' +
      'time Scrum Control quits.',
    buttons: ['Install and restart', 'Later'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  return response === 0;
}

/** The marker that carries "which version ran last" to the next start. */
const LAST_VERSION_FILE = 'last-version.json';

/**
 * Shows "Updated to vX.Y.Z" once, on the first start of a newer version than the one that ran
 * before. Packaged builds only; the very first run of an install only records its version.
 * Never throws — a marker that cannot be read or written costs the toast, nothing else.
 */
export function announceUpdatedVersion(dataDir: string): void {
  if (!app.isPackaged) return;
  const current = app.getVersion();
  const dir = join(dataDir, 'updates');
  const file = join(dir, LAST_VERSION_FILE);
  let previous: string | null = null;
  try {
    if (existsSync(file)) {
      const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
      const version = raw && typeof raw === 'object' ? (raw as { version?: unknown }).version : undefined;
      if (typeof version === 'string') previous = version;
    }
  } catch {
    previous = null;
  }
  if (previous === current) return;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, `${JSON.stringify({ version: current }, null, 2)}\n`);
  } catch {
    return;
  }
  if (previous === null || !Notification.isSupported()) return;
  new Notification({ title: 'Scrum Control', body: `Updated to ${withV(current)}`, silent: true }).show();
}

/** `1.3.0` and `v1.3.0` both read as `v1.3.0`. */
function withV(version: string): string {
  return /^v/i.test(version) ? version : `v${version}`;
}
