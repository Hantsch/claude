/**
 * Pure release logic: semver compare, SHA256SUMS.txt parsing, asset URL extraction
 * (story 019, D2).
 */

import { describe, expect, it } from 'vitest';
import {
  isUpdateAvailable,
  parseSha256Sums,
  portableExeUrl,
  releaseTag,
  selectLatestRelease,
  sha256For,
  sumsFileUrl,
} from '../../src/core/updates/releaseInfo.ts';

describe('isUpdateAvailable', () => {
  it('is false when the candidate is older', () => {
    expect(isUpdateAvailable('1.3.0', 'v1.2.0')).toBe(false);
  });

  it('is false when the candidate equals the installed version', () => {
    expect(isUpdateAvailable('1.3.0', 'v1.3.0')).toBe(false);
    expect(isUpdateAvailable('1.3.0', '1.3.0')).toBe(false);
  });

  it('is true when the candidate is newer', () => {
    expect(isUpdateAvailable('1.2.9', 'v1.3.0')).toBe(true);
    expect(isUpdateAvailable('1.2.9', '2.0.0')).toBe(true);
  });

  it('never treats a locally-newer-than-latest build as an update', () => {
    expect(isUpdateAvailable('2.0.0', 'v1.9.9')).toBe(false);
  });

  it('returns false, not throw, for malformed version strings', () => {
    expect(isUpdateAvailable('not-a-version', 'v1.0.0')).toBe(false);
    expect(isUpdateAvailable('1.0.0', 'not-a-version')).toBe(false);
    expect(isUpdateAvailable('', '')).toBe(false);
  });
});

describe('parseSha256Sums', () => {
  it('parses a line in the exact producing format written by scripts/ci-release.ps1', () => {
    const content =
      'a3f5c1e9b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f4a6 *ScrumControl-1.3.0-portable.exe\n';
    const sums = parseSha256Sums(content);
    expect(sums['ScrumControl-1.3.0-portable.exe']).toBe(
      'a3f5c1e9b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f4a6',
    );
    expect(sha256For(sums, 'ScrumControl-1.3.0-portable.exe')).toBe(
      'a3f5c1e9b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f4a6',
    );
  });

  it('returns null from sha256For when the filename is absent', () => {
    const sums = parseSha256Sums(
      'a3f5c1e9b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f4a6 *ScrumControl-1.3.0-portable.exe\n',
    );
    expect(sha256For(sums, 'nope.exe')).toBeNull();
  });

  it('skips malformed lines instead of throwing', () => {
    const content = ['not a valid line', '', 'zz *bad-hash.exe'].join('\n');
    expect(parseSha256Sums(content)).toEqual({});
  });
});

describe('release asset URL extraction', () => {
  const validRelease = {
    tag_name: 'scrum-control-v1.3.0',
    assets: [
      {
        name: 'ScrumControl-1.3.0-portable.exe',
        browser_download_url: 'https://example.com/ScrumControl-1.3.0-portable.exe',
      },
      {
        name: 'SHA256SUMS.txt',
        browser_download_url: 'https://example.com/SHA256SUMS.txt',
      },
    ],
  };

  it('extracts the portable exe url by pattern, not exact name', () => {
    expect(portableExeUrl(validRelease)).toBe('https://example.com/ScrumControl-1.3.0-portable.exe');
  });

  it('extracts the sums file url', () => {
    expect(sumsFileUrl(validRelease)).toBe('https://example.com/SHA256SUMS.txt');
  });

  it('extracts the release tag', () => {
    expect(releaseTag(validRelease)).toBe('scrum-control-v1.3.0');
  });

  it('returns null (not throw) when the exe asset is missing', () => {
    const missingExe = {
      tag_name: 'scrum-control-v1.3.0',
      assets: [{ name: 'SHA256SUMS.txt', browser_download_url: 'https://example.com/SHA256SUMS.txt' }],
    };
    expect(portableExeUrl(missingExe)).toBeNull();
  });

  it('returns null for missing/malformed payloads without throwing', () => {
    expect(portableExeUrl(null)).toBeNull();
    expect(portableExeUrl(undefined)).toBeNull();
    expect(portableExeUrl({})).toBeNull();
    expect(portableExeUrl({ assets: 'not-an-array' })).toBeNull();
    expect(sumsFileUrl({})).toBeNull();
    expect(releaseTag({})).toBeNull();
    expect(releaseTag(null)).toBeNull();
  });
});

describe('selectLatestRelease', () => {
  const release = (tag: string, extra: Record<string, unknown> = {}) => ({ tag_name: tag, assets: [], ...extra });

  it('takes the highest scrum-control version, not the first or the most recently published', () => {
    const picked = selectLatestRelease([
      release('scrum-control-v0.9.0'),
      release('scrum-control-v0.10.0'),
      release('scrum-control-v0.2.5'),
    ]);
    expect(picked?.tag).toBe('scrum-control-v0.10.0');
    expect(picked?.version).toBe('v0.10.0');
  });

  it('ignores plugin releases, however high their number', () => {
    const picked = selectLatestRelease([
      release('ai-scrum-v4.13.0'),
      release('tech-rules-v2.7.0'),
      release('scrum-control-v0.1.0'),
      release('common-v99.0.0'),
    ]);
    expect(picked?.tag).toBe('scrum-control-v0.1.0');
  });

  it('skips drafts and pre-releases', () => {
    const picked = selectLatestRelease([
      release('scrum-control-v3.0.0', { draft: true }),
      release('scrum-control-v2.0.0', { prerelease: true }),
      release('scrum-control-v1.0.0', { draft: false, prerelease: false }),
    ]);
    expect(picked?.tag).toBe('scrum-control-v1.0.0');
  });

  it('returns the release object itself, usable with the asset helpers', () => {
    const entry = {
      tag_name: 'scrum-control-v0.1.0',
      assets: [
        { name: 'ScrumControl-0.1.0-portable.exe', browser_download_url: 'https://example.com/a.exe' },
        { name: 'SHA256SUMS.txt', browser_download_url: 'https://example.com/sums' },
      ],
    };
    const picked = selectLatestRelease([release('ai-scrum-v1.0.0'), entry]);
    expect(portableExeUrl(picked?.release)).toBe('https://example.com/a.exe');
    expect(sumsFileUrl(picked?.release)).toBe('https://example.com/sums');
  });

  it('accepts only an exact scrum-control-v<semver> tag', () => {
    expect(
      selectLatestRelease([
        release('scrum-control-v1.0.0-rc1'),
        release('scrum-control-v1.0'),
        release('v1.0.0'),
        release('my-scrum-control-v1.0.0'),
        release('scrum-control-v1.0.0 '),
      ]),
    ).toBeNull();
  });

  it('returns null, not throw, for an empty list, a non-list and malformed entries', () => {
    expect(selectLatestRelease([])).toBeNull();
    expect(selectLatestRelease(null)).toBeNull();
    expect(selectLatestRelease({ tag_name: 'scrum-control-v1.0.0' })).toBeNull();
    expect(selectLatestRelease([null, 7, 'x', {}, { tag_name: 5 }])).toBeNull();
  });
});
