/**
 * The opt-in self-update policy: when to check, what to report, when to ask.
 *
 * Scrum Control ships as an NSIS installer, and `electron-updater` does the actual work — read
 * `latest.yml` from the newest GitHub release, download the installer, verify its SHA-512, and
 * run it. That library lives behind {@link UpdateBackend}, implemented in `main/updater.ts`; this
 * file never imports it (or Electron), so the policy is testable with plain Node.
 *
 * What this file decides:
 *
 *  - **Nothing is requested while the setting is off.** `refresh()` returns before touching the
 *    backend, and turning the setting off also stops a downloaded update from installing itself
 *    on quit (`backend.setInstallOnQuit(false)`).
 *  - **Cadence.** At most one check per {@link CHECK_INTERVAL_MS} after a successful one, and a
 *    failed one is not repeated for {@link CHECK_BACKOFF_MS} — so being offline at logon costs one
 *    attempt per half hour, not one per tick. `{ force: true }` (the Settings button) bypasses both.
 *  - **Download follows the check.** An available update is downloaded in the background right
 *    away; there is nothing to approve before that, because nothing changes until it installs.
 *  - **Ask once, else install quietly.** When a download completes while the app is running,
 *    `onReady` fires once for that version (main asks "Install and restart?"). Declining is fine:
 *    the backend installs it silently the next time the app quits.
 *
 * Nothing here throws and nothing can hang: a check that outlives {@link CHECK_TIMEOUT_MS} counts
 * as a failed attempt, and every backend failure ends in `lastOutcome: 'failed'` with a reason.
 */

/** Where the releases come from. Named in Settings, not hidden. */
export const RELEASES_URL = 'https://github.com/Hantsch/claude/releases';

/** A successful check is not repeated inside this window (the background tick is finer). */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** A failed check is not repeated inside this window — brief, not a full day. */
export const CHECK_BACKOFF_MS = 30 * 60 * 1000;
/** A check that takes longer than this counts as failed, so the status never sticks at `checking`. */
export const CHECK_TIMEOUT_MS = 30_000;

/** What the last check did. `'never'` = none attempted in this process yet. */
export type UpdateOutcome = 'ok' | 'failed' | 'never';

/**
 * - `idle` — nothing in flight, nothing downloaded.
 * - `checking` / `downloading` — in flight.
 * - `ready` — downloaded and verified; installs on quit, or now via "Install and restart".
 */
export type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'ready';

/** Everything Settings, Diagnostics and the tray need. Mirrored in `shared/ipc.ts`. */
export interface UpdateStatus {
  /** The opt-in setting. While false, no request is made at all. */
  enabled: boolean;
  /** `app.getVersion()`. */
  currentVersion: string;
  /** The newest version the last successful check saw, or null when none succeeded. */
  latestVersion: string | null;
  /** True only when `latestVersion` is newer than `currentVersion` (the backend's verdict). */
  updateAvailable: boolean;
  phase: UpdatePhase;
  /** 0–100 while `phase` is `downloading`, otherwise null. */
  downloadPercent: number | null;
  /** The downloaded version waiting to be installed, or null. */
  readyVersion: string | null;
  /** Epoch ms of the last check attempt in this process. */
  checkedAt: number | null;
  lastOutcome: UpdateOutcome;
  /** Short reason for the last failure; absent while the last attempt succeeded. */
  lastError?: string;
  /** {@link RELEASES_URL}. */
  source: string;
}

/** What a check found. `available` is the backend's semver verdict, never recomputed here. */
export interface UpdateCheckResult {
  version: string;
  available: boolean;
}

/** The seam to `electron-updater` (main/updater.ts) — a fake in tests. */
export interface UpdateBackend {
  check(): Promise<UpdateCheckResult>;
  /** Downloads and verifies the update the last check found. Rejects on any failure. */
  download(onProgress: (percent: number) => void): Promise<void>;
  /** Whether a downloaded update installs silently when the app quits. */
  setInstallOnQuit(enabled: boolean): void;
  /** Quits, installs silently and starts the new version. */
  installAndRestart(): void;
}

export interface UpdateServiceOptions {
  backend: UpdateBackend;
  currentVersion: string;
  enabled: boolean;
  now?: () => number;
  /** A download finished: called once per version, so main can ask "Install and restart?". */
  onReady?: (version: string) => void;
  /** Every status change — main broadcasts it to the renderer and rebuilds the tray menu. */
  onChange?: (status: UpdateStatus) => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

/** The first line only: `electron-updater` errors can carry a whole stack or HTTP body. */
function shortReason(error: unknown): string {
  const first = errorMessage(error).split(/\r?\n/, 1)[0]?.trim() ?? '';
  return first.length > 200 ? `${first.slice(0, 197)}…` : first || 'unknown error';
}

export class UpdateService {
  private readonly backend: UpdateBackend;
  private readonly currentVersion: string;
  private readonly now: () => number;
  private readonly onReady: (version: string) => void;
  private readonly onChange: (status: UpdateStatus) => void;
  private enabled: boolean;
  private phase: UpdatePhase = 'idle';
  private downloadPercent: number | null = null;
  private latestVersion: string | null = null;
  private updateAvailable = false;
  private readyVersion: string | null = null;
  private announcedVersion: string | null = null;
  private checkedAt: number | null = null;
  private lastSuccessAt: number | null = null;
  private lastOutcome: UpdateOutcome = 'never';
  private lastError: string | undefined;
  private inflight: Promise<void> | null = null;

  constructor(options: UpdateServiceOptions) {
    this.backend = options.backend;
    this.currentVersion = options.currentVersion;
    this.enabled = options.enabled;
    this.now = options.now ?? (() => Date.now());
    this.onReady = options.onReady ?? (() => undefined);
    this.onChange = options.onChange ?? (() => undefined);
    this.backend.setInstallOnQuit(this.enabled);
  }

  status(): UpdateStatus {
    const status: UpdateStatus = {
      enabled: this.enabled,
      currentVersion: this.currentVersion,
      latestVersion: this.latestVersion,
      updateAvailable: this.updateAvailable,
      phase: this.phase,
      downloadPercent: this.downloadPercent,
      readyVersion: this.readyVersion,
      checkedAt: this.checkedAt,
      lastOutcome: this.lastOutcome,
      source: RELEASES_URL,
    };
    if (this.lastError !== undefined) status.lastError = this.lastError;
    return status;
  }

  /** Follows the setting. Off also means a downloaded update no longer installs on quit. */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.backend.setInstallOnQuit(enabled);
    this.emit();
  }

  /**
   * Checks (and downloads) when due, or always with `force`. Resolves with the status once the
   * check — and a download it started — has settled. Never throws.
   */
  async refresh(options: { force?: boolean } = {}): Promise<UpdateStatus> {
    if (!this.enabled) return this.status();
    if (this.inflight) {
      await this.inflight;
      return this.status();
    }
    if (!options.force && !this.isDue()) return this.status();

    this.inflight = this.run().finally(() => {
      this.inflight = null;
    });
    await this.inflight;
    return this.status();
  }

  /** "Install and restart" — only once something is downloaded. Returns whether it started. */
  installAndRestart(): boolean {
    if (this.phase !== 'ready') return false;
    try {
      this.backend.installAndRestart();
      return true;
    } catch (error) {
      this.lastError = `install failed: ${shortReason(error)}`;
      this.emit();
      return false;
    }
  }

  private isDue(): boolean {
    // Downloaded already: the next step is the user's or the quit's, not another check.
    if (this.phase === 'ready') return false;
    const now = this.now();
    if (this.lastOutcome === 'failed' && this.checkedAt !== null && now - this.checkedAt < CHECK_BACKOFF_MS) {
      return false;
    }
    // A clock set back counts as "due" rather than as a window that closes in the far future.
    if (this.lastSuccessAt !== null && now >= this.lastSuccessAt && now - this.lastSuccessAt < CHECK_INTERVAL_MS) {
      return false;
    }
    return true;
  }

  private async run(): Promise<void> {
    const previousPhase = this.phase;
    this.phase = 'checking';
    this.checkedAt = this.now();
    this.emit();

    let result: UpdateCheckResult;
    try {
      result = await withTimeout(this.backend.check(), CHECK_TIMEOUT_MS);
    } catch (error) {
      this.fail(`check failed: ${shortReason(error)}`, previousPhase === 'ready' ? 'ready' : 'idle');
      return;
    }

    this.lastSuccessAt = this.now();
    this.latestVersion = result.version;
    this.updateAvailable = result.available;
    this.lastOutcome = 'ok';
    this.lastError = undefined;

    if (!result.available) {
      this.phase = previousPhase === 'ready' ? 'ready' : 'idle';
      this.emit();
      return;
    }
    if (previousPhase === 'ready' && this.readyVersion === result.version) {
      this.phase = 'ready';
      this.emit();
      return;
    }

    this.phase = 'downloading';
    this.downloadPercent = 0;
    this.emit();
    try {
      await this.backend.download((percent) => {
        const clamped = Math.max(0, Math.min(100, Math.round(percent)));
        if (clamped === this.downloadPercent) return;
        this.downloadPercent = clamped;
        this.emit();
      });
    } catch (error) {
      this.downloadPercent = null;
      this.fail(`download failed: ${shortReason(error)}`, 'idle');
      return;
    }

    this.phase = 'ready';
    this.downloadPercent = null;
    this.readyVersion = result.version;
    this.emit();
    if (this.announcedVersion !== result.version) {
      this.announcedVersion = result.version;
      try {
        this.onReady(result.version);
      } catch {
        // Asking is a courtesy; the update still installs on quit.
      }
    }
  }

  private fail(reason: string, phase: UpdatePhase): void {
    this.phase = phase;
    this.lastOutcome = 'failed';
    this.lastError = reason;
    this.emit();
  }

  private emit(): void {
    try {
      this.onChange(this.status());
    } catch {
      // A listener's failure is not an update failure.
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('request timed out')), ms);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
