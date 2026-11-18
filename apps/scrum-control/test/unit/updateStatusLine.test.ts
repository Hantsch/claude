/**
 * `formatUpdateStatusLine` — the Diagnostics state line for the opt-in self-update, extracted
 * from `SettingsView.tsx` so it is unit testable (this project's `test/unit/` has no
 * component-testing library). Covers up to date, downloading, ready, failed and disabled.
 */

import { describe, expect, it } from 'vitest';
import type { UpdateStatus } from '../../src/shared/ipc.ts';
import { formatUpdatePhase, formatUpdateStatusLine } from '../../src/renderer/lib/updateStatusLine.ts';

const base: UpdateStatus = {
  enabled: true,
  currentVersion: '1.0.0',
  latestVersion: '1.0.0',
  updateAvailable: false,
  phase: 'idle',
  downloadPercent: null,
  readyVersion: null,
  checkedAt: new Date(2026, 8, 8, 12, 30).getTime(),
  lastOutcome: 'ok',
  source: 'https://github.com/Hantsch/claude/releases',
};

describe('formatUpdateStatusLine', () => {
  it('shows current version, last check time and "up to date"', () => {
    const line = formatUpdateStatusLine(base);
    expect(line).toContain('v1.0.0');
    expect(line).toContain('2026-09-08');
    expect(line).toContain('up to date');
    expect(line).not.toContain('failed');
  });

  it('shows download progress while downloading', () => {
    const line = formatUpdateStatusLine({
      ...base,
      latestVersion: '1.1.0',
      updateAvailable: true,
      phase: 'downloading',
      downloadPercent: 42,
    });
    expect(line).toContain('downloading v1.1.0 (42%)');
  });

  it('names the downloaded version and that it installs on quit', () => {
    const line = formatUpdateStatusLine({
      ...base,
      latestVersion: '1.1.0',
      updateAvailable: true,
      phase: 'ready',
      readyVersion: '1.1.0',
    });
    expect(line).toContain('v1.1.0 ready — installs on quit');
  });

  it('shows the failure reason when the last attempt failed', () => {
    const line = formatUpdateStatusLine({
      ...base,
      checkedAt: null,
      latestVersion: null,
      lastOutcome: 'failed',
      lastError: 'check failed: request timed out',
    });
    expect(line).toContain('last attempt failed: check failed: request timed out');
    expect(line).toContain('never checked');
  });

  it('shows off with no network-request noise when disabled', () => {
    const line = formatUpdateStatusLine({ ...base, enabled: false });
    expect(line).toBe('off — no network requests');
    expect(line).not.toContain('v1.0.0');
    expect(line).not.toContain('checked');
  });
});

describe('formatUpdatePhase', () => {
  it('reads an available but not yet downloaded update as available', () => {
    expect(formatUpdatePhase({ ...base, latestVersion: 'v2.0.0', updateAvailable: true })).toBe('v2.0.0 available');
  });

  it('says checking while a check is in flight', () => {
    expect(formatUpdatePhase({ ...base, phase: 'checking' })).toBe('checking…');
  });
});
