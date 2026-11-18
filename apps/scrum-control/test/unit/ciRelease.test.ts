/**
 * `scripts/ci-release.ps1` against a throwaway repo with a bare origin and stubbed `npm` / `gh`,
 * so nothing real is built, pushed or published. The throwaway repo has this repository's shape:
 * the app lives in `apps/scrum-control/`, next to a `plugins/` tree whose releases (and commits)
 * are none of the app's business. The fixture exposes the stub log, env overrides for the `gh`
 * exit codes and a runner returning `{ code, output }`.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeTempDir } from '../fixtures/tempDir.ts';

/** `apps/scrum-control` - where the scripts, package.json and CHANGELOG.md live. */
const repoRoot = path.resolve(__dirname, '../..');
/** The repository root, where the workflows live. */
const gitRootDir = path.resolve(repoRoot, '../..');
const APP = 'apps/scrum-control';
const TAG_PREFIX = 'scrum-control-v';
/** The release lane's test run also writes the timing report that release.yml uploads. */
const NPM_TEST = 'npm test -- --reporter=default --reporter=json --outputFile.json=test-results/vitest.json';

// One stub for both tools: logs "<tool> <args>"; `npm run package` leaves the artifact the
// script expects; the exit codes of `gh release view|create` come from the environment.
const STUB = `import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const [name, ...args] = process.argv.slice(2);
appendFileSync(process.env.STUB_LOG, name + ' ' + args.join(' ') + '\\n');
if (name === 'npm' && args.join(' ') === 'run package') {
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  mkdirSync('release', { recursive: true });
  writeFileSync(path.join('release', 'ScrumControl-' + version + '-portable.exe'), 'stub exe');
}
if (name === 'gh') {
  const sub = args.slice(0, 2).join(' ');
  if (sub === 'release view') process.exit(Number(process.env.STUB_GH_VIEW_EXIT ?? 0));
  if (sub === 'release create') process.exit(Number(process.env.STUB_GH_CREATE_EXIT ?? 0));
}
`;

interface Fixture {
  dir: string;
  clone: string;
  origin: string;
  logPath: string;
  /** Lines the stubs logged, e.g. `npm test`, `npm run package`, `gh release create ...`. */
  log(): string[];
  git(...args: string[]): string;
  /** An empty commit: touches nothing, so it never counts as a change to the app. */
  commit(message: string): void;
  /** A commit that changes `file` (a path relative to the repository root). */
  commitAt(file: string, message: string): void;
  run(args?: string[], env?: Record<string, string>): { code: number | null; output: string };
}

const fixtures: Fixture[] = [];

async function makeFixture(options: { tagged?: boolean; version?: string } = {}): Promise<Fixture> {
  const tagged = options.tagged ?? true;
  const version = options.version ?? '1.0.0';
  const dir = await makeTempDir('ci-release-');
  const origin = path.join(dir, 'origin.git');
  const clone = path.join(dir, 'clone');
  const bin = path.join(dir, 'bin');
  const logPath = path.join(dir, 'stub.log');
  writeFileSync(logPath, '');

  const git = (...args: string[]): string => {
    const r = spawnSync('git', args, { cwd: clone, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
    return r.stdout;
  };

  spawnSync('git', ['init', '--bare', '-b', 'main', origin], { encoding: 'utf8' });
  mkdirSync(clone);
  git('init', '-b', 'main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.com');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'tag.gpgsign', 'false');
  git('remote', 'add', 'origin', origin);

  const app = path.join(clone, APP);
  mkdirSync(path.join(app, 'scripts'), { recursive: true });
  for (const f of ['ci-release.ps1', 'plan-release.ps1', 'release.ps1']) {
    cpSync(path.join(repoRoot, 'scripts', f), path.join(app, 'scripts', f));
  }
  writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'scrum-control', version }, null, 2) + '\n');
  writeFileSync(
    path.join(app, 'package-lock.json'),
    JSON.stringify(
      { name: 'scrum-control', version, lockfileVersion: 3, packages: { '': { name: 'scrum-control', version } } },
      null,
      2,
    ) + '\n',
  );
  writeFileSync(
    path.join(app, 'CHANGELOG.md'),
    `# Changelog\n\n## Unreleased\n\n- Something new.\n\n## ${version} — 2026-01-01\n\n- First release.\n`,
  );
  // The two files of the scrum-cockpit mod the app imports, and a plugin of its own.
  for (const f of ['plugins/scrum-cockpit/hooks/scan.ts', 'plugins/scrum-cockpit/types/index.d.ts', 'plugins/ai-scrum/README.md']) {
    mkdirSync(path.dirname(path.join(clone, f)), { recursive: true });
    writeFileSync(path.join(clone, f), 'initial\n');
  }
  git('add', '-A');
  git('commit', '-m', 'chore: initial');
  if (tagged) git('tag', '-a', `${TAG_PREFIX}${version}`, '-m', `scrum-control ${version}`);
  // -u: like a CI checkout, main tracks origin/main, so the script's bare `git push` has a target.
  git('push', '-u', '--follow-tags', 'origin', 'main');

  mkdirSync(bin);
  writeFileSync(path.join(bin, 'stub.mjs'), STUB);
  for (const name of ['npm', 'gh']) {
    writeFileSync(path.join(bin, `${name}.cmd`), `@node "%~dp0stub.mjs" ${name} %*\r\n`);
  }

  const shell = spawnSync('pwsh', ['-NoProfile', '-Command', 'exit 0']).error ? 'powershell' : 'pwsh';

  const fixture: Fixture = {
    dir,
    clone,
    origin,
    logPath,
    log: () => readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean),
    git,
    commit(message) {
      git('commit', '--allow-empty', '-m', message);
    },
    commitAt(file, message) {
      mkdirSync(path.dirname(path.join(clone, file)), { recursive: true });
      writeFileSync(path.join(clone, file), `${message}\n${Math.random()}\n`);
      git('add', '-A');
      git('commit', '-m', message);
    },
    run(args = [], env = {}) {
      const r = spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `${APP}/scripts/ci-release.ps1`, ...args], {
        cwd: clone,
        encoding: 'utf8',
        env: { ...process.env, ...env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`, STUB_LOG: logPath },
      });
      return { code: r.status, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
    },
  };
  fixtures.push(fixture);
  return fixture;
}

afterEach(() => {
  for (const f of fixtures.splice(0)) rmSync(f.dir, { recursive: true, force: true });
});

describe('ci-release test gate', () => {
  it('a docs-only push releases nothing and runs no tests', async () => {
    const fx = await makeFixture();
    fx.commitAt(`${APP}/README.md`, 'docs: reword the readme');

    const { code, output } = fx.run(['-DryRun']);

    expect(code, output).toBe(0);
    expect(output).toContain('nothing to release');
    expect(fx.log().filter((l) => l.startsWith('npm test'))).toEqual([]);
  });

  it('a due release runs the suite once before anything is committed', async () => {
    const fx = await makeFixture();
    fx.commitAt(`${APP}/src/thing.ts`, 'feat: add a thing');

    const { code, output } = fx.run(['-DryRun']);

    expect(code, output).toBe(0);
    const log = fx.log();
    expect(log.filter((l) => l === NPM_TEST)).toHaveLength(1);
    expect(log.indexOf(NPM_TEST)).toBeLessThan(log.indexOf('npm run package'));
    expect(output).toContain('=== test ===');
    expect(output.indexOf('=== test ===')).toBeLessThan(output.indexOf('[dry-run] git commit'));
  });

  it('the release workflow leaves testing to the script and says why', () => {
    const workflow = readFileSync(path.join(gitRootDir, '.github/workflows/scrum-control-release.yml'), 'utf8');
    expect(workflow).not.toContain('npm test');

    const lines = readFileSync(path.join(repoRoot, 'scripts/ci-release.ps1'), 'utf8').split(/\r?\n/);
    const testAt = lines.findIndex((l) => /^\s*&\s*npm test\b/.test(l));
    const gitAt = lines.findIndex((l) => /Invoke-Git @\(/.test(l));
    // The plan's bump=none exit is the last "nothing to release" before the tests; the earlier one is the tag-at-HEAD path.
    let nothingAt = -1;
    lines.forEach((l, i) => {
      if (i < testAt && l.includes('nothing to release')) nothingAt = i;
    });
    expect(lines.slice(nothingAt - 3, nothingAt + 1).some((l) => /bump -eq 'none'/.test(l))).toBe(true);
    expect(testAt).toBeGreaterThan(nothingAt);
    expect(testAt).toBeLessThan(gitAt);
    expect(lines.slice(testAt - 3, testAt).some((l) => /merge/i.test(l))).toBe(true);
  });
});

/** HEAD is the release commit of 1.1.0, tagged and pushed - what a run leaves behind once the tag is out. */
function tagRelease(fx: Fixture): void {
  const pkg = { name: 'scrum-control', version: '1.1.0' };
  writeFileSync(path.join(fx.clone, APP, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  writeFileSync(
    path.join(fx.clone, APP, 'package-lock.json'),
    JSON.stringify({ ...pkg, lockfileVersion: 3, packages: { '': pkg } }, null, 2) + '\n',
  );
  writeFileSync(
    path.join(fx.clone, APP, 'CHANGELOG.md'),
    '# Changelog\n\n## Unreleased\n\n## 1.1.0 — 2026-02-01\n\n- A new thing.\n\n## 1.0.0 — 2026-01-01\n\n- First release.\n',
  );
  fx.git('add', '-A');
  fx.git('commit', '-m', 'chore(release): scrum-control 1.1.0 [skip ci]');
  fx.git('tag', '-a', 'scrum-control-v1.1.0', '-m', 'scrum-control 1.1.0');
  fx.git('push', '--follow-tags');
}

describe('ci-release with a tag at HEAD', () => {
  it('a tag whose release creation failed is published by re-running the job', async () => {
    const fx = await makeFixture();
    fx.commitAt(`${APP}/src/thing.ts`, 'feat: add a thing');

    const failed = fx.run([], { STUB_GH_CREATE_EXIT: '1' });
    expect(failed.code, failed.output).not.toBe(0);
    const originGit = (...args: string[]) => fx.git(`--git-dir=${fx.origin}`, ...args);
    expect(originGit('tag', '--list', 'scrum-control-v1.1.0').trim()).toBe('scrum-control-v1.1.0');
    expect(originGit('log', '-1', '--format=%s', 'main').trim()).toBe('chore(release): scrum-control 1.1.0 [skip ci]');

    // Exactly the push the script performs, parsed from it.
    const pushCall = readFileSync(path.join(repoRoot, 'scripts/ci-release.ps1'), 'utf8').match(/Invoke-Git @\('push'((?:,\s*'[^']*')*)\)/);
    expect(pushCall, 'push call not found in ci-release.ps1').not.toBeNull();
    const pushArgs = ['push', ...[...(pushCall![1] ?? '').matchAll(/'([^']*)'/g)].map((m) => m[1] ?? '')];
    const originBefore = fx.git('ls-remote', 'origin');
    const repush = spawnSync('git', pushArgs, { cwd: fx.clone, encoding: 'utf8' });
    expect(repush.status, repush.stderr).toBe(0);
    expect(fx.git('ls-remote', 'origin')).toBe(originBefore);

    const head = fx.git('rev-parse', 'HEAD');
    const originTags = fx.git('ls-remote', '--tags', 'origin');
    const logBefore = fx.log().length;

    const { code, output } = fx.run([], { STUB_GH_VIEW_EXIT: '1', STUB_GH_CREATE_EXIT: '0' });

    expect(code, output).toBe(0);
    expect(output).toContain('=== recover ===');
    expect(output).toContain('notes from CHANGELOG: ## 1.1.0');
    const log = fx.log().slice(logBefore);
    expect(log.filter((l) => l.startsWith('npm test'))).toEqual([]);
    expect(log.filter((l) => l === 'npm run package')).toHaveLength(1);
    expect(log.filter((l) => l.startsWith('gh release create '))).toHaveLength(1);
    expect(log.filter((l) => l.startsWith('gh release create scrum-control-v1.1.0 '))).toHaveLength(1);
    // The two files the app's self-update looks for travel with the release.
    const create = log.find((l) => l.startsWith('gh release create ')) ?? '';
    expect(create).toContain('ScrumControl-1.1.0-portable.exe');
    expect(create).toContain('SHA256SUMS.txt');
    expect(create).toContain('Scrum Control 1.1.0');
    expect(fx.git('rev-parse', 'HEAD')).toBe(head);
    expect(fx.git('ls-remote', '--tags', 'origin')).toBe(originTags);
  });

  it("recovery in a dry run names the path and prints the version's notes heading", async () => {
    const fx = await makeFixture();
    tagRelease(fx);

    const { code, output } = fx.run(['-DryRun'], { STUB_GH_VIEW_EXIT: '1' });

    expect(code, output).toBe(0);
    expect(output).toContain('=== recover ===');
    expect(output).toContain('notes from CHANGELOG: ## 1.1.0');
    expect(output).toContain('[dry-run] gh release create scrum-control-v1.1.0');
    expect(output).toContain('- A new thing.');
  });

  it('a tag that already has its release is left alone', async () => {
    const fx = await makeFixture();
    tagRelease(fx);

    const { code, output } = fx.run([], { STUB_GH_VIEW_EXIT: '0' });

    expect(code, output).toBe(0);
    expect(output).toContain('scrum-control-v1.1.0 is already released');
    const log = fx.log();
    expect(log).toContain('gh release view scrum-control-v1.1.0');
    expect(log.filter((l) => l.startsWith('npm'))).toEqual([]);
    expect(log.filter((l) => l.startsWith('gh release create'))).toEqual([]);
  });
});

describe('ci-release in the shared repository', () => {
  it('a push that only touches plugins, or only a plugin tag, releases nothing', async () => {
    const fx = await makeFixture();
    fx.commitAt('plugins/ai-scrum/README.md', 'feat: a plugin feature');
    fx.commitAt('plugins/scrum-cockpit/hooks/register.tsx', 'fix: a cockpit-only fix');
    fx.git('tag', '-a', 'ai-scrum-v9.0.0', '-m', 'ai-scrum 9.0.0');

    const { code, output } = fx.run(['-DryRun']);

    expect(code, output).toBe(0);
    expect(output).toContain('bump=none');
    expect(output).toContain('nothing to release');
    expect(fx.log()).toEqual([]);
  });

  it('a change to scan.ts or the state contract counts, and the bump comes from the app tag only', async () => {
    const fx = await makeFixture();
    // A plugin tag newer than the app's must not become the range start.
    fx.commitAt('plugins/scrum-cockpit/hooks/scan.ts', 'feat: read a new field');
    fx.git('tag', '-a', 'scrum-cockpit-v9.0.0', '-m', 'scrum-cockpit 9.0.0');
    fx.commitAt('plugins/scrum-cockpit/types/index.d.ts', 'fix: widen the contract');

    const { code, output } = fx.run(['-DryRun']);

    expect(code, output).toBe(0);
    expect(output).toContain(`since=${TAG_PREFIX}1.0.0`);
    expect(output).toContain('commits=2');
    expect(output).toContain('bump=minor');
    expect(output).toContain('next=1.1.0');
    expect(output).toContain('[dry-run] git tag -a scrum-control-v1.1.0');
    expect(output).toContain('[dry-run] git commit -m chore(release): scrum-control 1.1.0 [skip ci]');
  });

  it('a tag that only resembles the app tag is not the last release', async () => {
    const fx = await makeFixture();
    fx.commitAt(`${APP}/src/thing.ts`, 'fix: a fix');
    fx.git('tag', '-a', 'scrum-control-v9.0.0-rc1', '-m', 'not a release');

    const { code, output } = fx.run(['-DryRun']);

    expect(code, output).toBe(0);
    expect(output).toContain(`since=${TAG_PREFIX}1.0.0`);
    expect(output).toContain('bump=patch');
  });

  it('before the first release a releasable push ships the version package.json carries, and -ForceBump is refused', async () => {
    const fx = await makeFixture({ tagged: false, version: '0.1.0' });
    fx.commitAt(`${APP}/src/thing.ts`, 'feat: add a thing');

    // Refused before anything is tested, built or written.
    const forced = fx.run(['-DryRun', '-ForceBump', 'patch']);
    expect(forced.code).not.toBe(0);
    expect(forced.output).toContain('-Version');
    expect(fx.log()).toEqual([]);

    const { code, output } = fx.run(['-DryRun']);
    expect(code, output).toBe(0);
    expect(output).toContain('bump=initial');
    expect(output).toContain('first release: 0.1.0');
    const log = fx.log();
    expect(log.filter((l) => l === NPM_TEST)).toHaveLength(1);
    expect(log.filter((l) => l === 'npm run package')).toHaveLength(1);
    expect(output).toContain('[dry-run] git tag -a scrum-control-v0.1.0');
    expect(output).toContain('[dry-run] gh release create scrum-control-v0.1.0');
    expect(JSON.parse(readFileSync(path.join(fx.clone, APP, 'package.json'), 'utf8')).version).toBe('0.1.0');
  });

  it('before the first release a history without a releasable commit releases nothing', async () => {
    const fx = await makeFixture({ tagged: false, version: '0.1.0' });
    fx.commitAt(`${APP}/README.md`, 'docs: reword the readme');

    const { code, output } = fx.run(['-DryRun']);

    expect(code, output).toBe(0);
    expect(output).toContain('no scrum-control-v* tag yet');
    expect(output).toContain('nothing to release');
    expect(fx.log()).toEqual([]);
  });

  it('-Version 0.1.0 makes the first release verbatim, at the version package.json already carries', async () => {
    const fx = await makeFixture({ tagged: false, version: '0.1.0' });

    const { code, output } = fx.run(['-DryRun', '-Version', '0.1.0']);

    expect(code, output).toBe(0);
    expect(output).toContain('explicit version 0.1.0');
    const log = fx.log();
    expect(log.filter((l) => l === NPM_TEST)).toHaveLength(1);
    expect(log.filter((l) => l === 'npm run package')).toHaveLength(1);
    expect(output).toContain('[dry-run] git tag -a scrum-control-v0.1.0');
    expect(output).toContain('[dry-run] gh release create scrum-control-v0.1.0');
    expect(output).toContain('ScrumControl-0.1.0-portable.exe');
    // Promoted, and the version in package.json untouched.
    const changelog = readFileSync(path.join(fx.clone, APP, 'CHANGELOG.md'), 'utf8');
    expect(changelog).toMatch(/## Unreleased[\s\S]*## 0\.1\.0 /);
    expect(JSON.parse(readFileSync(path.join(fx.clone, APP, 'package.json'), 'utf8')).version).toBe('0.1.0');
  });

  it('keeps the release notes rule: an empty Unreleased blocks a due release', async () => {
    const fx = await makeFixture();
    writeFileSync(
      path.join(fx.clone, APP, 'CHANGELOG.md'),
      '# Changelog\n\n## Unreleased\n\n## 1.0.0 — 2026-01-01\n\n- First release.\n',
    );
    fx.git('add', '-A');
    fx.git('commit', '-m', 'feat: add a thing without notes');

    const { code, output } = fx.run(['-DryRun']);

    expect(code, output).not.toBe(0);
    expect(output).toContain('RELEASE BLOCKED');
    expect(fx.log().filter((l) => l === 'npm run package')).toEqual([]);
  });
});
