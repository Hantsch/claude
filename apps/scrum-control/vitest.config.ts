import { defineConfig } from 'vitest/config';

// A shell whose working directory has a lower-case drive letter (`c:\…`, as VS Code's terminal and
// some agents start it) makes Vitest load `test/setup.ts` through two module ids — `c:/…` and
// `C:/…` — and every file then fails with "failed to find the current suite". Pinning the root to
// an upper-case drive letter keeps one id.
const root = process.cwd().replace(/^[a-z]:/, (drive) => drive.toUpperCase());

export default defineConfig({
  root,
  test: {
    // core/ is testable with plain Node against fixtures — no Electron (§3, §10).
    environment: 'node',
    include: ['test/unit/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});
