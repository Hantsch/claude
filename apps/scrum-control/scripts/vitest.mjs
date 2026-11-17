// Runs Vitest from a working directory with an upper-case drive letter.
//
// VS Code's terminal and Claude Code's VS Code extension start shells in `c:\…`. Vitest then
// resolves itself under `c:/…` while the test files resolve it under `C:/…`, loads two copies,
// and every file fails with "failed to find the current suite". Neither `root` nor a
// `process.chdir` in the config can fix that: the CLI has already resolved by then.
import { spawnSync } from 'node:child_process';

const cwd = process.cwd().replace(/^[a-z]:/, (drive) => drive.toUpperCase());
const bin = `${cwd}/node_modules/vitest/vitest.mjs`;
const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { cwd, stdio: 'inherit' });
process.exit(result.status ?? 1);
