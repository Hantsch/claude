import { defineConfig } from 'vitest/config';

// A shell whose working directory has a lower-case drive letter (`c:\…`, as VS Code's terminal and
// some agents start it) makes Vitest load `test/setup.ts` through two module ids — `c:/…` and
// `C:/…` — and every file then fails with "failed to find the current suite". Pinning the root to
// an upper-case drive letter keeps one id.
const root = process.cwd().replace(/^[a-z]:/, (drive) => drive.toUpperCase());

// `core/scrum` imports the scrum-cockpit mod's parser by relative path (CONCEPT §4). esbuild looks
// up the nearest tsconfig of every file it transforms, and the plugin's own one extends a file the
// Claude Code engine writes when it loads the plugin: absent in a clean checkout, so the lookup
// fails. A raw tsconfig given as a string turns the lookup off; it repeats what tsconfig.node.json
// says about how TypeScript is compiled here.
const NODE_TSCONFIG_RAW = JSON.stringify({
  compilerOptions: { target: 'ES2023', useDefineForClassFields: true, verbatimModuleSyntax: true },
});

export default defineConfig({
  root,
  esbuild: { tsconfigRaw: NODE_TSCONFIG_RAW },
  test: {
    // core/ is testable with plain Node against fixtures — no Electron (§3, §10).
    environment: 'node',
    include: ['test/unit/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});
