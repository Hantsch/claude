/**
 * The Diagnostics state line for the opt-in self-update. Mirrors `SettingsView.tsx`'s inline
 * `formatModelWindowsLine` for the exact-context-window row, but lives in its own file — this
 * project's `test/unit/` has no component-testing library, so the wording is unit tested here
 * rather than through the JSX.
 */

import type { UpdateStatus } from '../../shared/ipc.ts';
import { formatDateTime } from './format.ts';

/** `1.3.0` and `v1.3.0` both read as `v1.3.0`. */
export function withV(version: string): string {
  return /^v/i.test(version) ? version : `v${version}`;
}

/** What the updater is doing right now, in a few words. */
export function formatUpdatePhase(status: UpdateStatus): string {
  switch (status.phase) {
    case 'checking':
      return 'checking…';
    case 'downloading':
      return status.downloadPercent === null
        ? `downloading ${withV(status.latestVersion ?? '?')}`
        : `downloading ${withV(status.latestVersion ?? '?')} (${status.downloadPercent}%)`;
    case 'ready':
      return `${withV(status.readyVersion ?? '?')} ready — installs on quit`;
    default:
      return status.updateAvailable ? `${withV(status.latestVersion ?? '?')} available` : 'up to date';
  }
}

export function formatUpdateStatusLine(status: UpdateStatus): string {
  if (!status.enabled) return 'off — no network requests';
  const parts: string[] = [
    'on',
    withV(status.currentVersion),
    status.checkedAt === null ? 'never checked' : `checked ${formatDateTime(status.checkedAt)}`,
  ];
  if (status.checkedAt !== null || status.phase !== 'idle') parts.push(formatUpdatePhase(status));
  if (status.lastOutcome === 'failed') {
    parts.push(status.lastError ? `last attempt failed: ${status.lastError}` : 'last attempt failed');
  }
  return parts.join(' · ');
}
